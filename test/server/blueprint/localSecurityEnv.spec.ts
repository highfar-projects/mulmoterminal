// @vitest-environment node
// The local base's security check refuses an .env that .gitignore does not ignore — before it builds or runs anything,
// since the secrets in it would go with the folder the moment its person adds git.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CHECK = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "local", "checks", "security.sh");
const describeSh = describe.skipIf(process.platform === "win32");
const CATEGORIES = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10"];

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-local-security-"));
  mkdirSync(path.join(dir, ".blueprint"));
  mkdirSync(path.join(dir, "test"));
  writeFileSync(path.join(dir, ".blueprint/security-review.md"), CATEGORIES.map((id) => `## ${id}\n- LOW fixed: checked`).join("\n"));
  writeFileSync(path.join(dir, "test/security.test.ts"), "");
  // A stand-in yarn first on PATH that fails at once, so a run that got past the .env check says so without paying for
  // the real yarn twice.
  mkdirSync(path.join(dir, "bin"));
  writeFileSync(path.join(dir, "bin", "yarn"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = () =>
  spawnSync("/bin/sh", [CHECK], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH ?? ""}` } });

describeSh("local security check: .env", () => {
  it.each([
    ["no .gitignore", null],
    [".gitignore without it", "node_modules\n.envrc\n"],
  ])("refuses an .env with %s, before running anything", (_label, ignore) => {
    writeFileSync(path.join(dir, ".env"), "SESSION_SECRET=x\n");
    if (ignore !== null) writeFileSync(path.join(dir, ".gitignore"), ignore);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".env exists and .gitignore does not ignore it");
    expect(result.stderr).not.toContain("yarn test fails");
  });

  it.each([[".env"], ["/.env"], [".env*"]])("gets past the .env check when .gitignore has %s", (line) => {
    writeFileSync(path.join(dir, ".env"), "SESSION_SECRET=x\n");
    writeFileSync(path.join(dir, ".gitignore"), `node_modules\n${line}\n`);
    expect(run().stderr).toContain("yarn test fails");
  });

  it("asks nothing of .gitignore when there is no .env", () => {
    expect(run().stderr).toContain("yarn test fails");
  });
});
