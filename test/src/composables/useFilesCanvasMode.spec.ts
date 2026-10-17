import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import type { CanvasCardResult } from "../../../src/composables/canvasOpenFile";

// The card builder is the one thing this composable waits on; each call is handed out to the test,
// so the order the answers land in is the test's to choose.
const pending = vi.hoisted(() => ({ calls: [] as Array<{ path: string; answer: (result: CanvasCardResult) => void }> }));
vi.mock("../../../src/composables/canvasOpenFile", async (orig) => {
  const actual = await orig<typeof import("../../../src/composables/canvasOpenFile")>();
  return {
    ...actual,
    buildCanvasCard: (path: string) => new Promise<CanvasCardResult>((resolve) => pending.calls.push({ path, answer: resolve })),
  };
});

const { useFilesCanvasMode } = await import("../../../src/composables/useFilesCanvasMode");

const cardFor = (docPath: string): CanvasCardResult => ({ kind: "card", card: { toolName: "presentDocument", data: { markdown: "", docPath } } });

function setup(saveResult = true, declineSwitch = false, enabled = true) {
  const openPath = ref<string | null>("a.md");
  const fileError = ref<string | null>(null);
  const savedInPlace = vi.fn(async () => saveResult);
  // A front-tab switch that lands, unless the test says the pane declined it.
  const open = vi.fn(async (path: string) => {
    if (!declineSwitch) openPath.value = path;
  });
  const scope = effectScope();
  const deps = {
    enabled: () => enabled,
    cwd: () => "/proj",
    storiesRoots: () => ({ workspaces: [], roots: [] }),
    file: { openPath, savedInPlace, fileError },
    tabs: { open },
  };
  const mode = scope.run(() => useFilesCanvasMode(deps));
  if (!mode) throw new Error("no composable");
  return { mode, openPath, fileError, savedInPlace };
}

