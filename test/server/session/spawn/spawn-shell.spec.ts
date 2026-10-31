// @vitest-environment node
// The two persistent shell ptys — a launcher chip and a bot job — share the agent relay (#3209).
// Sharing it must not change what sets them apart from an agent cell: the entry says `shell` (what
// the phone reads) while both log lines say which shell pty it was, a reattached launcher names no
// command, and a bot job has no socket and is announced only once it is registered.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IDisposable, IPty } from "node-pty";
import { fakePty } from "../../../helpers/fakePtyEntry";
import type { PtyEntry } from "../../../../server/session/types";
import type { SpawnDeps } from "../../../../server/session/spawn/spawn-deps";

const ID = "22222222-3333-4444-8555-666666666666";
const T0 = 1_000_000;
const leaves: unknown[][] = [];
const logged: string[] = [];
const published: { id: string; registered: boolean }[] = [];
let nextSpawn: { term: IPty; tmux: boolean; reattached: boolean } | null = null;

vi.mock("../../../../server/session/pty/pty-spawn.js", () => ({
  ptySpawn: (sessionId: string, file: string, args: string[], cwd: string, persistent: boolean) => {
    leaves.push(["ptySpawn", sessionId, file, args, cwd, persistent]);
    if (!nextSpawn) throw new Error("the spec did not prepare a spawn");
    return nextSpawn;
  },
  spawnPty: vi.fn(),
}));
vi.mock("../../../../server/session/registry.js", () => ({ ptys: new Map() }));
vi.mock("../../../../server/session/pty/pty-exit.js", () => ({
  reportPtyExit: (...args: unknown[]) => {
    leaves.push(["reportPtyExit", ...args]);
    return "keep";
  },
}));
vi.mock("../../../../server/session/ws-frames.js", () => ({
  sendFrame: (_socket: unknown, payload: unknown) => {
    leaves.push(["sendFrame", payload]);
    return true;
  },
  sendExitAndClose: vi.fn(),
}));
vi.mock("../../../../server/config/config-routes.js", () => ({ getLaunchers: () => [] }));

const { ptys } = await import("../../../../server/session/registry.js");
const { createShellSpawners } = await import("../../../../server/session/spawn/spawn-shell.js");

const disposable: IDisposable = { dispose: () => {} };

/** A pty whose output and exit the spec raises itself. */
const livePty = () => {
  const onData: ((data: string) => void)[] = [];
  const onExit: ((exit: { exitCode: number; signal?: number }) => void)[] = [];
  const term: IPty = {
    ...fakePty(),
    onData: (listener) => {
      onData.push(listener);
      return disposable;
    },
    onExit: (listener) => {
      onExit.push(listener);
      return disposable;
    },
  };
  return {
    term,
    emit: (data: string) => onData.forEach((listener) => listener(data)),
    exit: (exit: { exitCode: number; signal?: number }) => onExit.forEach((listener) => listener(exit)),
  };
};

// Only read by the relay's `if (!entry.ws)`; sendFrame itself is recorded above.
const attachedSocket = () => ({ readyState: 1, send: () => {}, close: () => {} }) as unknown as NonNullable<PtyEntry["ws"]>;

const deps: SpawnDeps = {
  claudeBin: "claude",
  codexBin: "codex",
  codexModel: null,
  antigravityBin: "agy",
  antigravityModel: null,
  grokBin: "grok",
  grokModel: null,
  museBin: "muse",
  museModel: null,
  copilotBin: "copilot",
  copilotModel: null,
  cursorBin: "cursor-agent",
  cursorModel: null,
  permissionMode: "default",
  guiMcpTools: "",
  gridMcpTools: "",
  outputBufferLimit: 1000,
  hookSettingsJson: () => "{}",
  mcpConfigJson: () => "{}",
  reap: vi.fn(),
  setWorking: vi.fn(),
  setWaiting: vi.fn(),
  uiPort: "3000",
  // Recorded with whether the registry already holds the session: the grid adopts what it is told of.
  publishSessionCreated: (id) => {
    published.push({ id, registered: ptys.has(id) });
  },
  publishActivity: vi.fn(),
  publishPromptSubmitted: vi.fn(),
};
const spawners = createShellSpawners(deps);

const prepare = (reattached: boolean) => {
  const pty = livePty();
  nextSpawn = { term: pty.term, tmux: true, reattached };
  return pty;
};

describe("the persistent shell ptys", () => {
  beforeEach(() => {
    leaves.length = 0;
    logged.length = 0;
    published.length = 0;
    ptys.clear();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(String(args[0]));
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("spawnLauncherPty", () => {
    it("records a shell entry whose start and exit lines both say launcher", () => {
      const pty = prepare(false);
      const entry = spawners.spawnLauncherPty(ID, attachedSocket(), { kind: "command", command: "htop" }, "/tmp/work");
      expect(entry.agent).toBe("shell");
      expect(ptys.get(ID)).toBe(entry);
      expect(leaves[0]).toEqual(["ptySpawn", ID, expect.any(String), expect.any(Array), "/tmp/work", true]);
      expect(logged[0]).toContain("started launcher");
      expect(logged[0]).toContain("htop");
      pty.exit({ exitCode: 0 });
      expect(logged[1]).toContain("[pty] launcher exited code=0");
      expect(leaves.at(-1)).toEqual(["reportPtyExit", ID, entry, { exitCode: 0, signal: undefined, lifetimeMs: 0 }, deps.reap]);
    });

    // An attach picked up whatever was already running; naming the chip's command would describe a
    // program nobody started.
    it("does not name the command on a reattach", () => {
      prepare(true);
      spawners.spawnLauncherPty(ID, attachedSocket(), { kind: "command", command: "htop" }, "/tmp/work");
      expect(logged[0]).toContain("attached to a running launcher");
      expect(logged[0]).not.toContain("htop");
    });
  });

  describe("spawnBotJobPty", () => {
    it("runs the file as given, with no socket, and announces the session once it is registered", () => {
      const pty = prepare(false);
      const entry = spawners.spawnBotJobPty(ID, "/usr/bin/python3", ["job.py", "--once"], "/tmp/job");
      expect(leaves[0]).toEqual(["ptySpawn", ID, "/usr/bin/python3", ["job.py", "--once"], "/tmp/job", true]);
      expect(entry.ws).toBeNull();
      expect(entry.agent).toBe("shell");
      expect(published).toEqual([{ id: ID, registered: true }]);
      expect(logged[0]).toContain("started bot-job");
      pty.exit({ exitCode: 1 });
      expect(logged[1]).toContain("[pty] bot-job exited code=1");
      expect(leaves.at(-1)).toEqual(["reportPtyExit", ID, entry, { exitCode: 1, signal: undefined, lifetimeMs: 0 }, deps.reap]);
    });

    // Nobody is watching yet, so there is nothing to send to — but the buffer is what a cell that
    // adopts the session later replays.
    it("keeps its output for a later reattach rather than sending it nowhere", () => {
      const pty = prepare(false);
      const entry = spawners.spawnBotJobPty(ID, "/usr/bin/python3", [], "/tmp/job");
      pty.emit("progress 1/3");
      expect(entry.buffer).toBe("progress 1/3");
      expect(leaves.filter((leaf) => leaf[0] === "sendFrame")).toEqual([]);
    });
  });
});
