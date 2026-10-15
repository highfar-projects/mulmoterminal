// @vitest-environment node
// The pure rule is pinned in home-scope.spec.ts; this pins that the two names living outside HOME
// actually carry it. Each case re-evaluates the modules under a stubbed HOME, so the import stays
// inside the test on purpose (see CLAUDE.md, "Import a component at module scope").
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { canSymlink } from "../../support/canSymlink.js";

const SESSION = "00000000-0000-4000-8000-000000000000";
const SUFFIX_RE = /^-[0-9a-f]{16}$/;

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

async function scopedNames(home: string | null) {
  if (home !== null) {
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
  }
  vi.resetModules();
  const env = await import("../../../server/config/env.js");
  const tmux = await import("../../../server/infra/process/tmux.js");
  const drops = await import("../../../server/session/session-drops.js");
  return {
    suffix: env.HOME_SCOPE_SUFFIX,
    socket: tmux.tmuxNewSessionArgs(SESSION, "sh", [], "/")[1],
    dropsRoot: path.basename(drops.DROPS_ROOT),
  };
}

describe("names scoped by HOME", () => {
  it("keeps the names every existing install uses on the account's own home", async () => {
    expect(await scopedNames(null)).toEqual({ suffix: "", socket: "mulmoterminal", dropsRoot: "mulmoterminal-drops" });
  });

  it("gives an overridden HOME its own tmux server and drop directory, under one suffix", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mt-home-scope-"));
    dirs.push(home);
    const { suffix, socket, dropsRoot } = await scopedNames(home);
    expect(suffix).toMatch(SUFFIX_RE);
    expect(socket).toBe(`mulmoterminal${suffix}`);
    expect(dropsRoot).toBe(`mulmoterminal-drops${suffix}`);
  });

  it.skipIf(!canSymlink)("treats a symlink to the account's own home as that home", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mt-home-link-"));
    dirs.push(dir);
    const link = path.join(dir, "home");
    symlinkSync(os.userInfo().homedir, link);
    expect((await scopedNames(link)).suffix).toBe("");
  });
});
