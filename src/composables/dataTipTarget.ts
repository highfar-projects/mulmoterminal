// Which element a `data-tip` belongs to, from wherever an event landed inside it.
export const DATA_TIP_SELECTOR = "[data-tip]";

export interface DataTipTarget {
  anchor: Element;
  text: string;
}

/** Where an event actually landed. Seen from a document listener, `event.target` of an event from
 *  inside a shadow root (a plugin view) is the shadow HOST; the composed path still starts at the
 *  element itself. */
export function eventOrigin(event: Event): Element | null {
  const [first] = event.composedPath();
  const origin = first ?? event.target;
  if (origin instanceof Element) return origin;
  return origin instanceof Node ? origin.parentElement : null;
}

function nearestTipElement(el: Element): Element | null {
  const inTree = el.closest(DATA_TIP_SELECTOR);
  if (inTree) return inTree;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? nearestTipElement(root.host) : null;
}

/** The nearest `data-tip` element at or above `target`, crossing out of shadow roots, with its
 *  words. A blank tip is no tip, so an element whose tip is bound to an empty value behaves as if
 *  it had none. */
export function findDataTip(target: EventTarget | null): DataTipTarget | null {
  if (!(target instanceof Element)) return null;
  const anchor = nearestTipElement(target);
  const text = anchor?.getAttribute("data-tip")?.trim() ?? "";
  return anchor && text ? { anchor, text } : null;
}

/** Whether focus arrived by keyboard. A click focuses a button right after the pointerdown that
 *  closed the tip, so opening on every focus would bring it straight back. */
export function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}
