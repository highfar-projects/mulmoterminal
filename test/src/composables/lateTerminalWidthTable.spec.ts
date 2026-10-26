import { describe, it, expect, vi, afterEach } from "vitest";

const TABLE = { runs: [[0x2705, 0x2705, 2]], folding: "tmux-3.6a", vs16Wide: true };

const answering = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

// Fresh per test: the loader asks at most once per page.
const freshLoader = async () => {
  vi.resetModules();
  const state = await import("../../../src/composables/terminalUnicodeVersion");
  const { adoptLateTerminalWidthTable } = await import("../../../src/composables/lateTerminalWidthTable");
  return { state, adoptLateTerminalWidthTable };
};

describe("adoptLateTerminalWidthTable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adopts the table the server answers with once it has measured", async () => {
    const fetchMock = answering({ terminalWidthTable: TABLE });
    vi.stubGlobal("fetch", fetchMock);
    const { state, adoptLateTerminalWidthTable } = await freshLoader();
    await adoptLateTerminalWidthTable();
    expect(state.getTerminalWidthTable()).toEqual(TABLE);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/config/terminal-widths");
  });

  it("does not ask twice while a request is held open", async () => {
    const fetchMock = answering({ terminalWidthTable: TABLE });
    vi.stubGlobal("fetch", fetchMock);
    const { adoptLateTerminalWidthTable } = await freshLoader();
    await Promise.all([adoptLateTerminalWidthTable(), adoptLateTerminalWidthTable()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ terminalWidthTable: TABLE })));
    vi.stubGlobal("fetch", fetchMock);
    const { state, adoptLateTerminalWidthTable } = await freshLoader();
    await adoptLateTerminalWidthTable();
    expect(state.getTerminalWidthTable()).toBeNull();
    await adoptLateTerminalWidthTable();
    expect(state.getTerminalWidthTable()).toEqual(TABLE);
  });

  it("does not replace a table that arrived some other way meanwhile", async () => {
    const newer = { runs: [[0x2705, 0x2705, 2]], folding: "tmux-3.4", vs16Wide: false };
    vi.stubGlobal("fetch", answering({ terminalWidthTable: TABLE }));
    const { state, adoptLateTerminalWidthTable } = await freshLoader();
    const asking = adoptLateTerminalWidthTable();
    state.setTerminalWidthTable(newer);
    await asking;
    expect(state.getTerminalWidthTable()).toEqual(newer);
  });

  it.each([
    ["a null table", answering({ terminalWidthTable: null })],
    ["a malformed table", answering({ terminalWidthTable: { runs: "x" } })],
    ["an error status", answering({}, 500)],
    ["a body that is not JSON", vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 }))],
    [
      "a failed request",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("network");
      }),
    ],
  ])("leaves the built-in table on %s", async (_label, fetchMock) => {
    vi.stubGlobal("fetch", fetchMock);
    const { state, adoptLateTerminalWidthTable } = await freshLoader();
    await expect(adoptLateTerminalWidthTable()).resolves.toBeUndefined();
    expect(state.getTerminalWidthTable()).toBeNull();
  });
});
