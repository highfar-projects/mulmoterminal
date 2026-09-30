// #2625. A directory's config opened in the Files pane gets the schema's completion and marks; the
// schema is asked for once, and a failed answer is not kept.
import { describe, it, expect, vi, beforeEach } from "vitest";

const tooling = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("codemirror-json-schema", () => ({
  jsonSchema: (schema: unknown) => {
    tooling.calls.push(schema);
    return ["schema-extension"];
  },
}));

const { dirConfigSchemaExtension, isDirConfigFile, resetDirConfigSchemaForTesting } = await import("../../../src/components/cmDirConfigSchema");

const SCHEMA = { type: "object", properties: { name: { type: "string" } } };
const answering = (...replies: [number, unknown][]) => {
  const fetches = vi.fn(async () => {
    const [status, body] = replies.shift() ?? [500, null];
    return new Response(JSON.stringify(body), { status });
  });
  globalThis.fetch = fetches as unknown as typeof fetch;
  return fetches;
};

beforeEach(() => {
  resetDirConfigSchemaForTesting();
  tooling.calls.length = 0;
});

describe("isDirConfigFile", () => {
  it("names the shared and the local config, in any folder", () => {
    [".mulmoterminal.json", ".mulmoterminal.local.json", "web/.mulmoterminal.json", "a\\\\b\\\\.mulmoterminal.json"].forEach((name) =>
      expect(isDirConfigFile(name)).toBe(true),
    );
    ["mulmoterminal.json", ".mulmoterminal.jsonc", "package.json", "x.mulmoterminal.json"].forEach((name) => expect(isDirConfigFile(name)).toBe(false));
  });
});

describe("dirConfigSchemaExtension", () => {
  it("builds the editor extension from the served schema, and asks for it once", async () => {
    const fetches = answering([200, SCHEMA]);
    expect(await dirConfigSchemaExtension()).toEqual(["schema-extension"]);
    expect(await dirConfigSchemaExtension()).toEqual(["schema-extension"]);
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(tooling.calls).toEqual([SCHEMA, SCHEMA]);
  });

  it("gives nothing for a failed or unusable answer, and asks again next time", async () => {
    const fetches = answering([500, null], [200, { type: "array" }], [200, SCHEMA]);
    expect(await dirConfigSchemaExtension()).toBeNull();
    expect(await dirConfigSchemaExtension()).toBeNull();
    expect(await dirConfigSchemaExtension()).toEqual(["schema-extension"]);
    expect(fetches).toHaveBeenCalledTimes(3);
  });
});
