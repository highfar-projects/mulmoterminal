// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureWorktreeEnv, releaseWorktreeEnv, reservedWorktreeEnv, worktreeEnvLogFile, worktreeEnvValues } from "../../../server/config/worktree-env";
import type { WorktreeEnvSpec } from "../../../common/worktreeEnv";

// The whole module reads MULMOTERMINAL_HOME lazily, so pointing it at a scratch dir is enough to
// keep every reservation — and the log — out of the real home.
let home: string;
let projects: string;
let savedHome: string | undefined;

const FREE = (): Promise<boolean> => Promise.resolve(true);

beforeEach(() => {
  savedHome = process.env.MULMOTERMINAL_HOME;
  // realpath: every path this module records goes through canonicalPath, and on macOS the temp
  // dir is a symlink — so an un-resolved root would contain none of the worktrees under it.
  home = realpathSync(mkdtempSync(path.join(tmpdir(), "mt-wtenv-home-")));
  projects = realpathSync(mkdtempSync(path.join(tmpdir(), "mt-wtenv-proj-")));
  process.env.MULMOTERMINAL_HOME = home;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.MULMOTERMINAL_HOME;
  else process.env.MULMOTERMINAL_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(projects, { recursive: true, force: true });
});

/** A project checkout (not a managed worktree) declaring `spec`. */
function projectDir(name: string, spec: WorktreeEnvSpec | null): string {
  const dir = path.join(projects, name);
  mkdirSync(dir, { recursive: true });
  if (spec) writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify({ worktreeEnv: spec }));
  return dir;
}

/** A managed worktree at <home>/worktrees/<repo>-<hash>/<task>, which is what marks it as one. */
function worktreeDir(repoKey: string, task: string, spec: WorktreeEnvSpec | null): string {
  const dir = path.join(home, "worktrees", repoKey, task);
  mkdirSync(dir, { recursive: true });
  if (spec) writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify({ worktreeEnv: spec }));
  return dir;
}

const PORT_3000: WorktreeEnvSpec = { PORT: { kind: "port", base: 3000 } };

describe("ensureWorktreeEnv", () => {
  it("does nothing at all for a directory that declares none", async () => {
    const dir = projectDir("plain", null);
    expect(await ensureWorktreeEnv(dir, FREE)).toEqual({});
    expect(existsSync(worktreeEnvLogFile())).toBe(false);
  });

  it("gives the project's own checkout the base it declared", async () => {
    expect(await ensureWorktreeEnv(projectDir("app", PORT_3000), FREE)).toEqual({ PORT: "3000" });
  });

  // The picture from #1367: the checkout keeps 3000, its worktrees take the numbers above it.
  it("starts a managed worktree one slot up, leaving the base to the project", async () => {
    await ensureWorktreeEnv(projectDir("app", PORT_3000), FREE);
    expect(await ensureWorktreeEnv(worktreeDir("app-abc123", "fix-login", PORT_3000), FREE)).toEqual({ PORT: "3010" });
  });

  it("gives two worktrees of one project different ports", async () => {
    const first = await ensureWorktreeEnv(worktreeDir("app-abc123", "fix-login", PORT_3000), FREE);
    const second = await ensureWorktreeEnv(worktreeDir("app-abc123", "add-search", PORT_3000), FREE);
    expect([first.PORT, second.PORT]).toEqual(["3010", "3020"]);
  });

  // Two clones of one repo declare the same base — the case this machine actually has, with
  // several checkouts side by side. Before #1367 both dev servers reached for 3000.
  it("gives two checkouts declaring the same base different ports", async () => {
    const five = await ensureWorktreeEnv(projectDir("app5", PORT_3000), FREE);
    const six = await ensureWorktreeEnv(projectDir("app6", PORT_3000), FREE);
    expect([five.PORT, six.PORT]).toEqual(["3000", "3010"]);
  });

  it("keeps two ports of one directory apart even when they share a base", async () => {
    const dir = projectDir("app", { PORT: { kind: "port", base: 3000 }, ADMIN_PORT: { kind: "port", base: 3000 } });
    expect(await ensureWorktreeEnv(dir, FREE)).toEqual({ PORT: "3000", ADMIN_PORT: "3010" });
  });

  it("skips a port the OS says is taken", async () => {
    const busy = (port: number) => Promise.resolve(port !== 3000);
    expect(await ensureWorktreeEnv(projectDir("app", PORT_3000), busy)).toEqual({ PORT: "3010" });
  });

  // THE point of the registry. Probing on every spawn would find the tree's own dev server on
  // its port, call it taken, and move the number — so a running server's port must survive a
  // probe that now says "busy", because it is busy with that server.
  it("keeps a reserved port even once something is listening on it", async () => {
    const dir = projectDir("app", PORT_3000);
    expect(await ensureWorktreeEnv(dir, FREE)).toEqual({ PORT: "3000" });
    const everythingBusy = () => Promise.resolve(false);
    expect(await ensureWorktreeEnv(dir, everythingBusy)).toEqual({ PORT: "3000" });
  });

  it("re-allocates when the project edits its base", async () => {
    const dir = projectDir("app", PORT_3000);
    await ensureWorktreeEnv(dir, FREE);
    writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify({ worktreeEnv: { PORT: { kind: "port", base: 4000 } } }));
    expect(await ensureWorktreeEnv(dir, FREE)).toEqual({ PORT: "4000" });
  });

  it("names a slug after the worktree's task, behind the declared prefix", async () => {
    const spec: WorktreeEnvSpec = { DB_NAME: { kind: "slug", prefix: "myapp_" } };
    expect(await ensureWorktreeEnv(worktreeDir("app-abc123", "fix-login", spec), FREE)).toEqual({ DB_NAME: "myapp_fix_login" });
  });

  it("names a project checkout's slug after its own folder", async () => {
    const spec: WorktreeEnvSpec = { DB_NAME: { kind: "slug", prefix: "myapp_" } };
    expect(await ensureWorktreeEnv(projectDir("app-main", spec), FREE)).toEqual({ DB_NAME: "myapp_app_main" });
  });

  // Two clones of one repo can hold a worktree of the same name, and both configs carry the same
  // prefix — so the derived name collides and the second one has to move.
  it("suffixes a slug another directory already holds", async () => {
    const spec: WorktreeEnvSpec = { DB_NAME: { kind: "slug", prefix: "myapp_" } };
    await ensureWorktreeEnv(worktreeDir("app-abc123", "fix-login", spec), FREE);
    expect(await ensureWorktreeEnv(worktreeDir("app-def456", "fix-login", spec), FREE)).toEqual({ DB_NAME: "myapp_fix_login_2" });
  });

  it("hands a port back once the directory that held it is gone", async () => {
    const gone = projectDir("app5", PORT_3000);
    expect(await ensureWorktreeEnv(gone, FREE)).toEqual({ PORT: "3000" });
    rmSync(gone, { recursive: true, force: true });
    expect(await ensureWorktreeEnv(projectDir("app6", PORT_3000), FREE)).toEqual({ PORT: "3000" });
  });

  it("leaves the variable unset when the whole span is spoken for", async () => {
    const allBusy = () => Promise.resolve(false);
    expect(await ensureWorktreeEnv(projectDir("app", PORT_3000), allBusy)).toEqual({});
  });
});

