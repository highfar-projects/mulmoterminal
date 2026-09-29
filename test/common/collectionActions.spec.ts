import { describe, it, expect } from "vitest";
import { toCollectionActionGroups } from "../../common/collectionActions";

// #2471. The palette reads GET /api/collections/actions through this: anything malformed is dropped.
describe("toCollectionActionGroups", () => {
  it("keeps well-formed groups and actions, an action's icon when it has one", () => {
    const body = {
      collections: [
        {
          slug: "inv",
          title: "Invoices",
          icon: "receipt",
          actions: [
            { id: "sum", label: "Summarise", icon: "summarize" },
            { id: "chase", label: "Chase" },
          ],
        },
      ],
    };
    expect(toCollectionActionGroups(body)).toEqual([
      {
        slug: "inv",
        title: "Invoices",
        icon: "receipt",
        actions: [
          { id: "sum", label: "Summarise", icon: "summarize" },
          { id: "chase", label: "Chase" },
        ],
      },
    ]);
  });

  it("drops a malformed action, a group left with none, and a body that is not the shape", () => {
    expect(toCollectionActionGroups({ collections: [{ slug: "inv", title: "Invoices", icon: "x", actions: [{ id: 1, label: "Bad" }] }] })).toEqual([]);
    expect(toCollectionActionGroups({ collections: [{ title: "No slug", actions: [] }] })).toEqual([]);
    expect(toCollectionActionGroups(null)).toEqual([]);
    expect(toCollectionActionGroups({ collections: "nope" })).toEqual([]);
  });
});
