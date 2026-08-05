import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RoundTableMenu from "../../../src/components/RoundTableMenu.vue";
import { DEFAULT_TURN_BUDGET, MAX_MEMBERS } from "../../../src/composables/roundTableRules";
import type { HandoffTarget } from "../../../src/composables/useHandoff";

const target = (n: number): HandoffTarget => ({ key: `cell-${n}`, label: `#${n}`, source: { sessionId: `S${n}`, cwd: "/w", agent: "claude" } });
const render = (targets: HandoffTarget[], running = false) => mount(RoundTableMenu, { props: { targets, selfLabel: "#1", running } });

const seats = (w: ReturnType<typeof render>) => w.findAll('[data-testid="round-table-seat"]');

describe("RoundTableMenu", () => {
  // This picker IS the admission control: agents cannot see each other or join anything, so a
  // table exists only because a human ticked these boxes.
  it("offers a seat for every readable terminal", () => {
    expect(seats(render([target(2), target(3)]))).toHaveLength(2);
  });

  it("cannot start until at least one other terminal is picked", async () => {
    const w = render([target(2), target(3)]);
    const start = w.find('[data-testid="round-table-start"]');
    expect(start.attributes("disabled")).toBeDefined(); // one cell talking to itself answers nothing
    await seats(w)[0]?.setValue(true);
    expect(w.find('[data-testid="round-table-start"]').attributes("disabled")).toBeUndefined();
  });

  it("starts a table with the picked terminals and the chosen budget", async () => {
    const w = render([target(2), target(3)]);
    await seats(w)[1]?.setValue(true);
    await w.find('[data-testid="round-table-start"]').trigger("click");
    const started = w.emitted("start");
    expect(started).toHaveLength(1);
    expect((started?.[0]?.[0] as HandoffTarget[]).map((t) => t.key)).toEqual(["cell-3"]);
    expect(started?.[0]?.[1]).toBe(DEFAULT_TURN_BUDGET);
  });

  // The cap counts the starting cell, which always has a seat — so the user may tick one fewer
  // than the table holds, and the boxes past it refuse rather than being silently dropped later.
  it("stops ticking once the table is full, counting the cell that starts it", async () => {
    const many = Array.from({ length: MAX_MEMBERS + 2 }, (_, i) => target(i + 2));
    const w = render(many);
    // Only the boxes a user could actually click — the rest are disabled, which is the refusal.
    for (const box of seats(w)) {
      if (box.attributes("disabled") === undefined) await box.setValue(true);
    }
    expect(seats(w).filter((box) => box.attributes("disabled") !== undefined)).toHaveLength(3);

    // The contract, rather than the DOM's idea of checked: what the table is actually started with.
    await w.find('[data-testid="round-table-start"]').trigger("click");
    const chosen = w.emitted("start")?.[0]?.[0] as HandoffTarget[];
    expect(chosen).toHaveLength(MAX_MEMBERS - 1); // the starting cell holds the last seat
  });

  it("offers stop instead of start while a table is running", () => {
    const w = render([target(2)], true);
    expect(w.find('[data-testid="round-table-start"]').exists()).toBe(false);
    expect(w.find('[data-testid="round-table-stop"]').exists()).toBe(true);
  });

  it("emits stop when the running table is stopped", async () => {
    const w = render([target(2)], true);
    await w.find('[data-testid="round-table-stop"]').trigger("click");
    expect(w.emitted("stop")).toHaveLength(1);
  });

  it("does not let seats change while a table is running", () => {
    const w = render([target(2), target(3)], true);
    expect(seats(w).every((box) => box.attributes("disabled") !== undefined)).toBe(true);
  });
});
