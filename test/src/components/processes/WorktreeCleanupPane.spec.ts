// The worktree list: reads that finish out of order must not put back a worktree just removed, and
// blocked worktrees are listed by default with what holds them.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { WorktreeCleanupRow } from "../../../../common/worktreeCleanup";

const api = vi.hoisted(() => ({ reads: [] as ((rows: WorktreeCleanupRow[] | null) => void)[] }));
vi.mock("../../../../src/composables/processesApi", () => ({
  loadWorktreeCleanup: () => new Promise((resolve) => api.reads.push(resolve)),
  removeCleanupWorktree: async () => true,
}));

const WorktreeCleanupPane = (await import("../../../../src/components/processes/WorktreeCleanupPane.vue")).default;

const row = (name: string, extra: Partial<WorktreeCleanupRow> = {}): WorktreeCleanupRow => ({
  repo: "/r",
  base: "main",
  path: `/wt/${name}`,
  branch: `agent/${name}`,
  head: "abc",
  exists: true,
  dirty: false,
  merged: true,
  inUse: false,
  ...extra,
});

beforeEach(() => {
  api.reads = [];
});

describe("WorktreeCleanupPane", () => {
  it("keeps the latest read when an earlier one finishes after it", async () => {
    const wrapper = mount(WorktreeCleanupPane);
    await wrapper.get("[data-testid=worktrees-refresh]").trigger("click");
    const [first, second] = api.reads;
    second?.([row("fresh")]);
    await flushPromises();
    first?.([row("fresh"), row("removed")]);
    await flushPromises();
    expect(wrapper.findAll("[data-testid=worktrees-row]").map((r) => r.text())).toEqual([expect.stringContaining("/wt/fresh")]);
  });

  it("lists a blocked worktree by default, with what holds it, and offers no Remove for it", async () => {
    const wrapper = mount(WorktreeCleanupPane);
    api.reads[0]?.([row("ok"), row("busy", { dirty: true })]);
    await flushPromises();
    expect(wrapper.findAll("[data-testid=worktrees-row]")).toHaveLength(2);
    expect(wrapper.findAll("[data-testid=worktrees-blocker]")).toHaveLength(1);
    expect(wrapper.findAll("[data-testid=worktrees-remove]")).toHaveLength(1);
  });
});