describe("useFilesCanvasMode", () => {
  beforeEach(() => {
    pending.calls = [];
  });

  it("builds the open file's card, joined under the cwd, after saving the buffer", async () => {
    const { mode, savedInPlace } = setup();
    await mode.show("a.md");
    await nextTick();
    expect(savedInPlace).toHaveBeenCalled();
    expect(pending.calls.map((call) => call.path)).toEqual(["/proj/a.md"]);
    pending.calls[0].answer(cardFor("/proj/a.md"));
    await flushPromises();
    expect(mode.active.value).toBe(true);
    expect(mode.card.value).toMatchObject({ toolName: "presentDocument", data: { docPath: "/proj/a.md" } });
    expect(typeof mode.card.value?.uuid).toBe("string");
  });

  it("stays off when the buffer could not be saved", async () => {
    const { mode } = setup(false);
    expect(await mode.show("a.md")).toBe(false);
    await nextTick();
    expect(mode.active.value).toBe(false);
    expect(pending.calls).toHaveLength(0);
  });

  it("hands on the server's refusal and turns the mode back off", async () => {
    const { mode, fileError } = setup();
    await mode.show("a.md");
    await nextTick();
    pending.calls[0].answer({ kind: "refused", reason: "File not found" });
    await flushPromises();
    expect(fileError.value).toBe("File not found");
    expect(mode.active.value).toBe(false);
    expect(mode.card.value).toBeNull();
  });

  // A story is a round trip; switching tabs while it is out must not draw the old file under the new one.
  it("drops a card that lands after the front tab moved on", async () => {
    const { mode, openPath } = setup();
    await mode.show("a.md");
    await nextTick();
    openPath.value = "b.md";
    await nextTick();
    pending.calls[0].answer(cardFor("/proj/a.md"));
    await flushPromises();
    expect(mode.card.value).toBeNull();
    expect(mode.active.value).toBe(false); // b.md was never switched to the Canvas
  });

  it("brings each tab back the way it was left, and rebuilds the card for it", async () => {
    const { mode, openPath } = setup();
    await mode.show("a.md");
    await nextTick();
    pending.calls[0].answer(cardFor("/proj/a.md"));
    await flushPromises();
    openPath.value = "b.md";
    await nextTick();
    expect(mode.active.value).toBe(false);
    expect(mode.card.value).toBeNull();
    openPath.value = "a.md";
    await nextTick();
    expect(mode.active.value).toBe(true);
    expect(pending.calls.map((call) => call.path)).toEqual(["/proj/a.md", "/proj/a.md"]);
  });

  // Builds once per arrival, not once per watcher: a switch onto a Canvas-mode tab moves both inputs.
  it("builds once when switching between two tabs that are both in Canvas mode", async () => {
    const { mode, openPath } = setup();
    await mode.show("a.md");
    openPath.value = "b.md";
    await mode.show("b.md");
    await nextTick();
    const before = pending.calls.length;
    openPath.value = "a.md";
    await nextTick();
    expect(pending.calls).toHaveLength(before + 1);
  });

  it("toggles off and back on, minting a fresh card so the view reads the file again", async () => {
    const { mode } = setup();
    await mode.toggle();
    await nextTick();
    pending.calls[0].answer(cardFor("/proj/a.md"));
    await flushPromises();
    const first = mode.card.value?.uuid;
    await mode.toggle();
    await nextTick();
    expect(mode.active.value).toBe(false);
    expect(mode.card.value).toBeNull();
    await mode.toggle();
    await nextTick();
    pending.calls[1].answer(cardFor("/proj/a.md"));
    await flushPromises();
    expect(mode.card.value?.uuid).not.toBe(first);
  });

  // The view has already written the file; the update only keeps the local copy in step.
  it("merges a view's update into the card it holds", async () => {
    const { mode } = setup();
    await mode.show("a.md");
    await nextTick();
    pending.calls[0].answer(cardFor("/proj/a.md"));
    await flushPromises();
    const uuid = mode.card.value?.uuid;
    mode.onUpdateResult({ data: { markdown: "edited", docPath: "/proj/a.md" } });
    expect(mode.card.value).toMatchObject({ uuid, data: { markdown: "edited" } });
  });

  // The row's entry: the file comes to the front first, and only a file that did is drawn.
  it("opens a row's file as the front tab and switches it to the Canvas", async () => {
    const { mode, openPath } = setup();
    await mode.open("b.md");
    await nextTick();
    expect(openPath.value).toBe("b.md");
    expect(mode.active.value).toBe(true);
    expect(pending.calls.map((call) => call.path)).toEqual(["/proj/b.md"]);
  });

  it("does not switch the Canvas on when the pane declined to bring the file forward", async () => {
    const { mode, openPath, savedInPlace } = setup(true, true);
    await mode.open("b.md");
    await nextTick();
    expect(openPath.value).toBe("a.md");
    expect(savedInPlace).not.toHaveBeenCalled();
    expect(mode.active.value).toBe(false);
  });

  // The paths are relative to the root, so a re-root must not carry them over.
  it("drops every path and any build in flight on reset", async () => {
    const { mode } = setup();
    await mode.show("a.md");
    await nextTick();
    mode.reset();
    await nextTick();
    pending.calls[0].answer(cardFor("/proj/a.md"));
    await flushPromises();
    expect(mode.active.value).toBe(false);
    expect(mode.card.value).toBeNull();
  });

  // #3011: paths come back from storage, and a surface with no Canvas view must never act on them.
  it("is never active on a surface without a Canvas view, whatever paths it holds", async () => {
    const { mode } = setup(true, false, false);
    mode.reset(["a.md"]);
    await nextTick();
    expect(mode.has("a.md")).toBe(true);
    expect(mode.active.value).toBe(false);
    expect(pending.calls).toHaveLength(0);
  });

  it("restores the paths a remembered pane had in the Canvas view", async () => {
    const { mode } = setup();
    mode.reset(["a.md"]);
    await nextTick();
    expect(mode.active.value).toBe(true);
    expect(pending.calls.map((call) => call.path)).toEqual(["/proj/a.md"]);
  });

  it("does nothing on a toggle with no file open", async () => {
    const { mode, openPath, savedInPlace } = setup();
    openPath.value = null;
    await mode.toggle();
    expect(savedInPlace).not.toHaveBeenCalled();
    expect(mode.active.value).toBe(false);
  });

  // A save is a round trip, and the pane can move on before it lands — an inherited Canvas view
  // (#3075) is put up right after a file opens, so the next click can overtake it.
  it("does not put a file in the Canvas view once another file is in front", async () => {
    const { mode, openPath, savedInPlace } = setup();
    let finishSave: (saved: boolean) => void = () => {};
    savedInPlace.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishSave = resolve)));
    const showing = mode.show("a.md");
    openPath.value = "b.md";
    finishSave(true);
    expect(await showing).toBe(false);
    expect(mode.has("a.md")).toBe(false);
    expect(mode.active.value).toBe(false);
  });
});
