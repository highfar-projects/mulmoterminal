// @vitest-environment node
//
// The WIRING of the phone's "open a terminal here" command, not the rule it calls.
//
// `decideLaunchTerminal` is pure and has its own spec; what this file covers is which facts the
// host hands it. That is where #2181 lived — the rule was right and the binding asked the wrong
// table, so a session the phone could SEE a directory for could not have a terminal opened in it.
// A spec over the rule alone stays green through that, which is why this one drives the binding.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PtyEntry } from "../../../../server/session/types.js";

const SURVIVOR_SESSION = "22222222-2222-4222-8222-222222222222";
const LIVE_CWD = "/repo/live";
const REMEMBERED_CWD = "/repo/remembered";

const { initRemoteHostBackend, sessionCwd } = vi.hoisted(() => ({
  initRemoteHostBackend: vi.fn(),
  sessionCwd: vi.fn<(id: string) => string | null>(() => null),
}));

vi.mock("../../../../server/backends/remoteHost/index.js", () => ({ initRemoteHostBackend }));
// `ptys` stays the REAL map — it is half of the lookup under test. Only the persisted side is
// stubbed, because recording a cwd for real appends to a file under MULMOTERMINAL_HOME, and the
// map's own persistence is registry.ts's business and has its own coverage.
vi.mock("../../../../server/session/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../server/session/registry.js")>()),
  sessionCwd,
}));

import { initRemoteHost } from "../../../../server/backends/remoteHost/hostBindings.js";
import { ptys } from "../../../../server/session/registry.js";
import { LAUNCH_TERMINAL_CHANNEL } from "../../../../common/launchAgent.js";

type LaunchTerminal = (agent: unknown, sessionId: unknown) => { ok: true } | { ok: false; error: string };

// The host only reads `.cwd` off the entry for this command; the rest of PtyEntry is a live pty
// and a socket that a wiring test has no business constructing.
const putLivePty = (id: string, cwd: string) => ptys.set(id, { cwd } as unknown as PtyEntry);

describe("initRemoteHost — launchTerminal wiring", () => {
  let publishToOne: ReturnType<typeof vi.fn>;
  let launchTerminal: LaunchTerminal;

  beforeEach(() => {
    ptys.clear();
    sessionCwd.mockReturnValue(null);
    initRemoteHostBackend.mockClear();
    publishToOne = vi.fn(() => true);
    initRemoteHost({
      spawnClaudePty: vi.fn(),
      toolStores: { toolCallsStore: { get: vi.fn() } },
      outputBufferLimit: 1024,
      publishToOne,
      subscriberCount: () => 1,
    } as never);
    launchTerminal = initRemoteHostBackend.mock.calls[0][0].launchTerminal;
  });

  afterEach(() => ptys.clear());

  // #2181. tmux survives a server restart by design, so this is the state after EVERY restart —
  // and the phone's own session list shows these rows WITH a directory, because it resolves one
  // the same way this now does.
  it("opens a terminal for a session that outlived a restart, in its remembered directory", () => {
    sessionCwd.mockReturnValue(REMEMBERED_CWD);
    expect(launchTerminal("claude", SURVIVOR_SESSION)).toEqual({ ok: true });
    expect(publishToOne).toHaveBeenCalledWith(LAUNCH_TERMINAL_CHANNEL, expect.objectContaining({ cwd: REMEMBERED_CWD }));
  });

  // Where the agent is ACTUALLY running wins over the note on disk: a cell relaunched somewhere
  // else keeps its id and not its directory.
  it("prefers the live pty's directory over the remembered one", () => {
    sessionCwd.mockReturnValue(REMEMBERED_CWD);
    putLivePty(SURVIVOR_SESSION, LIVE_CWD);
    expect(launchTerminal("claude", SURVIVOR_SESSION)).toEqual({ ok: true });
    expect(publishToOne).toHaveBeenCalledWith(LAUNCH_TERMINAL_CHANNEL, expect.objectContaining({ cwd: LIVE_CWD }));
  });

  it("still refuses a session nothing knows a directory for", () => {
    expect(launchTerminal("claude", SURVIVOR_SESSION)).toEqual({ ok: false, error: expect.stringContaining("no working directory known") });
    expect(publishToOne).not.toHaveBeenCalled();
  });

  // The directory resolving is not the whole answer: the grid lives in the browser, so with no tab
  // connected there is nothing to open the cell.
  it("refuses when no browser took the request, even though the directory resolved", () => {
    sessionCwd.mockReturnValue(REMEMBERED_CWD);
    publishToOne.mockReturnValueOnce(false);
    expect(launchTerminal("claude", SURVIVOR_SESSION).ok).toBe(false);
    expect(publishToOne).toHaveBeenCalledOnce();
  });
});
