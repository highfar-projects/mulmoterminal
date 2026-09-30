// @vitest-environment node
// The verify pack's product rule: an amount that claims to be the product of others (単価 × 数量, 小計 × 税率) is
// checked to the digits it is written to, rounded either way, and a malformed product is refused.
import { describe, expect, it } from "vitest";
import { shapeProblems, unquotedValues } from "../../../blueprints/verify/checks/facts.mjs";
import { factsText } from "../../../blueprints/verify/checks/factsView.mjs";
import { problemsIn, type Amount, type Product } from "../../../blueprints/verify/checks/rules.mjs";

const citation = (quote: string) => ({ source: "estimate.md", address: "h1", quote });
const amount = (id: string, value: number, unit = "円"): Amount => ({ id, label: id, value, unit, citation: citation(String(value)) });
const product = (id: string, value: number, of: string[], unit = "円"): Product => ({ ...amount(id, value, unit), of });
const problemsOf = (amounts: Amount[], products: Product[]) => problemsIn({ amounts, products });

describe("product-mismatch", () => {
  const line = [amount("price", 24800), amount("count", 5, "台")];
  const tax = [amount("subtotal", 12345), amount("rate", 10, "%")];

  it("passes a line that is its price times its quantity, and a tax that is its rate of the subtotal", () => {
    expect(problemsOf(line, [product("line", 124000, ["price", "count"])])).toEqual([]);
    expect(problemsOf([amount("subtotal", 810000), amount("rate", 10, "%")], [product("tax", 81000, ["subtotal", "rate"])])).toEqual([]);
  });

  it("reports a line that is not its price times its quantity, saying which way and by how much", () => {
    expect(problemsOf(line, [product("line", 120000, ["price", "count"])])).toEqual([
      {
        id: "product-mismatch-line",
        rule: "product-mismatch",
        entries: ["line"],
        detail: { written: 120000, product: 124000, unit: "円", writtenIs: "less", by: 4000 },
      },
    ]);
    expect(problemsOf(line, [product("line", 124001, ["price", "count"])])[0]?.detail).toMatchObject({ writtenIs: "more", by: 1 });
  });

  it("takes a fraction rounded either way at the digits it is written to, and nothing further", () => {
    const taxOf = (value: number) => problemsOf(tax, [product("tax", value, ["subtotal", "rate"])]).length;
    expect([taxOf(1234), taxOf(1235)]).toEqual([0, 0]);
    expect([taxOf(1233), taxOf(1236)]).toEqual([1, 1]);
    const cents = [amount("unit", 12.345, "USD"), amount("n", 3, "pcs")];
    const centsOf = (value: number) => problemsOf(cents, [product("sum", value, ["unit", "n"])]).length;
    expect([centsOf(37.03), centsOf(37.04), centsOf(37.02), centsOf(37.05)]).toEqual([0, 0, 1, 1]);
    // 37 is written to whole dollars, so 37.035 rounded down to it is right.
    expect([centsOf(37), centsOf(36)]).toEqual([0, 1]);
  });

  it("multiplies more than two factors, and a percentage as a hundredth", () => {
    const factors = [amount("nights", 2, "泊"), amount("rooms", 3, "室"), amount("rate", 9000)];
    expect(problemsOf(factors, [product("stay", 54000, ["nights", "rooms", "rate"])])).toEqual([]);
    expect(problemsOf([amount("base", 1000), amount("pct", 8, "%")], [product("t", 80, ["base", "pct"])])).toEqual([]);
    expect(problemsOf([amount("base", 1000), amount("pct", 8, "%")], [product("t", 8000, ["base", "pct"])])).toHaveLength(1);
  });

  it("finds nothing when there are no products", () => {
    expect(problemsIn({ amounts: line })).toEqual([]);
  });
});

describe("a product's shape", () => {
  const facts = (of: unknown) => ({ amounts: [amount("a", 2), amount("b", 3)], products: [{ ...amount("p", 6), of }] });

  it("names two or more amounts", () => {
    expect(shapeProblems(facts(["a", "b"]))).toEqual([]);
  });

  it.each([
    ["one factor", ["a"]],
    ["no factors", []],
    ["a factor that is not an amount", ["a", "z"]],
    ["no list", undefined],
  ])("refuses %s", (_name, of) => {
    expect(shapeProblems(facts(of)).join("\n")).toContain('"of" must list two or more ids of amounts');
  });

  it("refuses a product with no unit, like any amount", () => {
    expect(shapeProblems({ amounts: [amount("a", 2), amount("b", 3)], products: [{ ...product("p", 6, ["a", "b"]), unit: "" }] }).join("\n")).toContain(
      'needs a "unit"',
    );
  });

  it("wants its value in its own quotation", () => {
    expect(unquotedValues("products", { ...amount("p", 6), citation: citation("2 × 3 = 6") })).toEqual([]);
    expect(unquotedValues("products", { ...amount("p", 7), citation: citation("2 × 3 = 6") })).toEqual(["7"]);
  });
});

describe("a product in the facts a person reads", () => {
  it("shows what it multiplies, by label", () => {
    const text = factsText({
      amounts: [
        { ...amount("price", 24800), label: "単価" },
        { ...amount("count", 5, "台"), label: "数量" },
      ],
      products: [{ ...product("line", 120000, ["price", "count"]), label: "液晶モニター" }],
    });
    expect(text).toContain("- 液晶モニター 120,000 円 = 単価 × 数量 · estimate.md h1");
  });
});
