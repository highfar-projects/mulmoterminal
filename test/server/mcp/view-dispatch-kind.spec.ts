// @vitest-environment node
import { describe, it, expect } from "vitest";
import { undeclaredKindRefusal } from "../../../server/mcp/view-dispatch-kind.js";
import { toolDefinitions } from "../../../server/infra/tools/plugins-registry.js";

const withoutKind = { name: "presentSpreadsheet", parameters: { properties: { title: {}, sheets: {} } } };
const enumKind = { name: "manageAccounting", parameters: { properties: { kind: { enum: ["balance", "pl", "ledger"] } } } };
const openKind = { name: "freeKind", parameters: { properties: { kind: { type: "string" } } } };

// The kinds the app's Views send on /api/plugin/<tool>, read off the routers that branch on them.
const VIEW_KINDS = [
  "loadHtml",
  "saveHtml",
  "packHtml",
  "loadShape",
  "saveShape",
  "loadSpreadsheet",
  "saveSpreadsheet",
  "save",
  "pendingGenerations",
  "movieStatus",
];

describe("undeclaredKindRefusal", () => {
  it("lets a call without `kind` through", () => {
    expect(undeclaredKindRefusal("presentSpreadsheet", withoutKind, { title: "T", sheets: [] })).toBeNull();
    expect(undeclaredKindRefusal("presentSpreadsheet", withoutKind, {})).toBeNull();
  });

  it("ignores arguments that are not an object, and an inherited `kind`", () => {
    [undefined, null, "kind", 1, ["kind"], Object.create({ kind: "saveSpreadsheet" })].forEach((args) => {
      expect(undeclaredKindRefusal("presentSpreadsheet", withoutKind, args)).toBeNull();
    });
  });

  it("refuses any `kind` a tool does not declare, whatever its value", () => {
    ["saveSpreadsheet", "", 0, null, false, { a: 1 }, ["save"]].forEach((kind) => {
      expect(undeclaredKindRefusal("presentSpreadsheet", withoutKind, { kind })).toMatch(/does not take kind=/);
    });
  });

  it("refuses a tool missing from the registry when it names a `kind`", () => {
    expect(undeclaredKindRefusal("ghost", undefined, { kind: "x" })).toMatch(/Tool "ghost"/);
    expect(undeclaredKindRefusal("ghost", undefined, {})).toBeNull();
  });

  it("lets a declared enum value through and refuses anything else", () => {
    ["balance", "pl", "ledger"].forEach((kind) => expect(undeclaredKindRefusal("manageAccounting", enumKind, { kind })).toBeNull());
    ["saveSpreadsheet", "PL", "", null].forEach((kind) => expect(undeclaredKindRefusal("manageAccounting", enumKind, { kind })).not.toBeNull());
  });

  it("lets any value through when `kind` is declared without an enum", () => {
    expect(undeclaredKindRefusal("freeKind", openKind, { kind: "anything" })).toBeNull();
  });
});

describe("undeclaredKindRefusal over the registered tools", () => {
  it("refuses every View-only kind on every tool that does not offer it", () => {
    toolDefinitions.forEach((tool) => {
      const declared = tool.parameters?.properties?.["kind"]?.enum ?? [];
      VIEW_KINDS.filter((kind) => !declared.includes(kind)).forEach((kind) => {
        expect(undeclaredKindRefusal(tool.name, tool, { kind }), `${tool.name} kind=${kind}`).not.toBeNull();
      });
    });
  });

  it("keeps every declared kind working", () => {
    const declaring = toolDefinitions.filter((tool) => tool.parameters?.properties?.["kind"] !== undefined);
    expect(declaring.map((tool) => tool.name).sort()).toEqual(["google", "manageAccounting"]);
    declaring.forEach((tool) => {
      (tool.parameters?.properties?.["kind"]?.enum ?? []).forEach((kind) => {
        expect(undeclaredKindRefusal(tool.name, tool, { kind }), `${tool.name} kind=${kind}`).toBeNull();
      });
    });
  });
});
