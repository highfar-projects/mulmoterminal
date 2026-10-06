// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { REMOTION_PACKAGES, missingRemotionPackages, remotionCheckLine, resolverFromMulmocast } from "../../bin/remotion-check.js";

const mulmocastPackages: { REMOTION_PACKAGES: readonly string[] } = await import(
  pathToFileURL(resolve("node_modules/mulmocast/lib/utils/remotion/packages.js")).href
);

describe("REMOTION_PACKAGES", () => {
  it("is the list mulmocast's own pre-flight checks", () => {
    expect(REMOTION_PACKAGES).toEqual(mulmocastPackages.REMOTION_PACKAGES);
  });
});

describe("missingRemotionPackages", () => {
  it("is empty when everything resolves", () => {
    expect(missingRemotionPackages(() => true)).toEqual([]);
  });

  it("is the whole list when nothing resolves", () => {
    expect(missingRemotionPackages(() => false)).toEqual([...REMOTION_PACKAGES]);
  });

  it("keeps only the names that do not resolve, in list order", () => {
    expect(missingRemotionPackages((name) => name !== "three" && name !== "remotion")).toEqual(["remotion", "three"]);
  });
});

describe("remotionCheckLine", () => {
  it("passes when nothing is missing", () => {
    expect(remotionCheckLine([])).toBe("  ✓ remotion — Remotion scenes in MulmoCast videos");
  });

  it("is optional, with the guide, when nothing is installed", () => {
    const line = remotionCheckLine([...REMOTION_PACKAGES]);
    expect(line).toMatch(/^ {2}○ remotion — optional \(Remotion scenes in MulmoCast videos\)\n/);
    expect(line).not.toContain("missing:");
    expect(line).toContain("guide/en/mulmocast.html#remotion");
  });

  it("names what is missing from a partial install", () => {
    const line = remotionCheckLine(["three", "@react-three/fiber"]);
    expect(line).toContain("installed only in part; missing: three, @react-three/fiber");
    expect(line).toContain("guide/en/mulmocast.html#remotion");
  });
});

describe("resolverFromMulmocast", () => {
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
  const npxLayout = (home: string) => {
    const entry = join(home, ".npm", "_npx", "0123456789abcdef", "node_modules");
    const pkgDir = join(entry, "mulmoterminal");
    writePackage(pkgDir, { name: "mulmoterminal" });
    writePackage(join(entry, "mulmocast"), { name: "mulmocast", type: "module", exports: { ".": { default: "./lib/index.js" } } }, { "lib/index.js": "" });
    return pkgDir;
  };

  afterEach(() => {
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

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
