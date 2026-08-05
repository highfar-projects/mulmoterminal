import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CellLaunchForm from "../../../src/components/CellLaunchForm.vue";
import LaunchChipList from "../../../src/components/LaunchChipList.vue";
import ModelPicker from "../../../src/components/ModelPicker.vue";
import type { AgentPick } from "../../../common/customAgents";

// The launch form's rows were each capped at a fixed pixel width, so an enlarged cell drew a narrow
// centred column and left the rest empty — 25 chips wrapping into 20 rows inside 360px while the
// cell was 1535px wide. Nothing pinned that cap, so nothing failed when it changed; this is the
// guard, and it is written against ANY pixel cap rather than the one number that was there, because
// re-introducing the shape is the regression, not re-introducing 360.
const PIXEL_CAP = /max-w-\[\d+px\]/;

const capsIn = (html: string): string[] => html.match(new RegExp(PIXEL_CAP, "g")) ?? [];

describe("the launch form takes the cell's width", () => {
  beforeEach(() => {
    // A worktree and a session, because their two rows render only once those fetches land — the
    // form's initial DOM has neither, so asserting on it would quietly cover fewer rows than the
    // test claims (CodeRabbit on #1455).
    globalThis.fetch = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/worktrees"))
        return {
          ok: true,
          json: async () => ({ isGit: true, base: "main", worktrees: [{ path: "/repo/../wt", branch: "fix-login", task: "fix-login", dirty: false }] }),
        };
      if (u.includes("/api/sessions")) return { ok: true, json: async () => ({ cwd: "/repo", sessions: [{ id: "s1", title: "a session", mtime: 1 }] }) };
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;
  });

  const mountForm = async () => {
    const w = mount(CellLaunchForm, {
      props: {
        dir: "/repo",
        agent: "claude" as AgentPick,
        choice: null,
        defaultCwd: "/home/me/ws",
        presets: [{ label: "repo", path: "/repo" }],
        openSessionIds: [],
      },
    });
    await flushPromises();
    return w;
  };

  it("caps no row at a fixed pixel width", async () => {
    const w = await mountForm();
    expect(capsIn(w.html())).toEqual([]);
  });

  // Every direct child spans the form, so the width the form is given is the width they get. The
  // agent picker is the one exception and stays content-sized: it is a segmented control, and
  // stretching it would widen the pill's background rather than fit anything into it.
  it("gives every row the full width, and leaves the agent picker its own", async () => {
    const w = await mountForm();
    // The two rows that arrive with the fetches, named so a fixture that stops producing them
    // fails here rather than silently shrinking what the loop below walks.
    expect(w.find('[data-testid="cell-worktrees"]').exists()).toBe(true);
    expect(w.find('[data-testid="cell-resume"]').exists()).toBe(true);

    const rows = [...w.get('[data-testid="cell-launch"]').element.children].filter((el) => el.getAttribute("data-testid") !== "cell-launch-cancel");
    const picker = rows.find((el) => el.getAttribute("data-testid") === "agent-picker");
    // classList, not a substring of the class string: "max-w-full" contains "w-full".
    expect([...(picker?.classList ?? [])]).toContain("max-w-full");
    expect([...(picker?.classList ?? [])]).not.toContain("w-full");
    rows.filter((el) => el !== picker).forEach((el) => expect([...el.classList]).toContain("w-full"));
  });

  it("spans the width in the chip lists it stacks", () => {
    const w = mount(LaunchChipList, {
      props: { heading: "or run a script", icon: "play_arrow", chips: [{ key: 0, label: "build", title: "yarn build" }] },
    });
    expect(capsIn(w.html())).toEqual([]);
    expect(w.get("div").classes()).toContain("w-full");
  });

  // The picker's WRAPPER is what this file is about — the row the form stacks. The `<select>` inside
  // it takes its width from SELECT_CONTROL, which every select in the app shares, so pinning it from
  // here would tie one launch-form test to a decision made for the whole app.
  it("spans the width in the model picker's row", () => {
    const w = mount(ModelPicker, { props: { modelValue: null } });
    expect(capsIn(w.html())).toEqual([]);
    expect(w.get("div").classes()).toContain("w-full");
  });
});
