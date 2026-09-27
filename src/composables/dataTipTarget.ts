// Which element a `data-tip` belongs to, from wherever an event landed inside it.
export const DATA_TIP_SELECTOR = "[data-tip]";

export interface DataTipTarget {
  anchor: Element;
  text: string;
}

/** The nearest `data-tip` element at or above `target`, with its words. A blank tip is no tip, so
 *  an element whose tip is bound to an empty value behaves as if it had none. */
export function findDataTip(target: EventTarget | null): DataTipTarget | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest(DATA_TIP_SELECTOR);
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
