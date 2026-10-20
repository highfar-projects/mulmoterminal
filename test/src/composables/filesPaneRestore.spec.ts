import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { restorePaneState, type PaneRestoreDeps } from "../../../src/composables/filesPaneRestore";
import type { FilesPaneState } from "../../../src/components/filesPaneState";

// #3122. The side-by-side switch comes back with the pane. The pane's teardown clears it before every
// start, so the restore only ever turns it on — and never once its own start has gone stale.
function deps(opts: { openDuringRestore?: boolean; switchedOn?: boolean } = {}) {
  let generation = 0;
  const switchedOn = ref(opts.switchedOn ?? false);
  const restoreDeps: PaneRestoreDeps = {
    tree: { findNode: () => null, toggleDir: async () => {} },
    file: { generation: () => generation },
    canvasMode: { reset: () => {} },
    tabs: {
      restore: async () => {
        if (opts.openDuringRestore) generation += 1;
      },
    },
    sideBySide: { switchedOn },
    treeEl: () => null,
  };
  return { restoreDeps, switchAfter: () => switchedOn.value };
}

const pane = (fields: Partial<FilesPaneState> = {}): FilesPaneState => ({ tabs: [{ path: "a.md" }], activePath: "a.md", expanded: [], ...fields });

describe("restorePaneState and the side-by-side switch", () => {
  it("puts it back on when the cell's pane was left with it on", async () => {
    const { restoreDeps, switchAfter } = deps();
    await restorePaneState(restoreDeps, pane({ sideBySide: true }), 0);
    expect(switchAfter()).toBe(true);
  });

  it("leaves it off when the cell's pane was left with it off", async () => {
    const { restoreDeps, switchAfter } = deps();
    await restorePaneState(restoreDeps, pane(), 0);
    expect(switchAfter()).toBe(false);
  });

  it("leaves it off when nothing is remembered for the cell", async () => {
    const { restoreDeps, switchAfter } = deps();
    await restorePaneState(restoreDeps, null, 0);
    expect(switchAfter()).toBe(false);
  });

  // A pane opened FOR a file (#1979) starts on it as text, the rule the Canvas view already follows.
  it("leaves it off when an open arrived before the restore did", async () => {
    const { restoreDeps, switchAfter } = deps();
    await restorePaneState(restoreDeps, pane({ sideBySide: true }), -1);
    expect(switchAfter()).toBe(false);
  });

  // Opening the remembered file is itself a load and moves the generation, so the decision has to
  // come before it — asked after, every restore would read as "an open arrived first".
  it("decides before opening the remembered file, whose own load moves the generation", async () => {
    const { restoreDeps, switchAfter } = deps({ openDuringRestore: true });
    await restorePaneState(restoreDeps, pane({ sideBySide: true }), 0);
    expect(switchAfter()).toBe(true);
  });

  // A newer start tore the pane down (moving the generation) and put its own cell's switch on; the
  // older start's restore, finishing late, must not reach it either way.
  it("leaves a newer start's switch alone when its own start has gone stale", async () => {
    const { restoreDeps, switchAfter } = deps({ switchedOn: true });
    await restorePaneState(restoreDeps, pane(), -1);
    expect(switchAfter()).toBe(true);
  });
});
