// The Files pane's row context menu, as a state machine: what is open, where it sits, who gets the
// keyboard, and the window listeners that close it. Lifted out of FilesPane.vue whole — the
// `<Teleport>` that renders it stays there, so nothing about the markup moves.
//
// What stays with the pane is the two ends that touch its props and emits: which actions a row
// offers (`actionsFor`) and what picking one does (`run`). Passing those in rather than the props
// themselves is what keeps this from needing the pane's whole surface.
import { onBeforeUnmount, nextTick, ref, type Ref, type ShallowRef } from "vue";
import { menuFocusMove, type FilesRowAction } from "../components/filesRowActions";

/** The panel's geometry, as the CLAMP understands it. `widthPx` is the nominal minimum, and it is
 *  the same number the template writes as `min-w-[200px]` — a long label makes the real panel
 *  wider, and the clamp has always ignored that. Exported because a test of the clamp cannot check
 *  containment without the box, and because the next person to change the width needs to find both
 *  halves. */
export interface MenuMetrics {
  widthPx: number;
  rowPx: number;
  padPx: number;
  marginPx: number;
}
export const MENU_METRICS: MenuMetrics = { widthPx: 200, rowPx: 30, padPx: 12, marginPx: 8 };
const KEYBOARD_MENU_INSET_PX = 16;

export interface OpenRowMenu {
  actions: FilesRowAction[];
  top: number;
  left: number;
}

/** Kept inside the viewport: the pointer can be at the bottom-right corner, and a menu placed
 *  there would open off-screen with no way to reach its items. */
export function menuPosition(actions: FilesRowAction[], x: number, y: number): { top: number; left: number } {
  const { widthPx, rowPx, padPx, marginPx } = MENU_METRICS;
  const height = actions.length * rowPx + padPx;
  return {
    left: Math.max(marginPx, Math.min(x, window.innerWidth - widthPx - marginPx)),
    top: Math.max(marginPx, Math.min(y, window.innerHeight - height - marginPx)),
  };
}

export interface FilesRowMenuDeps<TRow> {
  /** The pane's template ref for the menu element — the composable does not render it. */
  menuEl: Readonly<ShallowRef<HTMLElement | null>>;
  actionsFor: (row: TRow) => FilesRowAction[];
  run: (action: FilesRowAction) => void;
}

export interface FilesRowMenu<TRow> {
  menu: Ref<OpenRowMenu | null>;
  open: (row: TRow, event: MouseEvent | KeyboardEvent) => void;
  onMenuNav: (event: KeyboardEvent) => void;
  onRowKeydown: (row: TRow, event: KeyboardEvent) => void;
  pick: (action: FilesRowAction) => void;
}

export function useFilesRowMenu<TRow>(deps: FilesRowMenuDeps<TRow>): FilesRowMenu<TRow> {
  const menu = ref<OpenRowMenu | null>(null);
  // Where the keyboard goes back to when the menu is DISMISSED rather than clicked past: its items
  // are removed with it, and focus left on a removed element drops to the top of the document.
  let opener: HTMLElement | null = null;

  const menuItems = (): HTMLElement[] => [...(deps.menuEl.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  // `restoreFocus` only where the user did NOT choose somewhere else to be: Escape and picking an
  // item leave the keyboard stranded, while a click outside has already said where focus belongs
  // — and taking it back would also fight the right-click that opens the menu on the NEXT row.
  function close(restoreFocus = false): void {
    if (!menu.value) return;
    menu.value = null;
    window.removeEventListener("pointerdown", onOutside);
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", closeFromEvent, true);
    if (restoreFocus) opener?.focus();
    opener = null;
  }

  // A listener is handed the Event as its first argument, which `restoreFocus` would read as true.
  const closeFromEvent = (): void => close();

  function onOutside(event: PointerEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (!deps.menuEl.value?.contains(target)) close();
  }

  // Both ways of saying "not this menu after all". Tab is prevented and handed back to the row
  // rather than let through: the items live in a Teleport at the end of the document, so the tab
  // stop after them is nowhere near the tree the user is in.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" && event.key !== "Tab") return;
    event.preventDefault();
    close(true);
  }

  function open(row: TRow, event: MouseEvent | KeyboardEvent): void {
    const actions = deps.actionsFor(row);
    // Nothing to offer — the full-screen view is here on every row, having no terminal to insert
    // into. Leave the browser's own menu rather than swallowing the gesture for an empty panel.
    if (actions.length === 0) return;
    event.preventDefault();
    opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    // A keyboard opening has no pointer to sit under, so it hangs off the row instead.
    const rect = opener?.getBoundingClientRect();
    const x = event instanceof MouseEvent ? event.clientX : (rect?.left ?? 0) + KEYBOARD_MENU_INSET_PX;
    const y = event instanceof MouseEvent ? event.clientY : (rect?.bottom ?? 0);
    menu.value = { actions, ...menuPosition(actions, x, y) };
    // The menu takes the keyboard, the way a native context menu does. Without this the Shift+F10
    // entrance renders a panel nobody can reach: focus would stay on the row, and the items sit at
    // the END of the document in a Teleport, a whole page of tab stops away (Codex, PR #1912).
    void nextTick(() => menuItems()[0]?.focus());
    window.addEventListener("pointerdown", onOutside);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("scroll", closeFromEvent, true);
  }

  /** Arrow keys inside the open menu. Enter and Space need nothing — the items are buttons. */
  function onMenuNav(event: KeyboardEvent): void {
    const items = menuItems();
    const active = document.activeElement;
    const to = menuFocusMove(event.key, active instanceof HTMLElement ? items.indexOf(active) : -1, items.length);
    if (to === null) return;
    event.preventDefault();
    items[to]?.focus();
  }

  // The same menu without a mouse. Both spellings, because the dedicated key exists on few
  // keyboards and Shift+F10 is what the rest of them use.
  function onRowKeydown(row: TRow, event: KeyboardEvent): void {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    open(row, event);
  }

  // Run BEFORE closing, and do not take focus back: an insert ends in `term.focus()` (see
  // useTerminalConnections), and the terminal is where the user is about to type the sentence the
  // path belongs to. Restoring the row here would take the keyboard straight back off them.
  function pick(action: FilesRowAction): void {
    deps.run(action);
    close();
  }

  onBeforeUnmount(() => close());

  return { menu, open, onMenuNav, onRowKeydown, pick };
}
