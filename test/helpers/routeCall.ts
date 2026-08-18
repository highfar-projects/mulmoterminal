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
  /** Parsed JSON, or `{}` for a response that carries none — supertest's own rule, so a spec that
   *  reads `res.body` off a 204 or an HTML page sees what it saw before.
   *
   *  Typed as a record rather than `unknown` because that is what the specs already assert
   *  against: every `/api/*` route in this app answers a JSON OBJECT, and `unknown` would make
   *  each of two hundred existing assertions carry a guard to prove something the route's own
   *  spec proves elsewhere. Fields still come out `unknown`, so nothing here claims a shape. */
  body: Record<string, unknown>;
  text: string;
  /** Lower-cased names, as Node and supertest both report them. */
  headers: Record<string, string>;
}

const parsedBody = (text: string, contentType: string): Record<string, unknown> => {
  if (!contentType.includes("json") || text.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    // An array body is real JSON but not a record; handing it back as one would let a spec read
    // named fields off it and get `undefined` with no error anywhere. `text` still carries it.
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
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
export const jsonPost = (value: unknown, headers: Record<string, string> = {}): AppRequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(value),
});
