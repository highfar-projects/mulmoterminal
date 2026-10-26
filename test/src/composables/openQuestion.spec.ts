// Reading the dialog a session is blocked on. `lookUpOpenQuestion` tells a failed read from "nothing
// is asked", which the board's reply gate depends on (#3185); `fetchOpenQuestion`, which the grid
// uses, answers null for both, as it always has.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOpenQuestion, lookUpOpenQuestion } from "../../../src/composables/openQuestion";

const question = { sessionId: "s", toolUseId: "t", questions: [{ question: "q", header: "h", options: [{ label: "a" }], multiSelect: false }] };

const answer = (make: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(make));

afterEach(() => vi.unstubAllGlobals());

describe("lookUpOpenQuestion", () => {
  it("reports the open dialog, or a successful read that found none", async () => {
    answer(async () => new Response(JSON.stringify({ question })));
    expect(await lookUpOpenQuestion("s")).toEqual({ ok: true, question });
    answer(async () => new Response(JSON.stringify({ question: null })));
    expect(await lookUpOpenQuestion("s")).toEqual({ ok: true, question: null });
    answer(async () => new Response(JSON.stringify({ question: { toolUseId: 1 } })));
    expect(await lookUpOpenQuestion("s")).toEqual({ ok: true, question: null });
  });

  it.each<[string, () => Promise<Response>]>([
    ["an error status", async () => new Response("{}", { status: 500 })],
    ["a body that is not JSON", async () => new Response("oops")],
    ["a body that is not an object", async () => new Response("[]")],
    ["a network failure", async () => Promise.reject(new Error("net"))],
  ])("is a failed lookup for %s, not an absence", async (_case, make) => {
    answer(make);
    expect(await lookUpOpenQuestion("s")).toEqual({ ok: false });
    answer(make);
    expect(await fetchOpenQuestion("s")).toBeNull();
  });
});
