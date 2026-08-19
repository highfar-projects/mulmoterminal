// A route call shaped like the supertest response the specs already assert against, but without a
// socket.
//
// `appRequest` returns a real `Response`, which is the right shape for a spec being written today.
// It is the wrong shape for the twenty that exist: they read `res.body` and `res.status` off a
// supertest response, and converting them field by field would rewrite hundreds of assertions to
// prove something about the transport. This keeps the assertions exactly as they are and changes
// only how the request is made.
//
// Why it has to change at all: supertest opens an ephemeral listener for every `request(app)` —
// `.listen(0)` by another name, which is why grepping for `listen(` found none of it. Every
// assertion then rides a real TCP round trip, and under a loaded runner that is what fails first,
// as `socket hang up` or `other side closed` (#1737, #1729).
import { appRequest, type AppRequestInit } from "./appRequest.js";
import type { Express } from "express";
import { isRecord } from "../../common/isRecord.js";

export interface RouteResponse {
  status: number;
  /** The parsed JSON object, or `{}` — for an empty body, a non-JSON body, and JSON that is not an
   *  object (an array, a bare string). Malformed JSON under a JSON content-type does NOT land here:
   *  it throws, the way supertest does.
   *
   *  The first two match supertest; the third does not — it hands the array back. That divergence
   *  is deliberate and is what this type buys: the specs assert against a record, `unknown` would
   *  make each of two hundred existing assertions carry a guard to prove something the route's own
   *  spec proves elsewhere, and nothing in this repo reads an array or a bare-string body off a
   *  route. `text` carries the bytes in every case. Measured behaviours are tabulated at
   *  `parsedBody` below. Fields still come out `unknown`, so nothing here claims a shape. */
  body: Record<string, unknown>;
  text: string;
  /** Lower-cased names, as Node and supertest both report them. */
  headers: Record<string, string>;
}

// Measured against supertest 7 rather than reasoned about, because this file's whole job is to
// answer the way it did (probe: express route -> `request(app).get(…)`):
//
//   malformed JSON under a JSON content-type   THROWS
//   an HTML body                                {}
//   an empty body                               "" (this returns {}, see below)
//   an array body                               the array (this returns {}, see below)
//
// The first is honoured exactly: a body that CLAIMS to be JSON and is not is a broken route, and
// swallowing it would let a migrated spec assert `res.body` against `{}` and pass (CodeRabbit on
// #1799). The last two diverge deliberately, and only where nothing depends on them: `body` is
// typed as a record here, no spec in this repo reads an array or a bare-string body off a route,
// and `text` carries the bytes in every case.
const parsedBody = (text: string, contentType: string): Record<string, unknown> => {
  if (!contentType.includes("json") || text.length === 0) return {};
  const parsed: unknown = JSON.parse(text); // deliberately unguarded — see above
  return isRecord(parsed) ? parsed : {};
};

/** `const call = routeCall(app)` then `await call("/api/x")`, or
 *  `await call("/api/x", { method: "POST", body: JSON.stringify(…) })`. */
export function routeCall(app: Express) {
  const request = appRequest(app);
  return async (url: string, init: AppRequestInit = {}): Promise<RouteResponse> => {
    const res = await request(url, init);
    const text = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return { status: res.status, body: parsedBody(text, headers["content-type"] ?? ""), text, headers };
  };
}

/** A JSON POST, which is what nearly every write route in this app takes. Spelled once here so a
 *  spec does not have to remember that `inject` sends the payload as-is and the route needs the
 *  header to parse it. Extra headers merge in — a session id, an `accept` a route branches on. */
export const jsonPost = (value: unknown, headers: Record<string, string> = {}): AppRequestInit => {
  // `JSON.stringify` answers `undefined` for `undefined`, a function and a symbol. The request
  // would then go out with NO body under a `content-type` promising JSON, and the route would
  // answer whatever it answers for an empty body — a spec failing for a reason it never wrote
  // (CodeRabbit on #1799). Refusing here says which call is wrong.
  const body = JSON.stringify(value);
  if (body === undefined) throw new TypeError(`jsonPost cannot send ${typeof value} — JSON has no representation for it`);
  return { method: "POST", headers: { "content-type": "application/json", ...headers }, body };
};
