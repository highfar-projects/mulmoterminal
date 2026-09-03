// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// node-pty is a native module and spawning is the whole point of the file under test, so
// the pty itself is mocked: what matters here is the ENVIRONMENT handed to it.
const spawn = vi.fn(() => ({ pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn() }));
vi.mock("node-pty", () => ({ default: { spawn: (...args: unknown[]) => spawn(...(args as [])) } }));
const scrub = vi.fn();
// `importOriginal` keeps the module's PURE parts real — the PORT rule the spawn asks for
// (tmuxClientUnsetNames/ownPortFacts) is the thing under test below, and a hand-written stand-in
// would pin the stand-in. Only what shells out to tmux is replaced.
vi.mock("../../../server/infra/tmux.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/infra/tmux.js")>()),
  tmuxAvailable: () => tmuxOn,
  tmuxHasSession: (id: string) => liveTmuxSessions.has(id),
  // The real one turns `env` into `-e KEY=VALUE` pairs, which is the only way a variable
  // reaches a tmux PANE — so the fake has to carry it or the #1367 assertions below prove nothing.
  tmuxNewSessionArgs: (id: string, file: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
    newSessionCwd = cwd;
    return ["new-session", id, ...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]), file, ...args];
  },
  tmuxScrubEnvNames: (names: readonly string[]) => scrub(names),
}));

// What this directory holds per working tree (#1367). Mocked rather than reserved for real:
// what is under test is that a spawn CARRIES it, not how it was decided.
vi.mock("../../../server/config/worktree-env.js", () => ({ reservedWorktreeEnv: () => reserved }));

let tmuxOn = false;
// What ptySpawn handed tmuxNewSessionArgs as the PANE's directory (the `-c` the real one builds).
let newSessionCwd = "";
let reserved: Record<string, string> = {};
const liveTmuxSessions = new Set<string>();

// ptySpawn stats the cwd and refuses a spawn into a directory that is not there, so this cannot
// be a literal: "/tmp" is not a directory on Windows, which failed only in the Windows job. Our
// own cwd is a directory on every platform, by definition — the same reasoning diagnoseSpawnCwd
// applies to an empty cwd.
const EXISTING_CWD = process.cwd();

// Real-shaped ids: ptySpawn now refuses anything SESSION_ID_RE rejects (#1533), so S1 is no
// longer a session id a spawn will accept.
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

const { spawnPty, ptySpawn, ptyWouldReattach, TMUX_CLIENT_CWD } = await import("../../../server/session/pty-spawn.js");
const { PORT } = await import("../../../server/config/env.js");

const envOf = (call: number = 0): NodeJS.ProcessEnv => (spawn.mock.calls[call] as unknown as [string, string[], { env: NodeJS.ProcessEnv }])[2].env;
const cwdOf = (call: number = 0): string => (spawn.mock.calls[call] as unknown as [string, string[], { cwd: string }])[2].cwd;

beforeEach(() => {
  spawn.mockClear();
  scrub.mockClear();
  tmuxOn = false;
  reserved = {};
  liveTmuxSessions.clear();
  process.env.ANTHROPIC_API_KEY = "sk-ant-leftover";
  process.env.MT_KEEP_ME = "kept";
});

