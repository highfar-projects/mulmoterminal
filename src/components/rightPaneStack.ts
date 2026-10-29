// Which panes one cell has open, and which of them is on screen (#3213). Still ONE slot on screen
// (see gridCell.ts): the others wait underneath, so closing the top one shows the pane it covered
// instead of leaving the slot empty.
import { RIGHT_PANES, isRightPane, type RightPane } from "./gridCell";

// The question pane opens by itself and goes when its question does, so it is never one of the
// panes the user stacked: it covers the top one until it is answered, closed, or another pane is
// opened, and it is not remembered across a reload.
export type StackedPane = Exclude<RightPane, "question">;

export interface CellPanes {
  /** Oldest first; the last one is on top. Each pane at most once. */
  stack: StackedPane[];
  /** A question pane covering the top of the stack. */
  question: boolean;
}

export const NO_PANES: CellPanes = { stack: [], question: false };

const isStackedPane = (value: unknown): value is StackedPane => isRightPane(value) && value !== "question";

export const shownPane = (panes: CellPanes): RightPane | null => (panes.question ? "question" : (panes.stack.at(-1) ?? null));

/** Opening a pane that is already in the stack moves it to the top rather than adding it twice. */
export function withPaneOpened(panes: CellPanes, pane: RightPane): CellPanes {
  if (!isStackedPane(pane)) return { stack: panes.stack, question: true };
  return { stack: [...panes.stack.filter((stacked) => stacked !== pane), pane], question: false };
}

/** Closes what is on screen: the question first, else the top of the stack. */
export function withShownPaneClosed(panes: CellPanes): CellPanes {
  if (panes.question) return { stack: panes.stack, question: false };
  return { stack: panes.stack.slice(0, -1), question: false };
}

/** What a remembered value reads back as: a stack, or one pane as a stack of one (the format
 *  written before #3213). Anything else, a question pane included, is dropped. */
export function readStack(value: unknown): StackedPane[] {
  const panes = Array.isArray(value) ? value : [value];
  return RIGHT_PANES.filter(isStackedPane)
    .filter((pane) => panes.includes(pane))
    .sort((a, b) => panes.lastIndexOf(a) - panes.lastIndexOf(b));
}
