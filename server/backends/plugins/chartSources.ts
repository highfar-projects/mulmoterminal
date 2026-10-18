// The `sources` capability @mulmoclaude/chart-plugin asks its host for: a chart
// entry may name a range of a saved spreadsheet instead of carrying its numbers,
// and the chart plugin cannot calculate a workbook itself (a plugin does not
// import another plugin). The spreadsheet package's own engine does it here, so
// the chart shows exactly what the sheet shows.
import path from "node:path";
import { readCalculatedRange } from "@gui-chat-plugin/spreadsheet/core";
import type { ChartSource, ChartSourceReader } from "@mulmoclaude/chart-plugin";
import { artifactsFileOps, artifactsRoot } from "./artifacts.js";

const ARTIFACTS_DIR = "artifacts";

/** The workspace-relative spelling (`artifacts/spreadsheets/…`) of a workbook path.
 *
 *  The agent is told the ABSOLUTE path of a saved spreadsheet (mcp/narration-artifact-paths.ts),
 *  so that is what it names in a chart's source, while the spreadsheet package reads only the
 *  relative form. A path outside the artifacts root is returned unchanged, for the package to
 *  refuse. */
export function workspaceRelativeArtifact(spreadsheet: string, root: string): string {
  if (!path.isAbsolute(spreadsheet)) return spreadsheet;
  const relative = path.relative(root, spreadsheet);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return spreadsheet;
  return [ARTIFACTS_DIR, ...relative.split(path.sep)].join("/");
}

export const chartSources: ChartSourceReader = {
  read: (source: ChartSource) => readCalculatedRange(artifactsFileOps, workspaceRelativeArtifact(source.spreadsheet, artifactsRoot()), source.range),
};

// `artifacts/spreadsheets/<…>.json`, relative or absolute: the chart View subscribes with the
// path exactly as the agent wrote it. Containment is not decided here — the watcher contains the
// path against the workspace and the session directories before it stats anything.
const WORKBOOK_PATH = /(^|\/)artifacts\/spreadsheets\/.+\.json$/;

/** Whether a file channel names a workbook a chart can follow. */
export function isWorkbookPath(posixPath: string): boolean {
  return WORKBOOK_PATH.test(posixPath) && !posixPath.split("/").includes("..");
}
