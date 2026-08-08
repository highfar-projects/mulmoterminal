// The phone asks the desktop grid to open a terminal in a session's directory (#831). Every kind
// in LAUNCH_AGENTS has to actually RUN — a `shell` did while `claude` and `codex` stopped at the
// cell-creation form, waiting for someone at the desktop to press Start (#1535).
//
// The two halves the report ran through are pinned here: what the GRID builds from the requested
// agent, and what the CELL does with it on mount. The mapping was green in isolation on both sides
// before — a cell with no session, no command and no launcher IS the empty launcher, and nothing
// said so.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { LAUNCH_AGENTS, type LaunchAgent } from "../../../common/launchAgent";
import { openTerminalAt } from "../../../src/composables/useNewTerminal";
import { router } from "../../../src/router";
import type { Cell } from "../../../src/components/gridTabs";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
// The live terminal, reduced to the props that say WHERE it connected and as WHAT.
vi.mock("../../../src/components/Terminal.vue", () => ({
  default: {
    name: "TerminalView",
    props: ["sessionId", "connectKey", "cwd", "agent", "launcher", "hideHeader"],
    template: '<div class="stub-term" />',
  },
}));

// Module scope, not inside a test: the import is the slow part and collection has no per-test
// budget (#1314).
const TerminalCell = (await import("../../../src/components/TerminalCell.vue")).default;
const GridView = (await import("../../../src/components/GridView.vue")).default;

const CWD = "/w/proj";
const LAUNCH_FORM = '[data-testid="cell-launch"]';

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/api/config")) {
      return { ok: true, json: async () => ({ cwd: "/w", home: "/w", cwdPresets: [], launchers: [], prRepos: [], userMcpServers: [] }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;
});

const mountCell = (props: { autoStart?: boolean; initialCwd?: string | null; initialAgent?: "claude" | "codex" }) =>
  mount(TerminalCell, {
    props: {
      uid: 1,
      expanded: false,
      zoomed: false,
      initialSessionId: null,
      initialCwd: CWD,
      defaultCwd: "/w",
      presets: [],
      home: "/w",
      cancellable: false,
      openSessionIds: [],
      openCwds: [],
      ...props,
    },
  });

describe("a cell the grid already knows what to run", () => {
  it("starts it on mount instead of opening the launcher form", async () => {
    const w = mountCell({ autoStart: true });
    await flushPromises();
    expect(w.find(LAUNCH_FORM).exists()).toBe(false);
    expect(w.find(".stub-term").exists()).toBe(true);
  });

  // The control, and the whole of #1535: the SAME cell without the flag is the empty launcher.
  it("opens the launcher form when it is not told to start", async () => {
    const w = mountCell({});
    await flushPromises();
    expect(w.find(LAUNCH_FORM).exists()).toBe(true);
    expect(w.find(".stub-term").exists()).toBe(false);
  });

  it("starts a FRESH session in the requested directory", async () => {
    const w = mountCell({ autoStart: true });
    await flushPromises();
    const term = w.findComponent({ name: "TerminalView" });
    expect(term.props("sessionId")).toBeNull(); // the server generates the id for a new session
    expect(term.props("cwd")).toBe(CWD);
  });

  // A codex request that connected on Claude's endpoint would attach the wrong agent to a real
  // session — the reason `agent` rides on the cell at all.
  it("connects on the requested agent's endpoint", async () => {
    const w = mountCell({ autoStart: true, initialAgent: "codex" });
    await flushPromises();
    expect(w.findComponent({ name: "TerminalView" }).props("agent")).toBe("codex");
  });

  it("tells the grid which agent it started, so a reload reconnects to the same endpoint", async () => {
    const w = mountCell({ autoStart: true, initialAgent: "codex" });
    await flushPromises();
    expect(w.emitted("agent")?.[0]).toEqual(["codex"]);
  });

  // Nothing sets the flag without a directory today (the host refuses a session it has no cwd for),
  // but starting a process in a guessed directory is the wrong way to fail if one ever does.
  it("falls back to the launcher form when no directory is known", async () => {
    const w = mountCell({ autoStart: true, initialCwd: null });
    await flushPromises();
    expect(w.find(LAUNCH_FORM).exists()).toBe(true);
  });
});

// What the grid builds from the request. Driven through openTerminalAt — the seam App.vue calls
// when the host publishes on LAUNCH_TERMINAL_CHANNEL — so this covers the mapping the phone hits.
const GridStub = { name: "TerminalGrid", props: ["cells", "listRows", "expandedUid", "reorderable"], template: '<div class="grid-stub" />' };
const ToolbarStub = { name: "AppToolbar", emits: ["settings"], template: "<div />" };

const mountGrid = async () => {
  await router.push("/terminals");
  const w = mount(GridView, { global: { stubs: { TerminalGrid: GridStub, AppToolbar: ToolbarStub, SettingsModal: true } } });
  await flushPromises();
  return w;
};
const cellsOf = (w: Awaited<ReturnType<typeof mountGrid>>): Cell[] => w.findComponent(GridStub).props("cells");
const openedFor = async (agent: LaunchAgent) => {
  const w = await mountGrid();
  openTerminalAt(CWD, null, agent);
  await flushPromises();
  const cell = cellsOf(w).find((c) => c.cwd === CWD);
  w.unmount();
  return cell;
};

describe("the grid's answer to a phone launch request", () => {
  // Every kind, from the list itself: a new agent added to LAUNCH_AGENTS without a running cell
  // here is the same silent failure, and it would ship the same way.
  it.each(LAUNCH_AGENTS.filter((a) => a !== "shell"))("opens a running %s cell, not the launcher", async (agent) => {
    const cell = await openedFor(agent);
    expect(cell).toBeDefined();
    expect(cell?.autoStart).toBe(true);
    expect(cell?.agent).toBe(agent === "claude" ? undefined : agent);
  });

  // The one kind that already worked, and it must not start going through the agent path: a
  // launcher runs the user's command verbatim on /ws/launch.
  it("still opens a shell as a launcher cell", async () => {
    const cell = await openedFor("shell");
    expect(cell?.launcher).toEqual({ shell: true, label: "shell" });
    expect(cell?.autoStart).toBeUndefined();
  });
});
