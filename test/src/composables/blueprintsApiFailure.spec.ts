// What a refused call hands the UI: the server's English always, and its refusal only when it is one the UI knows.
import { describe, it, expect, vi, afterEach } from "vitest";
import { startRun } from "../../../src/composables/blueprintsApi";

const REQUEST = { projectDir: "/work", base: "docs", usecase: "review", answers: {} };

const answering = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe("a refused blueprint call", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries the refusal beside the English", async () => {
    answering(409, { error: "English", refusal: { code: "untrusted", dir: "/work" } });
    expect(await startRun(REQUEST)).toEqual({ ok: false, error: "English", refusal: { code: "untrusted", dir: "/work" } });
  });

  it.each([
    ["no refusal", { error: "English" }],
    ["a code this UI does not know", { error: "English", refusal: { code: "from-a-newer-server" } }],
    ["a refusal missing its values", { error: "English", refusal: { code: "untrusted" } }],
  ])("keeps only the English for %s", async (_label, body) => {
    answering(409, body);
    expect(await startRun(REQUEST)).toEqual({ ok: false, error: "English" });
  });

  it("names the status when the body says nothing", async () => {
    answering(500, {});
    expect(await startRun(REQUEST)).toEqual({ ok: false, error: "HTTP 500 from /api/blueprints/runs" });
  });
});
