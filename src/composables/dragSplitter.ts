/** One splitter drag: follow the pointer until it is released, then remember where it landed.
 *  Shared by all three separators beside an enlarged cell (#1077).
 *
 *  `resize` — the pointer's travel along the axis turned into a new size — is the caller's,
 *  because the SIGN is the only thing that differs between them and it is the part worth
 *  reading at the call site: a side before its separator grows as the pointer advances, a side
 *  after it shrinks. */
export type SplitterDrag = {
  axis: (e: PointerEvent) => number;
  size: () => number;
  resize: (start: number, travel: number) => void;
  key: string;
  remember: (key: string, value: string) => void;
};

/** Every way this drag hears from the pointer, added and removed as ONE.
 *
 *  A drag ends three ways, not two. `pointerup` and `pointercancel` arrive at `window`; the third
 *  arrives at the separator, because the browser releases capture implicitly when the capturing
 *  element leaves the document — the pane closing under a held button — and sends neither of the
 *  other two. Missing any one of them leaves the rest armed with nothing to tear them down, which
 *  is #1899 by another route, so the pairing lives here rather than in two places that must agree. */
const bindDrag = (separator: HTMLElement | null, onMove: (e: PointerEvent) => void, onEnd: (e: PointerEvent) => void): (() => void) => {
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onEnd);
  window.addEventListener("pointercancel", onEnd);
  separator?.addEventListener("lostpointercapture", onEnd);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
    separator?.removeEventListener("lostpointercapture", onEnd);
  };
};

export function dragSplitter(spec: SplitterDrag): (e: PointerEvent) => void {
  // One drag at a time per separator. A second press — a second finger on the same 5px bar —
  // would otherwise open a second closure with its own origin, and the two would fight over the
  // size and each persist it. The new press TAKES OVER rather than being ignored: a drag whose
  // end never arrived would otherwise leave the separator dead for good, which is a worse
  // failure than the one being fixed here.
  let live: (() => void) | null = null;
  return (e) => {
    live?.();
    const origin = spec.axis(e);
    const start = spec.size();
    // CAPTURE THE POINTER, or an iframe beside the separator eats the drag (#1899).
    //
    // Pointer events go to whatever is under the cursor, and nothing inside an iframe reaches
    // this document — not even on `window` in the capture phase. While the width is free the
    // separator keeps up with the cursor and stays under it, which hides this; the moment the
    // pointer outruns it (a fast drag, or any drag once the width clamps) the cursor lands on
    // the pane's iframe and BOTH the moves and the release are lost. The drag then never ends:
    // the listeners stay on, and moving back over this document resizes with no button held.
    // Capturing retargets every event for this pointer to the separator, so they reach those
    // listeners whatever they pass over.
    const separator = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    separator?.setPointerCapture(e.pointerId);
    // Only THIS pointer steers the drag. A second touch or pen is a separate pointer whose
    // events still bubble here, and subscribing to `pointercancel` is what makes that reachable:
    // a stray finger cancelled by the browser's own scrolling would otherwise end a drag the
    // user is still making.
    const mine = (ev: PointerEvent) => ev.pointerId === e.pointerId;
    const onMove = (ev: PointerEvent) => {
      if (mine(ev)) spec.resize(start, spec.axis(ev) - origin);
    };
    const onEnd = (ev: PointerEvent) => {
      if (mine(ev)) stop();
    };
    const unbind = bindDrag(separator, onMove, onEnd);
    const stop = () => {
      live = null;
      unbind(); // before the release, which fires `lostpointercapture` in turn
      if (separator?.hasPointerCapture(e.pointerId)) separator.releasePointerCapture(e.pointerId);
      spec.remember(spec.key, String(spec.size()));
    };
    live = stop;
  };
}
