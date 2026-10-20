import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TerminalCell from "../../../src/components/TerminalCell.vue";
import { STARTUP_WINDOW_MS } from "../../../common/endedCellClose";
import {
  beginDevcontainerOp,
  settleDevcontainerOp,
  devcontainerOpFor,
  resetDevcontainerOps,
  DEVCONTAINER_EXIT_GRACE_MS,
} from "../../../src/composables/devcontainerExitHold";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

// Personal-fork: a devcontainer rebuild/stop removes the container a session runs in, which the
// server reports exactly like an agent ending on its own — so without the hold, #3049's auto-close
// would take the cell off the grid. The stub stands in for the terminal's `exit` event and exposes
// `connectKey`, which is how the cell resumes the same session in place.
vi.mock("../../../src/components/Terminal.vue", () => ({
  default: {
    name: "TerminalView",
    props: ["sessionId", "connectKey", "cwd", "hideHeader", "launch", "customAgent", "agent"],
    emits: ["session", "cwd", "exit"],
    template: '<div class="stub-term"><slot name="header-actions" /></div>',
    methods: { terminate() {}, showHint() {}, toggleVoice: () => true },
  },
}));

const CWD = "/home/me/proj";
const ENDED = { sessionEnded: true, lifetimeMs: STARTUP_WINDOW_MS * 10, reattached: false };

type Held = { ok: boolean; status: number; json: () => Promise<unknown> };
let finishUp: (ok: boolean) => void = () => {};
let finishDown: (ok: boolean) => void = () => {};

beforeEach(() => {
  resetDevcontainerOps();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "alert").mockImplementation(() => {});
  const heldUp = new Promise<Held>((r) => (finishUp = (ok) => r({ ok, status: ok ? 200 : 500, json: async () => (ok ? { ok: true } : { output: "boom" }) })));
  const heldDown = new Promise<Held>(
    (r) => (finishDown = (ok) => r({ ok, status: ok ? 200 : 500, json: async () => (ok ? { ok: true } : { output: "boom" }) })),
  );
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/devcontainer/status")) return { ok: true, json: async () => ({ hasConfig: true, enabled: true, containerName: "angry_rubin" }) };
    if (u.includes("/api/devcontainer/up")) return heldUp;
    if (u.includes("/api/devcontainer/down")) return heldDown;
    if (u.includes("/api/scripts")) return { ok: true, json: async () => ({ cwd: CWD, scripts: [] }) };
    if (u.includes("/api/sessions")) return { ok: true, json: async () => ({ sessions: [] }) };
    return { ok: true, json: async () => ({ working: false, waiting: false, lastPrompt: null }) };
  }) as unknown as typeof fetch;
});

afterEach(() => vi.restoreAllMocks());

const mountCell = (uid: number, sessionId: string) =>
  mount(TerminalCell, {
    props: {
      uid,
      expanded: false,
      collectionsAvailable: false,
      zoomed: false,
      reorderable: false,
      initialSessionId: sessionId,
      initialCwd: CWD,
      defaultCwd: CWD,
      presets: [],
      home: "/home/me",
      openSessionIds: [],
      openCwds: [],
    },
  });

const term = (w: ReturnType<typeof mountCell>) => w.findComponent({ name: "TerminalView" });
const connectKey = (w: ReturnType<typeof mountCell>) => term(w).props("connectKey") as number;
async function endSession(w: ReturnType<typeof mountCell>) {
  term(w).vm.$emit("exit", 0, ENDED);
  await flushPromises();
}

describe("devcontainerOpFor", () => {
  it("covers a directory while its operation runs and for the grace window after", () => {
    beginDevcontainerOp(CWD);
    expect(devcontainerOpFor(CWD)).toBe("running");
    expect(devcontainerOpFor("/home/me/other")).toBeNull();
    settleDevcontainerOp(CWD, true, 1_000);
    expect(devcontainerOpFor(CWD, 1_000 + DEVCONTAINER_EXIT_GRACE_MS)).toBe("succeeded");
    expect(devcontainerOpFor(CWD, 1_001 + DEVCONTAINER_EXIT_GRACE_MS)).toBeNull();
  });
});

describe("a cell whose session ends because its devcontainer is rebuilt or stopped", () => {
  it("stays open through a rebuild and resumes the same session in place once it succeeds", async () => {
    const w = mountCell(1, "sess-1");
    await flushPromises();
    await w.find('[data-testid="cell-devcontainer-rebuild"]').trigger("click");
    await flushPromises();
    const before = connectKey(w);

    await endSession(w); // the container went away mid-rebuild
    expect(w.emitted("close")).toBeUndefined();
    expect(connectKey(w)).toBe(before); // nothing to resume into yet

    finishUp(true);
    await flushPromises();
    expect(w.emitted("close")).toBeUndefined();
    expect(connectKey(w)).toBe(before + 1);
    w.unmount();
  });

  it("resumes at once when the exit frame lands after the rebuild returned", async () => {
    const w = mountCell(1, "sess-1");
    await flushPromises();
    await w.find('[data-testid="cell-devcontainer-rebuild"]').trigger("click");
    await flushPromises();
    finishUp(true);
    await flushPromises();
    const before = connectKey(w);

    await endSession(w);
    expect(w.emitted("close")).toBeUndefined();
    expect(connectKey(w)).toBe(before + 1);
    w.unmount();
  });

  it("keeps the cell but resumes nothing when the rebuild failed", async () => {
    const w = mountCell(1, "sess-1");
    await flushPromises();
    await w.find('[data-testid="cell-devcontainer-rebuild"]').trigger("click");
    await flushPromises();
    const before = connectKey(w);
    await endSession(w);
    finishUp(false);
    await flushPromises();
    expect(w.emitted("close")).toBeUndefined();
    expect(connectKey(w)).toBe(before);
    w.unmount();
  });

  it("holds and resumes ANOTHER cell open on the same directory too", async () => {
    const asker = mountCell(1, "sess-1");
    const other = mountCell(2, "sess-2");
    await flushPromises();
    await asker.find('[data-testid="cell-devcontainer-rebuild"]').trigger("click");
    await flushPromises();
    const before = connectKey(other);
    await endSession(other);
    finishUp(true);
    await flushPromises();
    expect(other.emitted("close")).toBeUndefined();
    expect(connectKey(other)).toBe(before + 1);
    asker.unmount();
    other.unmount();
  });

  it("stays open through a stop and resumes on the host once it succeeds", async () => {
    const w = mountCell(1, "sess-1");
    await flushPromises();
    await w.find('[data-testid="cell-devcontainer-stop"]').trigger("click");
    await flushPromises();
    const before = connectKey(w);
    await endSession(w);
    finishDown(true);
    await flushPromises();
    expect(w.emitted("close")).toBeUndefined();
    expect(connectKey(w)).toBe(before + 1);
    w.unmount();
  });

  it("still closes a cell whose session ends with no devcontainer operation in flight", async () => {
    const w = mountCell(1, "sess-1");
    await flushPromises();
    await endSession(w);
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });
});
