// Text handed to the Files pane's finder or search as it opens (#2512): the command palette's `/`
// and `#` hand what was typed over to the panel that already does the job. It is only a relay from
// the palette to the grid's action: the grid takes it as the action runs, and the palette drops it
// straight after, so text the grid refused never reaches a later open.
export type SeededFilesPanel = "files-find" | "files-search";

/** What a panel is opened on. An object rather than the text, so the same text twice is two opens. */
export interface FilesPanelSeed {
  text: string;
}

const seeds = new Map<SeededFilesPanel, string>();

export function seedFilesPanel(panel: SeededFilesPanel, query: string): void {
  seeds.set(panel, query);
}

export function takeFilesPanelSeed(panel: SeededFilesPanel): string {
  const query = seeds.get(panel) ?? "";
  seeds.delete(panel);
  return query;
}
