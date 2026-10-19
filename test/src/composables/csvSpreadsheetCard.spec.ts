import { describe, it, expect, vi, afterEach } from "vitest";
import { csvSpreadsheetCard } from "../../../src/composables/csvSpreadsheetCard";
import { MAX_SPREADSHEET_ROWS } from "../../../src/composables/csvSpreadsheet";

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** fetch answering the text read with `text`, and the plugin POST with `plugin`. */
const stubFetch = (text: Response, plugin: Response = json(200, { title: "sales.csv", data: { sheets: "artifacts/spreadsheets/2026/10/x.json" } })) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return url.startsWith("/api/files/browse/text") ? text : plugin;
    }),
  );
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

describe("csvSpreadsheetCard", () => {
  it("reads the file through the pane's route and saves a spreadsheet copy", async () => {
    const calls = stubFetch(json(200, { text: "store,sales\nShibuya,1200\n" }));
    const result = await csvSpreadsheetCard("/proj", "data/sales.csv");
    expect(result).toEqual({
      kind: "card",
      card: { toolName: "presentSpreadsheet", data: { sheets: "artifacts/spreadsheets/2026/10/x.json" }, title: "sales.csv" },
    });
    expect(calls[0]?.url).toBe("/api/files/browse/text?cwd=%2Fproj&path=data%2Fsales.csv");
    expect(calls[1]?.url).toBe("/api/plugin/presentSpreadsheet");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      title: "sales.csv",
      sheets: [
        {
          name: "Data",
          data: [
            [{ v: "store" }, { v: "sales" }],
            [{ v: "Shibuya" }, { v: 1200 }],
          ],
        },
      ],
    });
  });

  it("refuses an empty file without saving anything", async () => {
    const calls = stubFetch(json(200, { text: "" }));
    expect(await csvSpreadsheetCard("/proj", "e.csv")).toEqual({ kind: "refused", refusal: { key: "filesRowMenu.spreadsheetEmpty", values: {} } });
    expect(calls).toHaveLength(1);
  });

  it("refuses a file past the row limit, and one past the route's size cap, as too large", async () => {
    const rows = Array.from({ length: MAX_SPREADSHEET_ROWS + 1 }, (_, row) => String(row)).join("\n");
    const tooLarge = { kind: "refused", refusal: { key: "filesRowMenu.spreadsheetTooLarge", values: { max: MAX_SPREADSHEET_ROWS } } };
    stubFetch(json(200, { text: rows }));
    expect(await csvSpreadsheetCard("/proj", "big.csv")).toEqual(tooLarge);
    stubFetch(json(413, { error: "too large" }));
    expect(await csvSpreadsheetCard("/proj", "huge.csv")).toEqual(tooLarge);
  });

  it("passes on the server's reason when a read or the save fails", async () => {
    stubFetch(json(404, { error: "no such file" }));
    expect(await csvSpreadsheetCard("/proj", "gone.csv")).toEqual({
      kind: "refused",
      refusal: { key: "filesRowMenu.spreadsheetFailed", values: { reason: "no such file" } },
    });
    stubFetch(json(200, { text: "a\n1" }), json(400, { error: "bad sheet" }));
    expect(await csvSpreadsheetCard("/proj", "a.csv")).toEqual({
      kind: "refused",
      refusal: { key: "filesRowMenu.spreadsheetFailed", values: { reason: "bad sheet" } },
    });
  });

  it("turns a network failure into a refusal rather than a rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await csvSpreadsheetCard("/proj", "a.csv")).toEqual({
      kind: "refused",
      refusal: { key: "filesRowMenu.spreadsheetFailed", values: { reason: "offline" } },
    });
  });
});
