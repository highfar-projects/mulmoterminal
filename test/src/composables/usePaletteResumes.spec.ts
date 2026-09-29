import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, nextTick, ref, shallowRef, type ShallowRef } from "vue";
import { mount } from "@vue/test-utils";
import type { ResumableList } from "../../../src/composables/useDirLists";

const calls = vi.hoisted(() => [] as unknown[][]);
const listed: { list: ShallowRef<ResumableList> | null } = { list: null };
vi.mock("../../../src/composables/useDirLists", () => ({
  useResumableSessions: () => {
    const value = shallowRef<ResumableList>({ cwd: null, sessions: [] });
    listed.list = value;
    return {
      value,
      forget: () => calls.push(["forget"]),
      load: async (dir: string | null, agent: string) => calls.push(["load", dir, agent]),
    };
  },
}));

const { usePaletteResumes } = await import("../../../src/composables/usePaletteResumes");

describe("usePaletteResumes", () => {
  it("reads the directory's list as it opens, and again, from empty, when the directory or agent moves", async () => {
    calls.length = 0;
    const dir = ref<string | null>("/w/app");
    const agent = ref<"claude" | "codex">("claude");
    const w = mount(
      defineComponent({
        setup() {
          usePaletteResumes({ dir: () => dir.value, agent: () => agent.value, openSessionIds: () => ["b"] });
          return () => h("div");
        },
      }),
    );
    expect(calls).toEqual([["forget"], ["load", "/w/app", "claude"]]);
    agent.value = "codex";
    await nextTick();
    dir.value = "/w/other";
    await nextTick();
    expect(calls.slice(2)).toEqual([["forget"], ["load", "/w/app", "codex"], ["forget"], ["load", "/w/other", "codex"]]);
    w.unmount();
  });

  it("leaves out what the grid already has open", async () => {
    const w = mount(
      defineComponent({
        setup() {
          const { resumes } = usePaletteResumes({ dir: () => "/w", agent: () => "claude", openSessionIds: () => ["b"] });
          return () => h("div", resumes.value.map((resume) => resume.id).join(","));
        },
      }),
    );
    if (listed.list)
      listed.list.value = {
        cwd: "/w",
        sessions: [
          { id: "a", title: "A", mtime: 1 },
          { id: "b", title: "B", mtime: 1 },
        ],
      };
    await nextTick();
    expect(w.text()).toBe("a");
    w.unmount();
  });
});