// A leftover ANTHROPIC_API_KEY silently outranks the auth token that aims a provider
// session at its backend, and the settings `env` block can set a variable but not remove
// one. So the removal has to happen HERE — computing it and not applying it (which is
// exactly what shipped first) leaves the routing broken with no symptom until a request.
describe("spawnPty — the environment it hands the pty", () => {
  it("removes the named variables", () => {
    spawnPty("claude", [], EXISTING_CWD, ["ANTHROPIC_API_KEY"]);
    expect(envOf()).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("keeps everything else", () => {
    spawnPty("claude", [], EXISTING_CWD, ["ANTHROPIC_API_KEY"]);
    expect(envOf().MT_KEEP_ME).toBe("kept");
  });

  it("leaves the environment alone when nothing is named", () => {
    spawnPty("claude", [], EXISTING_CWD);
    expect(envOf().ANTHROPIC_API_KEY).toBe("sk-ant-leftover");
  });
});

// Every terminal, not only the agent ones. `mulmoterminal room` is a plain CLI a user runs in a
// shell cell and it has to reach THIS server: it used to find the port through the raw `PORT` the
// launcher exported to every PTY, which is the leak #1857 is about and had to go. guiMcpEnv still
// sets the same name on agent spawns, with the same value.
describe("spawnPty — the port a terminal can find this server on", () => {
  it("gives every terminal MULMOTERMINAL_PORT, agent or not", () => {
    spawnPty("zsh", [], EXISTING_CWD);
    expect(envOf().MULMOTERMINAL_PORT).toBe(String(PORT));
  });

  // Regression (#1857): the generic name is what a third-party dev server reads.
  it("does not put the port under the generic PORT name", () => {
    spawnPty("zsh", [], EXISTING_CWD);
    expect(envOf()).not.toHaveProperty("PORT");
  });

  it("reaches a tmux pane too, where the environment comes from -e", () => {
    tmuxOn = true;
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    const args = (spawn.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args).toContain(`MULMOTERMINAL_PORT=${PORT}`);
  });
});

// A tmux server outlives us and keeps for life whatever environment it was STARTED with, so a pane's
// environment is decided twice: by `new-session -e` (per pane) and by whoever created the server.
// `PORT=<n> mulmoterminal` put our own bind port into the second one — every cell then told its dev
// server to bind the address we are listening on, which is #1857 by another route (#1919).
//
// Only the client is stripped, and only when the PORT we carry IS the one we bind: the pane's own
// `-e` values are untouched, and a PORT that `--port` displaced belongs to the user (#1873).
describe("ptySpawn — what a tmux server we create is allowed to inherit", () => {
  const argsOf = (call: number = 0): string[] => (spawn.mock.calls[call] as unknown as [string, string[]])[1];

  beforeEach(() => {
    tmuxOn = true;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not hand our own bind port to the tmux client that may create the server", () => {
    vi.stubEnv("PORT", String(PORT));
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    expect(envOf()).not.toHaveProperty("PORT");
  });

  it("still unsets what the caller asked for", () => {
    vi.stubEnv("PORT", String(PORT));
    ptySpawn(S1, "claude", [], EXISTING_CWD, true, { unset: ["ANTHROPIC_API_KEY"] });
    expect(envOf()).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(envOf()).not.toHaveProperty("PORT");
  });

  // `PORT=3000 mulmoterminal --port <ours>`: that 3000 is the user's own — it is not the address we
  // are holding, and taking it would be the #955 bug of a sanitizer stealing the user's value.
  it("passes on a PORT that is not ours, so the user's own value still reaches the pane", () => {
    vi.stubEnv("PORT", "3000");
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    expect(envOf().PORT).toBe("3000");
  });

  // The pane's PORT comes from `-e`, which the strip must not reach: a worktree that reserved one
  // (#1367) is a value the user asked for, unlike the one we would have leaked.
  it("leaves a PORT the directory reserved on its way to the pane", () => {
    vi.stubEnv("PORT", String(PORT));
    reserved = { PORT: "3010" };
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    expect(argsOf()).toContain("PORT=3010");
  });

  // The deliberate asymmetry (#955, #1873): with no tmux there is no long-lived server to poison,
  // the pane IS this spawn, and a pane's own rc restores an exported PORT anyway — a tmux server
  // has no rc.
  it("leaves the non-tmux path alone", () => {
    vi.stubEnv("PORT", String(PORT));
    tmuxOn = false;
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    expect(envOf().PORT).toBe(String(PORT));
  });
});

// A server launched from a macOS GUI has none of these, and a tmux client that finds no
// UTF-8 name among them renders anything DEC ACS cannot express as one `_` per cell (#1634).
// Asserted here and not only on withFallbackLocale because the wiring is the part that was
// missing: the helper existing and ptyEnv not calling it looks identical from the unit test.
describe("spawnPty — the locale it hands the pty", () => {
  // undefined REMOVES the variable, which is the state under test: a GUI launch has none of them.
  beforeEach(() => {
    vi.stubEnv("LC_ALL", undefined);
    vi.stubEnv("LC_CTYPE", undefined);
    vi.stubEnv("LANG", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("supplies a UTF-8 LANG when our own environment names no locale", () => {
    spawnPty("claude", [], EXISTING_CWD);
    // macOS only — see withFallbackLocale for why the name is not safe to assume elsewhere.
    expect(envOf().LANG).toBe(process.platform === "darwin" ? "en_US.UTF-8" : undefined);
  });

  it("keeps the user's own locale", () => {
    vi.stubEnv("LANG", "ja_JP.UTF-8");
    spawnPty("claude", [], EXISTING_CWD);
    expect(envOf().LANG).toBe("ja_JP.UTF-8");
  });

  // LC_ALL outranks LANG, so a LANG written next to it would change nothing anyway.
  it("adds no LANG beside an LC_ALL", () => {
    vi.stubEnv("LC_ALL", "en_GB.UTF-8");
    spawnPty("claude", [], EXISTING_CWD);
    expect(envOf().LANG).toBeUndefined();
  });

  it("still lets a caller unset it", () => {
    spawnPty("claude", [], EXISTING_CWD, ["LANG"]);
    expect(envOf()).not.toHaveProperty("LANG");
  });
});

// `new-session -A` returns a terminal whether it created one or picked up a survivor, so a
// caller that must not treat the second as a fresh start has to ask beforehand. What hangs on
// it: a reattached claude never re-reads the user's MCP config, so resetting its learned tool
// groups there would drop them with nothing left to relearn from.
describe("ptyWouldReattach", () => {
  it("is true only when tmux is holding this exact session", () => {
    tmuxOn = true;
    liveTmuxSessions.add(S1);
    expect(ptyWouldReattach(S1, true)).toBe(true);
    expect(ptyWouldReattach(S2, true)).toBe(false);
  });

  it("is false without tmux — every spawn there starts a new process", () => {
    tmuxOn = false;
    liveTmuxSessions.add(S1);
    expect(ptyWouldReattach(S1, true)).toBe(false);
  });

  // Matches ptySpawn's own branch: a non-persistent spawn never consults tmux at all.
  it("is false for a non-persistent spawn", () => {
    tmuxOn = true;
    liveTmuxSessions.add(S1);
    expect(ptyWouldReattach(S1, false)).toBe(false);
  });
});

// The tmux pane inherits the tmux SERVER's environment rather than this one, so the scrub
// there is what actually protects it — but the non-tmux path has only this.
describe("ptySpawn — carries the removal down both paths", () => {
  it("applies it on the direct spawn", () => {
    ptySpawn(S1, "claude", [], EXISTING_CWD, false, { unset: ["ANTHROPIC_API_KEY"] });
    expect(envOf()).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("applies it on the tmux spawn too", () => {
    tmuxOn = true;
    const result = ptySpawn(S1, "claude", [], EXISTING_CWD, true, { unset: ["ANTHROPIC_API_KEY"] });
    expect(result.tmux).toBe(true);
    expect(envOf()).not.toHaveProperty("ANTHROPIC_API_KEY");
  });
});

// Which directory the SPAWNED PROCESS runs in, which for the tmux path is not the cell's.
//
// tmux 3.7 moves the server's cwd to the client's on every `new-session` and never restores it,
// and `spawn_pane()` guards its chdir on `getcwd()`. A client started inside a worktree therefore
// leaves the server there, and once this app removes that worktree every later pane ignores `-c`
// and starts in the deleted directory — where a program that calls `getcwd()` at startup dies on
// the spot (#1725, tmux/tmux#5473). The pane still goes where it was asked to: `-c` places it.
describe("ptySpawn — the directory the process itself is started from", () => {
  // A cell directory MADE for the test, so it cannot coincide with the home directory whatever
  // the environment says. Two earlier shapes of this constant were both machine-dependent, which
  // is the trap this repo keeps hitting: `process.cwd()` IS the home directory for anyone running
  // the suite from theirs, and a bare `tmpdir()` is too when `TMPDIR` points at it (CodeRabbit
  // caught the second). A directory created UNDER tmpdir can never equal its own parent, so the
  // inequality below means the same thing on every machine — and it exists, which ptySpawn's cwd
  // check requires.
  let CELL_CWD = "";
  beforeAll(() => {
    CELL_CWD = mkdtempSync(path.join(tmpdir(), "mt-cell-"));
  });
  afterAll(() => rmSync(CELL_CWD, { recursive: true, force: true }));

  it("starts the tmux client somewhere that cannot be deleted, not in the cell", () => {
    tmuxOn = true;
    ptySpawn(S1, "claude", [], CELL_CWD, true);
    expect(cwdOf()).toBe(TMUX_CLIENT_CWD);
    expect(cwdOf()).not.toBe(CELL_CWD);
  });

  // The pane's directory is a separate decision and must keep following the cell.
  it("still asks tmux for the cell's directory", () => {
    tmuxOn = true;
    ptySpawn(S1, "claude", [], CELL_CWD, true);
    // The fake tmuxNewSessionArgs above records `cwd`; the real one turns it into `-c`.
    expect(newSessionCwd).toBe(CELL_CWD);
  });

  // Without tmux there is no client in between, so the process itself must run in the cell.
  it("runs a direct spawn in the cell's directory", () => {
    tmuxOn = false;
    ptySpawn(S1, "claude", [], CELL_CWD, true);
    expect(cwdOf()).toBe(CELL_CWD);
  });
});

// Stripping our own copy is not enough: a pane inherits the tmux SERVER's environment,
// and a server created by an earlier non-provider session already carries the key. The
// scrub in ensureConf only covers a server that predates this process.
describe("ptySpawn — the tmux server's own environment", () => {
  it("scrubs the names from the running server before a provider spawn", () => {
    tmuxOn = true;
    ptySpawn(S1, "claude", [], EXISTING_CWD, true, { unset: ["ANTHROPIC_API_KEY"] });
    expect(scrub).toHaveBeenCalledWith(["ANTHROPIC_API_KEY"]);
  });

  it("leaves the server alone for an ordinary session", () => {
    tmuxOn = true;
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    expect(scrub).not.toHaveBeenCalled();
  });
});

// A worktree isolates files, not ports (#1367). The values are reserved before the spawn; what
// this pins is that every terminal actually RUNS with them — including the tmux path, where the
// pane's environment comes from `new-session -e` and not from the process spawned here.
describe("the per-tree environment a directory reserved", () => {
  const argsOf = (call: number = 0): string[] => (spawn.mock.calls[call] as unknown as [string, string[]])[1];

  it("reaches a plain spawn", () => {
    reserved = { PORT: "3010", DB_NAME: "myapp_fix_login" };
    spawnPty("yarn", ["dev"], EXISTING_CWD);
    expect(envOf().PORT).toBe("3010");
    expect(envOf().DB_NAME).toBe("myapp_fix_login");
  });

  it("reaches a direct ptySpawn", () => {
    reserved = { PORT: "3010" };
    ptySpawn(S1, "claude", [], EXISTING_CWD, false);
    expect(envOf().PORT).toBe("3010");
  });

  it("is handed to the tmux pane through -e", () => {
    reserved = { PORT: "3010" };
    tmuxOn = true;
    ptySpawn(S1, "claude", [], EXISTING_CWD, true);
    expect(argsOf()).toContain("PORT=3010");
  });

  // The spawner's own values are about THIS session and could not have been reserved for a
  // directory; a project declaring the same name must not be able to redirect our MCP bridge.
  it("loses to a value the spawner computed for this session", () => {
    reserved = { MULMOTERMINAL_SESSION: "from-config", PORT: "3010" };
    ptySpawn(S1, "claude", [], EXISTING_CWD, false, { env: { MULMOTERMINAL_SESSION: S1 } });
    expect(envOf().MULMOTERMINAL_SESSION).toBe(S1);
    expect(envOf().PORT).toBe("3010");
  });

  it("sets nothing when the directory reserved nothing", () => {
    spawnPty("claude", [], EXISTING_CWD);
    expect(envOf()).not.toHaveProperty("PORT");
  });
});

// A live `mt-undefined` was found running muse (#1533): a spawn reached tmux with an id that was
// never set, and every later spawn with the same defect would have attached that same pane. The
// guard makes that a failed launch with a message instead of a silently shared terminal.
describe("ptySpawn — the session-id guard", () => {
  it("refuses an id that is not a session id, before anything is spawned", () => {
    expect(() => ptySpawn("undefined", "claude", [], EXISTING_CWD, true)).toThrow(/invalid session id/);
    expect(spawn).not.toHaveBeenCalled();
  });

  // The one non-random id shape in the codebase — it must keep passing, or every rate-limit
  // probe dies at launch.
  it("accepts a probe id, which is UUID-shaped by construction", async () => {
    const { newProbeSessionId } = await import("../../../server/agents/probe-session.js");
    ptySpawn(newProbeSessionId(), "claude", [], EXISTING_CWD, false);
    expect(spawn).toHaveBeenCalled();
  });
});
