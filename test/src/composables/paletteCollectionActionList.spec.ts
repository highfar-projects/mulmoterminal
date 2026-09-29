import { describe, it, expect } from "vitest";
import { paletteCollectionActionList } from "../../../src/composables/paletteCollectionActionList";

// #2471. A collection action is named with its collection, and falls back to the collection's icon.
describe("paletteCollectionActionList", () => {
  it("names each action with its collection, one row per action", () => {
    expect(
      paletteCollectionActionList([
        {
          slug: "inv",
          title: "Invoices",
          icon: "receipt",
          actions: [
            { id: "sum", label: "Summarise", icon: "summarize" },
            { id: "chase", label: "Chase" },
          ],
        },
      ]),
    ).toEqual([
      { slug: "inv", id: "sum", label: "Invoices: Summarise", icon: "summarize" },
      { slug: "inv", id: "chase", label: "Invoices: Chase", icon: "receipt" },
    ]);
  });
});
