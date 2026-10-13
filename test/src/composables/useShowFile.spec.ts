import { describe, it, expect, vi } from "vitest";
import { computed, ref } from "vue";
import { showFileWith } from "../../../src/composables/useShowFile";
import type { PaneView } from "../../../common/paneCommand";

// #3022. Each view is the pane's own switches set in an order that leaves exactly that view on screen.
// The fakes keep the real relations: side by side is off while Preview is on, and turning it on from
// Preview first leaves Preview, as useSideBySide does.
function harness(start: { preview?: boolean; split?: boolean; declineOpen?: boolean } = {}) {
  const calls: string[] = [];
  const openPath = ref<string | null>(null);
  const showPreview = ref(start.preview ?? false);
  const splitOn = ref(start.split ?? false);
  const active = computed(() => splitOn.value && !showPreview.value);
  const deps = {
    tabs: {
      open: vi.fn(async (path: string) => {
        if (!start.declineOpen) openPath.value = path;
      }),
    },
    file: {
      openPath,
      showPreview,
      togglePreview: vi.fn(async () => {
        showPreview.value = !showPreview.value;
        calls.push("togglePreview");
      }),
    },
    canvasMode: {
      show: vi.fn(async (p: string) => {
        calls.push(`canvas:${p}`);
        return true;
      }),
      hide: vi.fn((p: string) => {
        calls.push(`hide:${p}`);
      }),
    },
    sideBySide: {
      active,
      toggle: vi.fn(async () => {
        calls.push("toggleSplit");
        if (active.value) splitOn.value = false;
        else {
          if (showPreview.value) showPreview.value = false;
          splitOn.value = true;
        }
      }),
    },
    openAt: vi.fn(async () => undefined),
  };
  return { show: showFileWith(deps), deps, calls, showPreview, active };
}

describe("showFileWith", () => {
  it.each<[PaneView, { preview?: boolean; split?: boolean }, string[], { preview: boolean; split: boolean }]>([
    ["editor", { preview: true }, ["hide:a.md", "togglePreview"], { preview: false, split: false }],
    ["editor", { split: true }, ["hide:a.md", "toggleSplit"], { preview: false, split: false }],
    ["preview", {}, ["hide:a.md", "togglePreview"], { preview: true, split: false }],
    ["preview", { split: true }, ["hide:a.md", "toggleSplit", "togglePreview"], { preview: true, split: false }],
    ["canvas", { split: true }, ["toggleSplit", "canvas:a.md"], { preview: false, split: false }],
    ["canvas", { preview: true }, ["canvas:a.md"], { preview: true, split: false }],
    ["split", { preview: true }, ["togglePreview", "toggleSplit", "canvas:a.md"], { preview: false, split: true }],
    ["split", { split: true }, ["canvas:a.md"], { preview: false, split: true }],
  ])("shows %s from %j", async (view, start, calls, end) => {
    const h = harness(start);
    await h.show({ path: "a.md", view });
    expect(h.calls).toEqual(calls);
    expect({ preview: h.showPreview.value, split: h.active.value }).toEqual(end);
  });

  it("opens at the line through the located open, whatever the view", async () => {
    const h = harness();
    await h.show({ path: "a.md", view: "canvas", line: 7 });
    expect(h.deps.openAt).toHaveBeenCalledWith("a.md", { line: 7, col: null }, false);
    expect(h.deps.tabs.open).not.toHaveBeenCalled();
  });

  it("changes nothing when the pane declined to bring the file forward", async () => {
    const h = harness({ declineOpen: true, preview: true });
    await h.show({ path: "a.md", view: "canvas" });
    expect(h.calls).toEqual([]);
  });
});
