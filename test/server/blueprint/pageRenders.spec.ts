// @vitest-environment node
// The render check the publish checks share, run with a stand-in Chrome that prints a fixed page. What it must judge is
// the page, and only the page: a Chrome that leaves its profile behind in a state the clean-up cannot remove (a real one
// can still be writing it when it is stopped) must not fail a page that rendered, and a Chrome that crashes before
// printing anything must not be reported as the app failing to start.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
// Every pack that ships the render check: packs.spec.ts holds them identical, and each is run here.
const COPIES = readdirSync(PACKS)
  .map((pack) => path.join(PACKS, pack, "checks", "page-renders.sh"))
  .filter((file) => existsSync(file));
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

const renderWith = (script: string, chromeSource: string) => {
  const chrome = path.join(dir, "chrome");
  writeFileSync(chrome, chromeSource);
  chmodSync(chrome, 0o755);
  return spawnSync("/bin/sh", [script, "http://127.0.0.1:1/"], { env: { ...process.env, CHROME: chrome, TMPDIR: dir }, encoding: "utf8" });
};
const render = (script: string, body: string) => renderWith(script, stubChrome(body));
// A Chrome that aborts before printing anything, as a headless Chrome does when it cannot start (SIGABRT, status 134).
const CRASHING_CHROME = "#!/bin/sh\nexit 134\n";

describeSh.each(COPIES)("%s", (script) => {
  it("passes a page that rendered, even when Chrome's profile cannot be cleaned up", () => {
    expect(render(script, "<p>本の一覧</p>").status).toBe(0);
  });

  it("still fails a blank page", () => {
    const result = render(script, '<div id="app"></div>');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("renders a blank page");
  });

  it("does not blame the app when Chrome crashes before printing the page: like no Chrome, it cannot judge", () => {
    const result = renderWith(script, CRASHING_CHROME);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("exited with status 134 before printing the page; could not confirm");
    expect(result.stderr).not.toContain("blank page");
  });
});
