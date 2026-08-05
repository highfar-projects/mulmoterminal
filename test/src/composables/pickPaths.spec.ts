// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickPaths } from "../../../src/composables/pickPaths";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("pickPaths", () => {
  it("returns the chosen paths", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { paths: ["/a", "/b"] })));
    await expect(pickPaths()).resolves.toEqual({ paths: ["/a", "/b"], error: null });
  });

  it("asks for a folder only when told to", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { paths: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await pickPaths({ directory: true });
    await pickPaths();
    expect(fetchMock.mock.calls.map((c) => c[1]?.body)).toEqual(['{"directory":true}', '{"directory":false}']);
  });

  // A cancel is a 200 with no paths, and must NOT read as something to complain about.
  it("reports no error when the user cancels", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { paths: [] })));
    await expect(pickPaths()).resolves.toEqual({ paths: [], error: null });
  });

  // #1447: this is the whole bug. The route said what was wrong and every caller dropped it.
  it("carries the server's explanation for a 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "No file dialog on this host — install zenity" })));
    await expect(pickPaths()).resolves.toEqual({ paths: [], error: "No file dialog on this host — install zenity" });
  });

  it("still reports something when the failing body has no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })));
    const { error } = await pickPaths();
    expect(error).toContain("502");
  });

  it("reports a request that never got there", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    const { paths, error } = await pickPaths();
    expect(paths).toEqual([]);
    expect(error).toContain("Failed to fetch");
  });

  it("ignores non-string entries in the answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { paths: ["/a", 7, null] })));
    await expect(pickPaths()).resolves.toEqual({ paths: ["/a"], error: null });
  });
});
