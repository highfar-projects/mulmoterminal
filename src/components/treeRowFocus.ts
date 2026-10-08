// Put the keyboard on a Files tree row by its path, or on the first row for "" (#2578). Says whether
// there was such a row, so a caller can fall back to another.
export function focusTreeRow(tree: HTMLElement | null | undefined, pathRel: string): boolean {
  const selector = pathRel === "" ? '[data-testid="files-row"]' : `[data-testid="files-row"][data-path="${CSS.escape(pathRel)}"]`;
  const row = tree?.querySelector<HTMLElement>(selector);
  row?.focus();
  return row !== null && row !== undefined;
}
