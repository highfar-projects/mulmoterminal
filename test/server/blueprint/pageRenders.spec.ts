// @vitest-environment node
// The render check the publish checks share, run with a stand-in Chrome that prints a fixed page. What it must judge is
// the page, and only the page: a Chrome that leaves its profile behind in a state the clean-up cannot remove (a real one
// can still be writing it when it is stopped) must not fail a page that rendered.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const COPIES = ["firebase", "cloudflare"].map((pack) => path.join(PACKS, pack, "checks", "page-renders.sh"));
const describeSh = describe.skipIf(process.platform === "win32");

// Prints the page, then leaves a folder in its profile that cannot be deleted.
const stubChrome = (body: string) => `#!/bin/sh
for arg in "$@"; do case "$arg" in --user-data-dir=*) profile="\${arg#--user-data-dir=}" ;; esac; done
mkdir -p "$profile/locked/inside" && chmod 555 "$profile/locked"
echo "<html><body>${body}</body></html>"
`;

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-page-renders-"));
});
// The stand-in's locked folder is opened again so the scratch folder can be removed.
const unlock = (folder: string): void => {
  chmodSync(folder, 0o755);
  readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => unlock(path.join(folder, entry.name)));
};
afterEach(() => {
  unlock(dir);
  rmSync(dir, { recursive: true, force: true });
});

const render = (script: string, body: string) => {
  const chrome = path.join(dir, "chrome");
  writeFileSync(chrome, stubChrome(body));
  chmodSync(chrome, 0o755);
  return spawnSync("/bin/sh", [script, "http://127.0.0.1:1/"], { env: { ...process.env, CHROME: chrome, TMPDIR: dir }, encoding: "utf8" });
};

describeSh.each(COPIES)("%s", (script) => {
  it("passes a page that rendered, even when Chrome's profile cannot be cleaned up", () => {
    expect(render(script, "<p>本の一覧</p>").status).toBe(0);
  });

  it("still fails a blank page", () => {
    const result = render(script, '<div id="app"></div>');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("renders a blank page");
  });
});
