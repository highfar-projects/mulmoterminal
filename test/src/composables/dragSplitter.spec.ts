import { describe, it, expect, vi, afterEach } from "vitest";
import { dragSplitter } from "../../../src/composables/dragSplitter";

// jsdom implements no pointer capture at all (`setPointerCapture` is undefined), so the separator
// carries its own — which is also what lets a test assert that the drag ASKED for it. #1899 was
// the drag not asking: an iframe beside the separator then swallowed every move and the release,
// and nothing here could observe that, because jsdom has no iframe hit-testing either.
const separator = () => {
  const el = document.createElement("div");
  const held = new Set<number>();
  Object.assign(el, {
    setPointerCapture: (id: number) => held.add(id),
    releasePointerCapture: (id: number) => held.delete(id),
    hasPointerCapture: (id: number) => held.has(id),
  });
  return { el, held };
};

const start = (el: HTMLElement, handler: (e: PointerEvent) => void, clientX: number, pointerId = 7) => {
  const listener = (e: Event) => {
    if (e instanceof PointerEvent) handler(e);
  };
  el.addEventListener("pointerdown", listener);
  el.dispatchEvent(new PointerEvent("pointerdown", { clientX, pointerId, bubbles: true }));
  el.removeEventListener("pointerdown", listener);
};

const move = (clientX: number, pointerId = 7) => window.dispatchEvent(new PointerEvent("pointermove", { clientX, pointerId, bubbles: true }));
const end = (type: string, pointerId = 7) => window.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }));

const drag = (over: { size: number }, remember = vi.fn()) => ({
  remember,
  spec: {
    axis: (e: PointerEvent) => e.clientX,
    size: () => over.size,
    resize: (from: number, travel: number) => (over.size = from + travel),
    key: "pane-width",
    remember,
  },
});

afterEach(() => vi.restoreAllMocks());

describe("dragSplitter", () => {
  it("resizes by the pointer's travel from where the drag started", () => {
    const state = { size: 400 };
    const { spec } = drag(state);
    const { el } = separator();
    start(el, dragSplitter(spec), 100);
    move(160);
    expect(state.size).toBe(460);
    move(90);
    expect(state.size).toBe(390);
  });

  it("captures the pointer on the separator, so an iframe cannot take the drag (#1899)", () => {
    const state = { size: 400 };
    const { spec } = drag(state);
    const { el, held } = separator();
    expect(held.has(7)).toBe(false);
    start(el, dragSplitter(spec), 100, 7);
    expect(held.has(7)).toBe(true);
  });

  it.each(["pointerup", "pointercancel"])("ends the drag on %s: releases the capture, remembers, stops resizing", (ending) => {
    const state = { size: 400 };
    const remember = vi.fn();
    const { spec } = drag(state, remember);
    const { el, held } = separator();
    start(el, dragSplitter(spec), 100, 7);
    move(160);

    end(ending);

    expect(held.has(7)).toBe(false);
    expect(remember).toHaveBeenCalledWith("pane-width", "460");
    move(300);
    expect(state.size).toBe(460);
  });

  it("remembers the size once per drag, not once per move", () => {
    const state = { size: 400 };
    const remember = vi.fn();
    const { spec } = drag(state, remember);
    const { el } = separator();
    start(el, dragSplitter(spec), 100);
    [120, 140, 160].forEach(move);
    expect(remember).not.toHaveBeenCalled();
    end("pointerup");
    expect(remember).toHaveBeenCalledTimes(1);
  });

  it("leaves nothing listening on window once the drag has ended", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { spec } = drag({ size: 400 });
    const { el } = separator();
    start(el, dragSplitter(spec), 100);
    end("pointerup");

    const names = (calls: [string, ...unknown[]][]) => calls.map(([name]) => name).sort();
    expect(names(added.mock.calls)).toEqual(["pointercancel", "pointermove", "pointerup"]);
    expect(names(removed.mock.calls)).toEqual(["pointercancel", "pointermove", "pointerup"]);
  });
  // CodeRabbit, on this PR, and independently while reading the diff: subscribing to
  // `pointercancel` is what makes a SECOND pointer able to end a drag it has nothing to do with —
  // the browser cancels a stray finger on its own during a scroll.
  it.each(["pointerup", "pointercancel"])("ignores another pointer's %s", (ending) => {
    const state = { size: 400 };
    const remember = vi.fn();
    const { spec } = drag(state, remember);
    const { el, held } = separator();
    start(el, dragSplitter(spec), 100, 7);
    move(160);

    end(ending, 9);

    expect(remember).not.toHaveBeenCalled();
    expect(held.has(7)).toBe(true);
    move(200);
    expect(state.size).toBe(500);
  });

  it("ignores another pointer's moves", () => {
    const state = { size: 400 };
    const { spec } = drag(state);
    const { el } = separator();
    start(el, dragSplitter(spec), 100, 7);
    move(160, 9);
    expect(state.size).toBe(400);
    move(160, 7);
    expect(state.size).toBe(460);
  });
});
