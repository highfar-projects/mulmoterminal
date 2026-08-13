// @vitest-environment node
// Every spec the SERVER tsconfig claims opens by saying so.
//
// `@vitest-environment node` is what stops a spec that only touches fs and child processes from
// building a jsdom first — about 1.1s per file (#1331). A missing line is invisible: the spec
// still passes, only slower, so nothing catches it. #1331 converted 153 files, and eighteen more
// had been written without the line within two weeks.
//
// The roots come from tsconfig.test-server.json rather than a list here, because that file already
// decides which specs are server-side — and a second hand-kept list is exactly what orphaned
// appRequest.spec.ts (#1348).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_TSCONFIG = path.join(ROOT, "tsconfig.test-server.json");
const DECLARATION = "@vitest-environment node";

const includeRoots = (): string[] => {
  const { config } = ts.parseConfigFileTextToJson(SERVER_TSCONFIG, readFileSync(SERVER_TSCONFIG, "utf8"));
  const include: unknown = (config as { include?: unknown } | undefined)?.include;
  const patterns = Array.isArray(include) ? include.filter((p): p is string => typeof p === "string") : [];
  return [...new Set(patterns.map((pattern) => pattern.split("/**")[0]))];
};

const specsUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return specsUnder(full);
    return entry.name.endsWith(".spec.ts") ? [full] : [];
  });

// Only the comment block the file OPENS with: that is the one vitest reads the directive from,
// so the same line further down would be documentation rather than configuration.
const declaresNodeEnvironment = (source: string): boolean => {
  const lines = source.split("\n");
  const firstCode = lines.findIndex((line) => !line.trimStart().startsWith("//"));
  const opening = firstCode === -1 ? lines : lines.slice(0, firstCode);
  return opening.some((line) => line.includes(DECLARATION));
};

const specs = includeRoots().flatMap((root) => specsUnder(path.join(ROOT, root)));

describe("server-side specs declare the node environment", () => {
  it("has specs to check", () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it("every one of them declares it", () => {
    const missing = specs.filter((file) => !declaresNodeEnvironment(readFileSync(file, "utf8")));
    expect(missing.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});
