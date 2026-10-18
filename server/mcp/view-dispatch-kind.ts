// The app's own Views reach the same POST /api/plugin/<tool> route a tool call does, and tell
// their requests apart by `kind` (loadHtml, saveSpreadsheet, …). A model call carrying a `kind`
// the tool's schema does not offer would therefore act as the View — save over a file, for one —
// on tools that run without a permission prompt. Only `kind` is checked: it is the key every
// View-dispatch router branches on.

import { isRecord } from "../../common/isRecord.js";

// Structural, like tool-gate.ts, so this file stays free of the plugin registry.
interface KindDeclaringTool {
  name: string;
  parameters?: { properties?: Record<string, { enum?: unknown; [key: string]: unknown }> };
}

/** The refusal message for a tool call whose `kind` the tool does not offer, or null when the
 *  call may go through. A tool missing from the registry is refused too: nothing vouches for it. */
export function undeclaredKindRefusal(toolName: string, tool: KindDeclaringTool | undefined, args: unknown): string | null {
  if (!isRecord(args) || !Object.prototype.hasOwnProperty.call(args, "kind")) return null;
  const declared = tool?.parameters?.properties?.["kind"];
  const allowed = declared === undefined ? false : !Array.isArray(declared.enum) || declared.enum.includes(args["kind"]);
  return allowed
    ? null
    : `Tool "${toolName}" does not take kind=${JSON.stringify(args["kind"])}; that is reserved for the app's own view. Call it with the arguments its schema lists.`;
}
