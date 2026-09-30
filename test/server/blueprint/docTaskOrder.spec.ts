// @vitest-environment node
// The document tasks the new-build form lists, most-used first: the form opens on the first, so it must be the one
// people come for (polishing a document), not whichever task's slug sorts first.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { listPacks } from "../../../server/blueprint/packs";

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");

describe("the shipped document tasks", () => {
  it("are listed most-used first", async () => {
    const packs = await listPacks([{ dir: PACKS_ROOT, source: "builtin" }]);
    const documentTasks = packs.filter((pack) => pack.manifest.kind === "usecase" && pack.manifest.bases.includes("docs")).map((pack) => pack.slug);
    expect(documentTasks).toEqual(["polish", "review", "verify", "ask", "summarize", "compare", "write", "style", "glossary", "adopt"]);
  });
});
