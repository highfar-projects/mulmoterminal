import { describe, it, expect } from "vitest";
import { isNewVariableName, newVariable, worktreeEnvOf, worktreeEnvRows } from "../../../src/components/dirWorktreeEnv";

describe("worktreeEnvRows", () => {
  it("reads the variables the loader keeps, in the file's order", () => {
    expect(worktreeEnvRows({ PORT: { kind: "port", base: 3000 }, DB: { kind: "slug", prefix: "app" }, CACHE: { kind: "slug" } })).toEqual([
      { name: "PORT", variable: { kind: "port", base: 3000 } },
      { name: "DB", variable: { kind: "slug", prefix: "app" } },
      { name: "CACHE", variable: { kind: "slug" } },
    ]);
  });

  it.each([
    ["a bad name", { "1PORT": { kind: "port", base: 3000 } }],
    ["a privileged port", { PORT: { kind: "port", base: 80 } }],
    ["a fractional port", { PORT: { kind: "port", base: 3000.5 } }],
    ["an unknown kind", { PORT: { kind: "range" } }],
    ["a prefix that is not text", { DB: { kind: "slug", prefix: 3 } }],
    ["not an object", "PORT"],
  ])("drops %s", (_label, value) => {
    expect(worktreeEnvRows(value)).toEqual([]);
  });
});

describe("worktreeEnvOf and new rows", () => {
  it("writes the rows back as the declaration", () => {
    expect(worktreeEnvOf([{ name: "PORT", variable: { kind: "port", base: 4000 } }])).toEqual({ PORT: { kind: "port", base: 4000 } });
    expect(worktreeEnvOf([])).toEqual({});
  });

  it("starts a port at 3000 and a slug bare", () => {
    expect(newVariable("port")).toEqual({ kind: "port", base: 3000 });
    expect(newVariable("slug")).toEqual({ kind: "slug" });
  });

  it("takes a new name only in the schema's shape and not already declared", () => {
    const rows = [{ name: "PORT", variable: newVariable("port") }];
    expect(isNewVariableName("DB_NAME", rows)).toBe(true);
    expect(isNewVariableName("PORT", rows)).toBe(false);
    expect(isNewVariableName("1DB", rows)).toBe(false);
    expect(isNewVariableName("", rows)).toBe(false);
  });
});
