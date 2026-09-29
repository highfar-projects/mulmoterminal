// @vitest-environment node
import { describe, it, expect } from "vitest";
import { collectionActionIndex } from "./collectionActionIndex.js";

// #2471. What the palette lists: collections with collection-level actions, and only those actions.
const collection = (slug: string, collectionActions: unknown[] | undefined) => ({
  slug,
  schema: { title: `Title ${slug}`, icon: "star", dataPath: "d", primaryKey: "id", fields: {}, ...(collectionActions ? { collectionActions } : {}) },
});

describe("collectionActionIndex", () => {
  it("lists each collection's actions with its title and icon, keeping an action's own icon", () => {
    const index = collectionActionIndex([
      collection("invoices", [
        { id: "sum", label: "Summarise", icon: "summarize", kind: "chat", role: "general", template: "t.md" },
        { id: "chase", label: "Chase", kind: "agent", role: "general", template: "c.md" },
      ]),
    ] as never);
    expect(index).toEqual([
      {
        slug: "invoices",
        title: "Title invoices",
        icon: "star",
        actions: [
          { id: "sum", label: "Summarise", icon: "summarize" },
          { id: "chase", label: "Chase" },
        ],
      },
    ]);
  });

  it("leaves out collections with no collection-level action, and any mutate action", () => {
    const index = collectionActionIndex([
      collection("empty", undefined),
      collection("none", []),
      collection("mutateOnly", [{ id: "done", label: "Done", kind: "mutate", set: { status: "done" } }]),
    ] as never);
    expect(index).toEqual([]);
  });
});
