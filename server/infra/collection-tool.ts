// MCP tool binding for the shared `manageCollection` agent data plane
// (@mulmoclaude/core/collection/server — the same engine MulmoClaude's host
// binds). Registered as a HOST TOOL (see host-tools.ts + the
// /api/plugin/manageCollection dispatch route in server/index.ts): the engine
// runs in-process against the shared workspace, so unlike manageAccounting
// there is no passthrough router — the route calls the handler directly.
//
// MulmoTerminal's deps binding:
//   - workspaceRoot: a GETTER over the bound workspace, not a captured string. The tool
//     is built at module scope — before boot binds anything — so a value read here would
//     be `undefined`, and under the engine's explicit-root binding that is a throw rather
//     than a fallback. The getter defers the read to the call, which is when a root exists.
//     (This is the agent's data plane, which has no request: it operates on the workspace.)
//   - bundledHelpsDir: workspace-setup's helpsAssetDir, so `schemaDocs`
//     serves the bundled collection-authoring reference even when the
//     workspace has no config/helps copy (only managed workspaces are seeded).
//   - refreshAfterWrite: omitted — MulmoTerminal has no schema-driven side
//     state to refresh after putSchema (MulmoClaude refreshes its scheduled
//     skills / user tasks); collection watchers pick up the write via fs events.
import type { ToolDefinition } from "gui-chat-protocol";
import { makeManageCollectionTool } from "@mulmoclaude/core/collection/server";
import { helpsAssetDir } from "@mulmoclaude/core/workspace-setup";
import { workspaceScope } from "./project-root.js";

const tool = makeManageCollectionTool({
  bundledHelpsDir: helpsAssetDir,
  get workspaceRoot(): string {
    return workspaceScope().workspaceRoot;
  },
});

/** The bound handler the dispatch route calls. Returns the tool's narration
 *  string (JSON for the read/write actions) — no GUI `data`, matching
 *  MulmoClaude where manageCollection results narrate to claude only. */
export const manageCollectionHandler = tool.handler;

/** gui-chat-protocol shape of the core tool's MCP definition — the same
 *  inputSchema→parameters / prompt-folding adaptation loadServerToolPackage
 *  applies to XTool-shaped server tools. The core definition types its
 *  inputSchema loosely (`type: string`); the runtime value is the literal
 *  "object" the protocol type wants, so re-stamp it. */
// Annotated, not asserted: the spread widens `type` back to `string`, and an annotation makes the
// compiler check the result against what the protocol wants instead of being told.
const collectionToolParameters: NonNullable<ToolDefinition["parameters"]> = { ...tool.definition.inputSchema, type: "object" };

export const MANAGE_COLLECTION: ToolDefinition = {
  type: "function",
  name: tool.definition.name,
  description: tool.definition.description,
  prompt: tool.prompt,
  parameters: collectionToolParameters,
};
