// The shared hover tip for every element carrying `data-tip`, from one set of document
// listeners. It replaces `title`, whose delay belongs to the browser and cannot be shortened.
import { watch } from "vue";
import { HOVER_TIP_ID, hideHoverTip, newHoverTipOwner, showHoverTipAt, useHoverTipState } from "./useHoverTip";
import { findDataTip, isKeyboardFocus, type DataTipTarget } from "./dataTipTarget";

const DESCRIBED_BY = "aria-describedby";

interface DataTipState {
  anchor: Element | null;
  ownsDescribedBy: boolean;
  // The anchor whose tip something else closed (a click, a scroll). Moving between its own children
  // fires `pointerover` again, and reopening there would undo the click, as `title` never does.
  dismissed: Element | null;
}

export function installDataTips(root: Document = document): () => void {
  const owner = newHoverTipOwner();
  const { tip } = useHoverTipState();
  const state: DataTipState = { anchor: null, ownsDescribedBy: false, dismissed: null };

  const release = (): void => {
    if (state.ownsDescribedBy) state.anchor?.removeAttribute(DESCRIBED_BY);
    state.anchor = null;
    state.ownsDescribedBy = false;
  };
  const open = (found: DataTipTarget): void => {
    if (found.anchor === state.anchor) return;
    release();
    if (!showHoverTipAt(found.anchor, [{ head: found.text, wrap: true }], owner)) return;
    state.anchor = found.anchor;
    state.ownsDescribedBy = !found.anchor.hasAttribute(DESCRIBED_BY);
    if (state.ownsDescribedBy) found.anchor.setAttribute(DESCRIBED_BY, HOVER_TIP_ID);
  };
  const close = (): void => {
    if (tip.value?.owner === owner) hideHoverTip();
    release();
  };

  const stopWatch = watch(
    () => tip.value?.owner,
    (current) => {
      if (current === owner || !state.anchor) return;
      state.dismissed = state.anchor;
      release();
    },
  );
  const listeners = dataTipListeners({ open, close, state });
  listeners.forEach(([name, handler]) => root.addEventListener(name, handler));
  return () => {
    listeners.forEach(([name, handler]) => root.removeEventListener(name, handler));
    stopWatch();
    close();
  };
}

interface DataTipActions {
  open: (found: DataTipTarget) => void;
  close: () => void;
  state: DataTipState;
}

type Listener = [string, (event: Event) => void];

function dataTipListeners({ open, close, state }: DataTipActions): Listener[] {
  const onPointerOver = (event: Event): void => {
    if ("pointerType" in event && event.pointerType === "touch") return;
    const found = findDataTip(event.target);
    if (found && found.anchor === state.dismissed) return;
    state.dismissed = null;
    if (found) open(found);
    else close();
  };
  const onPointerOut = (event: Event): void => {
    if (!(event instanceof MouseEvent) || event.relatedTarget !== null) return;
    state.dismissed = null;
    close();
  };
  const onFocusIn = (event: Event): void => {
    const found = findDataTip(event.target);
    if (found && event.target instanceof Element && isKeyboardFocus(event.target)) open(found);
  };
  const onFocusOut = (event: Event): void => {
    if (state.anchor && findDataTip(event.target)?.anchor === state.anchor) close();
  };
  return [
    ["pointerover", onPointerOver],
    ["pointerout", onPointerOut],
    ["focusin", onFocusIn],
    ["focusout", onFocusOut],
  ];
}
