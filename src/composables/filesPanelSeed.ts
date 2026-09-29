// Text handed to the Files pane's finder or search as it opens (#2411 step 6): the command
// palette's `/` and `#` hand what was typed over to the panel that already does the job, rather
// than running a second file search of its own. Taken once, so a later manual open starts empty.
export type SeededFilesPanel = "files-find" | "files-search";

const seeds = new Map<SeededFilesPanel, string>();

export function seedFilesPanel(panel: SeededFilesPanel, query: string): void {
  seeds.set(panel, query);
}

export function takeFilesPanelSeed(panel: SeededFilesPanel): string {
  const query = seeds.get(panel) ?? "";
  seeds.delete(panel);
  return query;
}
