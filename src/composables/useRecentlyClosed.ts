// The recently closed cells, kept in this browser (#2800). One list for the page: the grid writes it
// as a cell closes and the command palette reads it. A store that cannot be read or written only
// costs the list — closing a cell never fails because of it.
import { ref } from "vue";
import { closedCellOf, closedTitle, forgetClosed, readClosedCells, rememberClosed, type ClosedCell } from "./recentlyClosed";
import type { Cell } from "../components/gridTabs";
import type { SessionMetaView } from "../components/rosterPhase";

const STORAGE_KEY = "mt-recently-closed";

function load(): ClosedCell[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? readClosedCells(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

// Once a write is refused, storage holds less than this page does, and reading it back would
// drop what only the page has.
let storageWritable = true;

function save(list: ClosedCell[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    storageWritable = false;
  }
}

export const recentlyClosed = ref<ClosedCell[]>(load());

// Read back first, so a close in another tab since this page loaded is kept rather than overwritten.
const latest = (): ClosedCell[] => (storageWritable ? load() : recentlyClosed.value);

export function recordClosedCell(entry: ClosedCell): void {
  recentlyClosed.value = rememberClosed(latest(), entry);
  save(recentlyClosed.value);
}

/** Record `cell` as it closes, titled the way the roster showed it; a cell with nothing to reopen is skipped. */
export function recordClosedCellOf(cell: Cell, meta: SessionMetaView | undefined): void {
  const closed = closedCellOf(cell, closedTitle(meta), Date.now());
  if (closed) recordClosedCell(closed);
}

export function forgetClosedCell(entry: ClosedCell): void {
  recentlyClosed.value = forgetClosed(latest(), entry);
  save(recentlyClosed.value);
}
