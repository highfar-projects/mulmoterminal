// Host tool: `exportShapeScriptStl` — write a ShapeScript model out as a binary
// STL for a slicer: one watertight solid (through manifold), in millimetres,
// Z up, resting on Z = 0, with a printability report.
//
// Everything about the tool lives in `@gui-chat-plugin/shapescript`: the schema,
// the description, the export and its report, and where under
// `artifacts/shapes/` the file lands. It reaches storage only through the generic
// gui-chat-protocol `files` capability, so this module contributes the same pair
// `exportShapeScriptUsdz` does — the artifacts root and `shapeScriptByPath`.
//
// A HOST tool rather than a plugins.json entry for the reason the USDZ tool is:
// it needs the workspace artifacts root, which a plugin is not handed.
import path from "node:path";
import {
  describePrintReport,
  executeExportShapeScriptStl,
  EXPORT_STL_DESCRIPTION,
  EXPORT_STL_PROMPT,
  EXPORT_STL_SCHEMA,
  EXPORT_STL_TOOL_NAME,
  toArtifactsRelative,
} from "@gui-chat-plugin/shapescript";
import type { ToolDefinition } from "gui-chat-protocol";
import { artifactsFileOps, artifactsRoot } from "../backends/artifacts.js";
import { shapeScriptByPath } from "../backends/openPath.js";

export const EXPORT_SHAPE_SCRIPT_STL: ToolDefinition = {
  type: "function",
  name: EXPORT_STL_TOOL_NAME,
  description: EXPORT_STL_DESCRIPTION,
  prompt: EXPORT_STL_PROMPT,
  parameters: EXPORT_STL_SCHEMA,
};

/** Run one call. Returns the sentences the agent reads — the ABSOLUTE path of the
 *  saved file, then the printability report — and that path.
 *
 *  Absolute for the reason the USDZ tool's is: sessions run in per-project
 *  directories, where the package's workspace-relative `artifacts/shapes/x.stl`
 *  names nothing. The package's first sentence is rewritten rather than appended
 *  to, so the agent sees one path; the report follows it unchanged. */
export async function runExportShapeScriptStl(args: Record<string, unknown>): Promise<{ message: string; filePath: string }> {
  const { filePath, bytes, report } = await executeExportShapeScriptStl({ files: { artifacts: artifactsFileOps, byPath: shapeScriptByPath } }, args);
  const absolute = path.join(artifactsRoot(), ...toArtifactsRelative(filePath).split("/"));
  return {
    message: `Saved STL to ${absolute} (${bytes} bytes).\n${describePrintReport(report)}`,
    filePath: absolute,
  };
}
