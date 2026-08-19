// @vitest-environment node
// The adapter's own contract. The 23 route specs that use it cover the ordinary cases by existing;
// what is pinned here is the translation between `inject`'s answer and the supertest-shaped
// response those specs assert against — the part that would otherwise be believed rather than
// checked (#1737).
import { describe, it, expect } from "vitest";
import express from "express";
import { routeCall, jsonPost } from "./routeCall";

const app = express();
app.use(express.json());
app.get("/json", (_req, res) => void res.json({ ok: true, count: 2 }));
app.get("/shouty-json", (_req, res) => void res.type("Application/JSON").send(JSON.stringify({ ok: true })));
app.get("/list", (_req, res) => void res.json([1, 2, 3]));
app.get("/broken-json", (_req, res) => void res.type("application/json").send("{not json"));
app.get("/text", (_req, res) => void res.type("text/plain").send("plain words"));
app.get("/bytes", (_req, res) => void res.type("application/octet-stream").send(Buffer.from("raw-bytes")));
app.get("/empty", (_req, res) => void res.status(204).end());
app.get("/empty-json", (_req, res) => void res.type("application/json").send(""));
app.get("/refused", (_req, res) => void res.status(403).json({ error: "no" }));
app.post("/echo", (req, res) => void res.json({ body: req.body, sawHeader: req.get("x-mt-session") ?? null }));

const call = routeCall(app);

describe("routeCall", () => {
  it("hands back the status and the parsed body, the way a spec already reads them", async () => {
    const res = await call("/json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, count: 2 });
  });

  // A media type is case-insensitive, so a route that sets the header by hand must still be read
  // as JSON rather than answered with `{}`.
  it("parses a JSON body whatever case the media type is written in", async () => {
    expect((await call("/shouty-json")).body).toEqual({ ok: true });
  });

  // A non-2xx is an ANSWER, not a throw: `hide-error-stacks.spec.ts` exists to assert on a 500's
  // body, and a helper that threw would make that spec impossible to write.
  it("answers a refusal rather than throwing", async () => {
    const res = await call("/refused");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no" });
  });

  // The two places this adapter deliberately differs from supertest, pinned so the doc comment on
  // `RouteResponse.body` cannot drift from what the code does — it already did once, saying the
  // empty-body case matched when supertest actually answers `""` (Codex on #1799).
  it("answers `{}` where supertest would answer an empty string or an array", async () => {
    expect((await call("/empty-json")).body).toEqual({}); // supertest: ""
    expect((await call("/list")).body).toEqual({}); // supertest: [1, 2, 3]
    // Neither loses anything: the bytes are still on `text`.
    expect((await call("/empty-json")).text).toBe("");
    expect((await call("/list")).text).toBe("[1,2,3]");
  });

  // supertest's own rule for a body it cannot parse as a JSON object, so specs that read
  // `res.body` off an HTML page or a 204 see what they saw before.
  it("gives `{}` for a body that is not a JSON object, and keeps the bytes in `text`", async () => {
    expect((await call("/text")).body).toEqual({});
    expect((await call("/text")).text).toBe("plain words");
    expect((await call("/empty")).body).toEqual({});
    expect((await call("/bytes")).text).toBe("raw-bytes");
  });

  // A body that CLAIMS to be JSON and is not is a broken route, and answering `{}` would let a
  // spec assert against it and pass. supertest throws here too — measured, not assumed.
  it("lets a malformed JSON body fail loudly", async () => {
    await expect(call("/broken-json")).rejects.toThrow(SyntaxError);
  });

  // An array IS valid JSON but is not a record: handing it back as one would let a spec read a
  // named field off it and get `undefined` with nothing to explain why. This is the one place the
  // adapter deliberately differs from supertest, which hands the array back — no spec in this repo
  // reads one off a route, and `text` still carries it.
  it("does not pass an array off as a record", async () => {
    const res = await call("/list");
    expect(res.body).toEqual({});
    expect(JSON.parse(res.text)).toEqual([1, 2, 3]);
  });

  it("lower-cases the header names, as Node and supertest both do", async () => {
    expect((await call("/json")).headers["content-type"]).toContain("application/json");
  });

  it("sends a JSON body the route can parse, and the caller's own headers with it", async () => {
    const res = await call("/echo", jsonPost({ a: 1 }, { "x-mt-session": "sess-1" }));
    expect(res.body).toEqual({ body: { a: 1 }, sawHeader: "sess-1" });
  });

  // `JSON.stringify` answers `undefined` for these, and the request would then go out with no body
  // under a content-type promising JSON — a spec failing for a reason it never wrote.
  // A caller passing headers must not be able to take the media type with them: the body is JSON
  // bytes either way, and a route that cannot parse them answers for an empty body instead.
  it("keeps the JSON media type whatever headers the caller passes", async () => {
    const res = await call("/echo", jsonPost({ a: 1 }, { "Content-Type": "text/plain", "x-mt-session": "s" }));
    expect(res.body).toEqual({ body: { a: 1 }, sawHeader: "s" });
  });

  it("refuses a value JSON cannot represent, rather than sending nothing", () => {
    expect(() => jsonPost(undefined)).toThrow(TypeError);
    expect(() => jsonPost(() => 1)).toThrow(/cannot send function/);
  });
});
