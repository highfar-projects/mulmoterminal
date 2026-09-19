// @vitest-environment node
//
// What the boot does AFTER the port is bound — and the two orderings that decide whether it
// deletes the right files.
//
// This exists because the evidence that #2168's split preserved the boot was a THROWAWAY harness:
// a server booted on a scratch HOME before and after, with the two logs diffed. That harness
// cannot survive the change it verified, so what survives instead is the property it was checking
// — which is this file. Both assertions below are about deletion, and deletion is the half of this
// module that hurts when it is wrong: one of the settings files it removes may hold a provider's
// API token, and the drops it removes belong to sessions somebody may still be using.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type PruneOrphans = (liveIds: ReadonlySet<string>, root?: string, writtenBefore?: number | null) => string[];

const mocks = vi.hoisted(() => ({
  announceListening: vi.fn(),
  bindSecurityWarning: vi.fn(() => "warning"),
  boundAddress: vi.fn(() => "127.0.0.1"),
  isLoopbackBinding: vi.fn(() => true),
  tmuxAvailable: vi.fn(() => true),
  tmuxListSessionIds: vi.fn(() => ["alive", "reaped-one"]),
  startReapSchedule: vi.fn(() => ["reaped-one"]),
  // Typed so `mock.calls[0]` is a tuple rather than `[]` — the cutoff argument IS the assertion.
  pruneOrphanSettings: vi.fn<PruneOrphans>(() => []),
  pruneOrphanDrops: vi.fn<PruneOrphans>(() => []),
  wireMachineGlobalHooks: vi.fn(),
  startUpdateStatusRefresh: vi.fn(),
  getSessionIdleReapDays: vi.fn(() => 7),
  getSessionReapIntervalHours: vi.fn(() => 0),
  liveInstances: vi.fn(() => [{ pid: 123, port: 4321, startedAt: 1_000 }]),
  registerInstance: vi.fn(() => () => {}),
}));

vi.mock("../../../server/infra/announce-listening.js", () => ({ announceListening: mocks.announceListening }));
vi.mock("../../../server/infra/allowed-origin.js", () => ({ bindSecurityWarning: mocks.bindSecurityWarning }));
vi.mock("../../../server/infra/loopback.js", () => ({ boundAddress: mocks.boundAddress, isLoopbackBinding: mocks.isLoopbackBinding }));
vi.mock("../../../server/infra/tmux.js", () => ({ tmuxAvailable: mocks.tmuxAvailable, tmuxListSessionIds: mocks.tmuxListSessionIds }));
vi.mock("../../../server/session/reap-schedule.js", () => ({ startReapSchedule: mocks.startReapSchedule }));
vi.mock("../../../server/session/session-settings.js", () => ({ pruneOrphanSettings: mocks.pruneOrphanSettings }));
vi.mock("../../../server/session/session-drops.js", () => ({ pruneOrphanDrops: mocks.pruneOrphanDrops }));
vi.mock("../../../server/agents/machine-global-hooks.js", () => ({ wireMachineGlobalHooks: mocks.wireMachineGlobalHooks }));
vi.mock("../../../server/config/update-status.js", () => ({ startUpdateStatusRefresh: mocks.startUpdateStatusRefresh }));
vi.mock("../../../server/config/config-routes.js", () => ({
  getSessionIdleReapDays: mocks.getSessionIdleReapDays,
  getSessionReapIntervalHours: mocks.getSessionReapIntervalHours,
}));
vi.mock("../../../bin/instances.js", async (importOriginal) => ({
  // earliestStartedAt is the rule under test, so it stays REAL — mocking it would make the cutoff
  // assertion below agree with itself.
  ...(await importOriginal<typeof import("../../../bin/instances.js")>()),
  liveInstances: mocks.liveInstances,
  registerInstance: mocks.registerInstance,
}));

import { onListening } from "../../../server/infra/on-listening.js";

const PEER_STARTED_AT_MS = 1_000;

const fakeServer = () => ({ address: () => ({ address: "127.0.0.1", family: "IPv4", port: 1234 }) });

// `deps` is structurally typed against http.Server, which this fake is not — the module only ever
// calls `.address()` on it, so the spec builds the smallest thing that answers that.
const run = () => onListening({ server: fakeServer(), loopbackServers: [], browserHostnames: new Set<string>() } as never);

describe("onListening", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockClear());
    vi.spyOn(process, "on").mockImplementation(() => process);
  });

  afterEach(() => vi.restoreAllMocks());

  // #1467. The boot sweep ends sessions, and the files those sessions left are orphans as of a
  // moment ago. Handing the prune the list as it was READ — rather than the list minus what the
  // sweep just ended — leaves a provider's API token on disk for a whole further boot.
  it("prunes against the survivors MINUS what the boot sweep just ended", () => {
    run();
    const [liveIds] = mocks.pruneOrphanSettings.mock.calls[0];
    expect([...liveIds]).toEqual(["alive"]);
    expect([...mocks.pruneOrphanDrops.mock.calls[0][0]]).toEqual(["alive"]);
  });

  // #1061. A peer running right now has live PTYs, and without tmux `surviving` is empty — so its
  // files looked like leftovers and were deleted underneath it. The cutoff is what stops that, and
  // a prune called without it deletes a stranger's live state.
  it("passes the earliest live peer's start time as the deletion cutoff", () => {
    run();
    expect(mocks.pruneOrphanSettings.mock.calls[0][2]).toBe(PEER_STARTED_AT_MS);
    expect(mocks.pruneOrphanDrops.mock.calls[0][2]).toBe(PEER_STARTED_AT_MS);
  });

  it("uses no cutoff when no peer is running, so a dead server's leftovers are reachable", () => {
    mocks.liveInstances.mockReturnValueOnce([]);
    run();
    expect(mocks.pruneOrphanSettings.mock.calls[0][2]).toBeNull();
  });

  // Without tmux nothing survived a restart, so every session file is an orphan — but there is also
  // no sweep to run, and running one would be asking tmux about sessions that cannot exist.
  it("skips the reap sweep when tmux is absent and still prunes, against nothing alive", () => {
    mocks.tmuxAvailable.mockReturnValue(false);
    run();
    expect(mocks.startReapSchedule).not.toHaveBeenCalled();
    expect([...mocks.pruneOrphanSettings.mock.calls[0][0]]).toEqual([]);
  });

  it("registers this instance and repairs the machine-global hook files", () => {
    run();
    expect(mocks.registerInstance).toHaveBeenCalledOnce();
    expect(mocks.wireMachineGlobalHooks).toHaveBeenCalledOnce();
    expect(mocks.startUpdateStatusRefresh).toHaveBeenCalledOnce();
  });

  it("warns about the bind only when it is not loopback", () => {
    run();
    expect(mocks.bindSecurityWarning).not.toHaveBeenCalled();
    mocks.isLoopbackBinding.mockReturnValueOnce(false);
    run();
    expect(mocks.bindSecurityWarning).toHaveBeenCalledOnce();
  });
});
