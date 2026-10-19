import { describe, it, expect } from "vitest";
import { cellFromField, csvSpreadsheet, MAX_SPREADSHEET_ROWS } from "../../../src/composables/csvSpreadsheet";

describe("cellFromField", () => {
  it("reads a plain decimal as a number", () => {
    expect(cellFromField("12")).toEqual({ v: 12 });
    expect(cellFromField("-3.5")).toEqual({ v: -3.5 });
    expect(cellFromField(".5")).toEqual({ v: 0.5 });
    expect(cellFromField("1e3")).toEqual({ v: 1000 });
    expect(cellFromField("0")).toEqual({ v: 0 });
  });

  it("keeps anything else as the text the file holds", () => {
    expect(cellFromField("1,200")).toEqual({ v: "1,200" });
    expect(cellFromField("5%")).toEqual({ v: "5%" });
    expect(cellFromField("007")).toEqual({ v: "007" });
    expect(cellFromField("2026-10-19")).toEqual({ v: "2026-10-19" });
    expect(cellFromField("")).toEqual({ v: "" });
    expect(cellFromField("Tokyo")).toEqual({ v: "Tokyo" });
  });

  it("does not let text from the file run as a formula", () => {
    expect(cellFromField("=SUM(A1:A9)")).toEqual({ v: "'=SUM(A1:A9)" });
    expect(cellFromField("+1")).toEqual({ v: "+1" });
  });
});

describe("csvSpreadsheet", () => {
  it("puts the rows on one sheet, header included, titled by the file name", () => {
    const result = csvSpreadsheet("store,sales\nShibuya,1200\nUeno,980\n", "sales.csv");
    expect(result).toEqual({
      kind: "sheet",
      rows: 3,
      args: {
        title: "sales.csv",
        sheets: [
          {
            name: "Data",
            data: [
              [{ v: "store" }, { v: "sales" }],
              [{ v: "Shibuya" }, { v: 1200 }],
              [{ v: "Ueno" }, { v: 980 }],
            ],
          },
        ],
      },
    });
  });

  it("reads a TSV by its tab, and a quoted field with the delimiter in it", () => {
    const tsv = csvSpreadsheet("a\tb\n1\t2", "t.tsv");
    expect(tsv.kind === "sheet" && tsv.args.sheets[0]?.data).toEqual([
      [{ v: "a" }, { v: "b" }],
      [{ v: 1 }, { v: 2 }],
    ]);
    const quoted = csvSpreadsheet('name,note\nx,"a, b"', "q.csv");
    expect(quoted.kind === "sheet" && quoted.args.sheets[0]?.data[1]).toEqual([{ v: "x" }, { v: "a, b" }]);
  });

  it("says an empty file is empty", () => {
    expect(csvSpreadsheet("", "e.csv")).toEqual({ kind: "empty" });
  });

  it("opens a file at the row limit, and refuses one past it", () => {
    const lines = (count: number): string => Array.from({ length: count }, (_, row) => String(row)).join("\n");
    expect(csvSpreadsheet(lines(MAX_SPREADSHEET_ROWS), "at.csv").kind).toBe("sheet");
    expect(csvSpreadsheet(lines(MAX_SPREADSHEET_ROWS + 1), "past.csv")).toEqual({ kind: "too-large", rows: MAX_SPREADSHEET_ROWS + 1 });
  });
});

describe("cellFromField — what is not a plain number", () => {
  it("keeps spellings Number() would accept but a person would not mean as a number", () => {
    ["0x1F", "1_000", "Infinity", "1e", "5-3", "--1", "", " "].forEach((field) => expect(cellFromField(field)).toEqual({ v: field }));
  });

  it("reads a number with surrounding spaces as that number", () => {
    expect(cellFromField(" 42 ")).toEqual({ v: 42 });
  });
});

describe("csvSpreadsheet — a byte-order mark", () => {
  it("is not part of the first header", () => {
    const result = csvSpreadsheet("\uFEFFstore,sales\nShibuya,1200", "bom.csv");
    expect(result.kind === "sheet" && result.args.sheets[0]?.data[0]).toEqual([{ v: "store" }, { v: "sales" }]);
  });
});
