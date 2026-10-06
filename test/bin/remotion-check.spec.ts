// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { missingRemotionPackages, remotionCheck, remotionCheckLine, remotionPackagesFromMulmocast, resolverFromMulmocast } from "../../bin/remotion-check.js";

const mulmocastRemotion: { REMOTION_PACKAGES: readonly string[] } = await import("mulmocast/remotion");

const LIST = ["remotion", "@remotion/bundler", "three"];

const roots: string[] = [];
const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "remotion-check-"));
  roots.push(root);
  return root;
};
const writePackage = (dir: string, json: Record<string, unknown>, files: Record<string, string> = {}) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(json));
  Object.entries(files).forEach(([name, body]) => {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), body);
  });
};
// `npx mulmoterminal`: both packages side by side in one `_npx/<hash>` entry under the home.
// `remotionExport` is the source of mulmocast's `./remotion` entry, or absent as before 2.14.0.
const npxLayout = (home: string, remotionExport?: string) => {
  const entry = join(home, ".npm", "_npx", "0123456789abcdef", "node_modules");
  const pkgDir = join(entry, "mulmoterminal");
  writePackage(pkgDir, { name: "mulmoterminal" });
  const exportsMap: Record<string, unknown> = { ".": { default: "./lib/index.js" } };
  const files: Record<string, string> = { "lib/index.js": "" };
  if (remotionExport !== undefined) {
    exportsMap["./remotion"] = { default: "./lib/index.remotion.js" };
    files["lib/index.remotion.js"] = remotionExport;
  }
  writePackage(join(entry, "mulmocast"), { name: "mulmocast", type: "module", exports: exportsMap }, files);
  return pkgDir;
};

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("remotionPackagesFromMulmocast", () => {
  it("reads the list mulmocast itself checks", async () => {
    const list = await remotionPackagesFromMulmocast(resolve("."));
    expect(list).toEqual(mulmocastRemotion.REMOTION_PACKAGES);
    expect(list?.length).toBeGreaterThan(0);
  });

  it("reads whatever list the installed mulmocast exports", async () => {
    const pkgDir = npxLayout(makeRoot(), `export const REMOTION_PACKAGES = ${JSON.stringify(LIST)};`);
    expect(await remotionPackagesFromMulmocast(pkgDir)).toEqual(LIST);
  });

  it("is null for a mulmocast without the remotion export", async () => {
    expect(await remotionPackagesFromMulmocast(npxLayout(makeRoot()))).toBeNull();
  });

  it.each([
    ["no list", "export const OTHER = 1;"],
    ["not an array", 'export const REMOTION_PACKAGES = "remotion";'],
    ["a non-string entry", "export const REMOTION_PACKAGES = ['remotion', 3];"],
    ["an entry that throws", "throw new Error('boom');"],
  ])("is null when the export has %s", async (_label, source) => {
    expect(await remotionPackagesFromMulmocast(npxLayout(makeRoot(), source))).toBeNull();
  });

  it("is null when mulmocast cannot be found", async () => {
    expect(await remotionPackagesFromMulmocast(join(makeRoot(), "nowhere"))).toBeNull();
  });
});

describe("missingRemotionPackages", () => {
  it("is empty when everything resolves", () => {
    expect(missingRemotionPackages(LIST, () => true)).toEqual([]);
  });

  it("is the whole list when nothing resolves", () => {
    expect(missingRemotionPackages(LIST, () => false)).toEqual(LIST);
  });

  it("keeps only the names that do not resolve, in list order", () => {
    expect(missingRemotionPackages(LIST, (name) => name === "@remotion/bundler")).toEqual(["remotion", "three"]);
  });

  it("is empty for an empty list", () => {
    expect(missingRemotionPackages([], () => false)).toEqual([]);
  });
});

describe("remotionCheckLine", () => {
  it("passes when nothing is missing", () => {
    expect(remotionCheckLine([], LIST.length)).toBe("  ✓ remotion — Remotion scenes in MulmoCast videos");
  });

  it("is optional, with the guide, when nothing is installed", () => {
    const line = remotionCheckLine(LIST, LIST.length);
    expect(line).toMatch(/^ {2}○ remotion — optional \(Remotion scenes in MulmoCast videos\)\n/);
    expect(line).not.toContain("missing:");
    expect(line).toContain("guide/en/mulmocast.html#remotion");
  });

  it("names what is missing from a partial install", () => {
    const line = remotionCheckLine(["three"], LIST.length);
    expect(line).toContain("installed only in part; missing: three");
    expect(line).toContain("guide/en/mulmocast.html#remotion");
  });
});

describe("remotionCheck", () => {
  const exportList = `export const REMOTION_PACKAGES = ${JSON.stringify(LIST)};`;

  it("checks the list mulmocast exports against what resolves from mulmocast", async () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home, exportList);
    writePackage(join(home, "node_modules", "remotion"), { name: "remotion" });
    expect(await remotionCheck(pkgDir)).toContain("missing: @remotion/bundler, three");
  });

  it("passes once every listed package resolves", async () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home, exportList);
    LIST.forEach((name) => writePackage(join(home, "node_modules", name), { name }));
    expect(await remotionCheck(pkgDir)).toBe("  ✓ remotion — Remotion scenes in MulmoCast videos");
  });

  it("prints nothing for a mulmocast that does not export the list", async () => {
    expect(await remotionCheck(npxLayout(makeRoot()))).toBeNull();
  });
});

describe("resolverFromMulmocast", () => {
  it("finds a package installed in the home's node_modules from inside an npx entry", () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home);
    writePackage(join(home, "node_modules", "remotion"), { name: "remotion" });
    const isResolvable = resolverFromMulmocast(pkgDir);
    expect(isResolvable).not.toBeNull();
    expect(isResolvable?.("remotion")).toBe(true);
    expect(isResolvable?.("three")).toBe(false);
  });

  it("counts a package whose exports hide its package.json as installed", () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home);
    writePackage(join(home, "node_modules", "three"), { name: "three", exports: { ".": { import: "./build/three.module.js" } } });
    expect(resolverFromMulmocast(pkgDir)?.("three")).toBe(true);
  });

  it("does not count a package whose package.json is malformed", () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home);
    mkdirSync(join(home, "node_modules", "remotion"), { recursive: true });
    writeFileSync(join(home, "node_modules", "remotion", "package.json"), "{ not json");
    expect(resolverFromMulmocast(pkgDir)?.("remotion")).toBe(false);
  });

  it("finds a package installed beside mulmocast", () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home);
    writePackage(join(home, ".npm", "_npx", "0123456789abcdef", "node_modules", "three"), { name: "three" });
    expect(resolverFromMulmocast(pkgDir)?.("three")).toBe(true);
  });

  it("is null when mulmocast itself cannot be found", () => {
    const root = makeRoot();
    writePackage(join(root, "app"), { name: "app" });
    expect(resolverFromMulmocast(join(root, "app"))).toBeNull();
  });

  it("is null for a directory that does not exist", () => {
    expect(resolverFromMulmocast(join(makeRoot(), "nowhere"))).toBeNull();
  });
});
