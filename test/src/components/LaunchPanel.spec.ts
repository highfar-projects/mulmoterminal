// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import LaunchPanel from "../../../src/components/LaunchPanel.vue";
import { customAgentPick } from "../../../common/customAgents";

// The panel mounts the real CellLaunchForm, which reads the directory's worktrees and sessions on
// open. Empty answers are the ordinary case and keep the assertions about the PANEL.
function mockFetch() {
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/worktrees")) return { ok: true, json: async () => ({ isGit: false, base: null, worktrees: [] }) };
    if (u.includes("/api/sessions")) return { ok: true, json: async () => ({ cwd: "/repo", sessions: [] }) };
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const mountPanel = (initialDir: string | null = "/home/me/proj") =>
  mount(LaunchPanel, {
    props: { initialDir, defaultCwd: "/home/me/workspace", presets: [], launchers: [], customAgents: [] },
    attachTo: document.body,
  });

beforeEach(mockFetch);

describe("LaunchPanel", () => {
  it("opens on the directory it was handed, not the workspace", async () => {
    const w = mountPanel("/home/me/proj");
    await flushPromises();
    expect((w.find('[data-testid="cell-dir-input"]').element as HTMLInputElement).value).toBe("/home/me/proj");
  });

  // Opening from the toolbar names no cell, so there is no directory to carry: the workspace is the
  // answer rather than an empty field the user has to fill before anything can start.
  it("falls back to the workspace when no directory was handed in", async () => {
    const w = mountPanel(null);
    await flushPromises();
    expect((w.find('[data-testid="cell-dir-input"]').element as HTMLInputElement).value).toBe("/home/me/workspace");
  });

  // The form's own `start` carries only the dir. In a cell the picker's state WAS the cell's, so
  // nothing had to say what was picked; a host outside the grid has to be told.
  it("reports the picked agent alongside the directory on start", async () => {
    const w = mountPanel();
    await flushPromises();
    w.findComponent({ name: "CellLaunchForm" }).vm.$emit("update:agent", customAgentPick("kimi_k3"));
    await flushPromises();
    w.findComponent({ name: "CellLaunchForm" }).vm.$emit("start", "/home/me/other");
    expect(w.emitted("start")?.[0]).toEqual([{ dir: "/home/me/other", pick: customAgentPick("kimi_k3") }]);
  });

  it("starts on Claude however the panel was opened", async () => {
    const w = mountPanel();
    await flushPromises();
    w.findComponent({ name: "CellLaunchForm" }).vm.$emit("start", "/home/me/proj");
    expect(w.emitted("start")?.[0]).toEqual([{ dir: "/home/me/proj", pick: "claude" }]);
  });

  // The close button lives in the form and is shown only for a `cancellable` one. The panel is
  // always cancellable — unlike the grid's entry cell, it is something the user opened.
  it("is closable, and the close reaches the host", async () => {
    const w = mountPanel();
    await flushPromises();
    const close = w.find('[data-testid="cell-launch-cancel"]');
    expect(close.exists()).toBe(true);
    await close.trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("focuses the directory field so Enter alone can start", async () => {
    const w = mountPanel();
    await flushPromises();
    expect(document.activeElement).toBe(w.find('[data-testid="cell-dir-input"]').element);
  });
});
