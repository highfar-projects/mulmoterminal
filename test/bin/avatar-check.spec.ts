// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AVATAR_PACKAGES, avatarCheck, avatarCheckLine } from "../../bin/avatar-check.js";

const roots: string[] = [];
const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "avatar-check-"));
  roots.push(root);
  return root;
};
const writePackage = (dir: string, name: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
};
// `npx mulmoterminal`: mulmoterminal and mulmocast side by side in one `_npx/<hash>` entry under the
// home. The avatar packages are found — or not — from mulmocast's location, i.e. in the home's own
// node_modules when the guide was followed.
const npxLayout = (home: string) => {
  const entry = join(home, ".npm", "_npx", "0123456789abcdef", "node_modules");
  const pkgDir = join(entry, "mulmoterminal");
  writePackage(pkgDir, "mulmoterminal");
  const mulmocast = join(entry, "mulmocast");
  writePackage(mulmocast, "mulmocast");
  writeFileSync(join(mulmocast, "index.js"), "");
  return pkgDir;
};

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("avatarCheckLine", () => {
  it("passes when nothing is missing", () => {
    expect(avatarCheckLine([])).toBe("  ✓ avatar — talking avatars in MulmoCast videos");
  });

  it("is optional, with the guide, when nothing is installed", () => {
    const line = avatarCheckLine(AVATAR_PACKAGES);
    expect(line).toMatch(/^ {2}○ avatar — optional \(talking avatars in MulmoCast videos\)\n/);
    expect(line).not.toContain("missing:");
    expect(line).toContain("guide/en/mulmocast.html#avatar");
  });

  it("names what is missing from a partial install", () => {
    expect(avatarCheckLine(["onnxruntime-node"])).toContain("installed only in part; missing: onnxruntime-node");
  });
});

describe("avatarCheck", () => {
  // The two mulmocast's own install hint names; a third would be a hint this line does not repeat.
  it("looks for the packages mulmocast asks for", () => {
    expect(AVATAR_PACKAGES).toEqual(["avatarscript", "onnxruntime-node"]);
  });

  it("finds packages installed in the home directory, from mulmocast's location", () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home);
    AVATAR_PACKAGES.forEach((name) => writePackage(join(home, "node_modules", name), name));
    expect(avatarCheck(pkgDir)).toBe("  ✓ avatar — talking avatars in MulmoCast videos");
  });

  // A global install lives outside the home, so the guide says to install these globally beside it.
  it("finds packages installed globally beside a global install", () => {
    const globalModules = join(makeRoot(), "lib", "node_modules");
    const pkgDir = join(globalModules, "mulmoterminal");
    writePackage(pkgDir, "mulmoterminal");
    writePackage(join(globalModules, "mulmocast"), "mulmocast");
    writeFileSync(join(globalModules, "mulmocast", "index.js"), "");
    AVATAR_PACKAGES.forEach((name) => writePackage(join(globalModules, name), name));
    expect(avatarCheck(pkgDir)).toBe("  ✓ avatar — talking avatars in MulmoCast videos");
  });

  it("names the one still missing", () => {
    const home = makeRoot();
    const pkgDir = npxLayout(home);
    writePackage(join(home, "node_modules", "avatarscript"), "avatarscript");
    expect(avatarCheck(pkgDir)).toContain("missing: onnxruntime-node");
  });

  it("is optional when neither is installed", () => {
    expect(avatarCheck(npxLayout(makeRoot()))).toMatch(/^ {2}○ avatar — optional/);
  });

  it("is null when mulmocast cannot be found", () => {
    expect(avatarCheck(join(makeRoot(), "nowhere"))).toBeNull();
  });
});