describe("reservedWorktreeEnv", () => {
  it("reads back what was reserved, without allocating", () => {
    const dir = projectDir("app", PORT_3000);
    expect(reservedWorktreeEnv(dir)).toEqual({});
    expect(existsSync(worktreeEnvLogFile())).toBe(false);
  });

  it("answers with the reserved value once ensureWorktreeEnv has run", async () => {
    const dir = projectDir("app", PORT_3000);
    await ensureWorktreeEnv(dir, FREE);
    expect(reservedWorktreeEnv(dir)).toEqual({ PORT: "3000" });
  });

  it("answers nothing for a directory that declares none", () => {
    expect(reservedWorktreeEnv(projectDir("plain", null))).toEqual({});
  });
});

describe("worktreeEnvValues", () => {
  it("gives a port the url that opens it and a slug none", async () => {
    const dir = projectDir("app", { PORT: { kind: "port", base: 3000 }, DB_NAME: { kind: "slug", prefix: "myapp_" } });
    await ensureWorktreeEnv(dir, FREE);
    expect(worktreeEnvValues(dir)).toEqual([
      { name: "PORT", value: "3000", url: "http://localhost:3000" },
      { name: "DB_NAME", value: "myapp_app", url: null },
    ]);
  });

  it("lists nothing before anything is reserved", () => {
    expect(worktreeEnvValues(projectDir("app", PORT_3000))).toEqual([]);
  });
});

describe("releaseWorktreeEnv", () => {
  it("puts the value back in circulation for another directory", async () => {
    const wt = worktreeDir("app-abc123", "fix-login", PORT_3000);
    expect(await ensureWorktreeEnv(wt, FREE)).toEqual({ PORT: "3010" });
    releaseWorktreeEnv(wt);
    expect(reservedWorktreeEnv(wt)).toEqual({});
    expect(await ensureWorktreeEnv(worktreeDir("app-abc123", "add-search", PORT_3000), FREE)).toEqual({ PORT: "3010" });
  });

  // Removal deletes the directory first, so the release runs against a path that is already gone
  // — it still has to name the same reservation the ensure made.
  it("releases a worktree whose directory has already been removed", async () => {
    const wt = worktreeDir("app-abc123", "fix-login", PORT_3000);
    await ensureWorktreeEnv(wt, FREE);
    rmSync(wt, { recursive: true, force: true });
    releaseWorktreeEnv(wt);
    expect(readFileSync(worktreeEnvLogFile(), "utf8")).toContain('"release":true');
  });
});
