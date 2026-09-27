// The shared hover tip for every element carrying `data-tip`, from one set of document
// listeners. It replaces `title`, whose delay belongs to the browser and cannot be shortened.
import { watch } from "vue";
import { HOVER_TIP_ID, hideHoverTip, newHoverTipOwner, showHoverTipAt, useHoverTipState } from "./useHoverTip";
import { eventOrigin, findDataTip, isKeyboardFocus, type DataTipTarget } from "./dataTipTarget";
import type { TipContent } from "../components/tipContent";

const DESCRIBED_BY = "aria-describedby";

const tipContent = (text: string): TipContent => [{ head: text, wrap: true }];

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
  // A tip left open over a live value (the load gauge) would otherwise keep the words it opened with.
  const textWatch = new MutationObserver(() => {
    const anchor = state.anchor;
    const found = anchor ? findDataTip(anchor) : null;
    if (anchor && found?.anchor === anchor) showHoverTipAt(anchor, tipContent(found.text), owner);
    else close();
  });

  const release = (): void => {
    textWatch.disconnect();
    if (state.ownsDescribedBy) state.anchor?.removeAttribute(DESCRIBED_BY);
    state.anchor = null;
    state.ownsDescribedBy = false;
  };
  const open = (found: DataTipTarget): void => {
    if (found.anchor === state.anchor) return;
    release();
    if (!showHoverTipAt(found.anchor, tipContent(found.text), owner)) return;
    state.anchor = found.anchor;
    textWatch.observe(found.anchor, { attributes: true, attributeFilter: ["data-tip"] });
    // An id reference does not cross a shadow boundary, so from inside one it would name nothing.
    state.ownsDescribedBy = found.anchor.getRootNode() instanceof Document && !found.anchor.hasAttribute(DESCRIBED_BY);
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
    const found = findDataTip(eventOrigin(event));
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
    const origin = eventOrigin(event);
    const found = findDataTip(origin);
    if (found && origin && isKeyboardFocus(origin)) open(found);
  };
  const onFocusOut = (event: Event): void => {
    if (state.anchor && findDataTip(eventOrigin(event))?.anchor === state.anchor) close();
  };
  return [
    ["pointerover", onPointerOver],
    ["pointerout", onPointerOut],
    ["focusin", onFocusIn],
    ["focusout", onFocusOut],
  ];
}
