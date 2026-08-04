// Open a file the user picked in the Canvas, without asking the agent for it (#1374).
//
// The Canvas renders a session's TOOL RESULTS, so the way in is to write one: a synthetic result
// carrying nothing but the path, which the plugin's View then self-fetches from. `presentCollection`
// has done exactly this since #1768 — see seedCollectionCanvas.ts, which this mirrors, including
// POSTing to the same route so the card survives a reload and the agent's own card supersedes it.
//
// Which files qualify is decided by each PLUGIN's own gate rather than by an extension test here.
// They are lexical guards their executors already run (`isDocumentPath` refuses a prefixed
// traversal; `isPresentableHtmlPath` refuses a dotfile the iframe mount would deny), so a second
// opinion in this file could only be a weaker one that reports success for a page that never
// renders.
import { TOOL_NAME as DOCUMENT_TOOL, isDocumentPath } from "@mulmoclaude/markdown-plugin/vue";
import { TOOL_NAME as HTML_TOOL, isPresentableHtmlPath, isHtmlArtifactPath, htmlArtifactPreviewUrl, htmlFileUrl } from "@mulmoclaude/html-plugin";
import { isRecord } from "../../common/isRecord";

export interface CanvasCard {
  toolName: string;
  data: Record<string, unknown>;
}

/**
 * The Canvas card that renders `path`, or null when no plugin here can show it.
 *
 * Pure: no network, no DOM. The caller seeds it.
 */
export function canvasCardForFile(path: string): CanvasCard | null {
  if (isDocumentPath(path)) {
    // `markdown` is required on MarkdownToolData, and empty is right rather than a placeholder:
    // `documentPathOf` reads `docPath` authoritatively, so nothing mistakes "" for a one-line body.
    return { toolName: DOCUMENT_TOOL, data: { markdown: "", docPath: path } };
  }
  if (isPresentableHtmlPath(path)) {
    // The host supplies `previewUrl` — the package cannot know how we serve a page. Leaving it out
    // makes the View derive `/artifacts/html/…`, which is right only for a page that lives there.
    // The Files pane is rooted at the CELL's cwd, so most html a user opens is somewhere else, and
    // the derived URL would point at nothing. `/htmlfile/…` is the mount that serves those
    // (server/backends/html.ts), with the same guards and CSP.
    const previewUrl = isHtmlArtifactPath(path) ? htmlArtifactPreviewUrl(path) : htmlFileUrl(path);
    return { toolName: HTML_TOOL, data: { filePath: path, ...(previewUrl ? { previewUrl } : {}) } };
  }
  return null;
}

/**
 * The path to put on a card, from the Files pane's `cwd` + its row's relative path.
 *
 * The pane is rooted at the CELL's directory, while the plugins' file layer is rooted at the
 * WORKSPACE — so a bare `design.md` from a project cell resolves to a file in the workspace that
 * does not exist, and the View renders nothing (found by opening one in a real browser; nothing
 * failed, the card was simply empty). An absolute path is what both gates accept and what
 * `htmlFileUrl` turns into its `/htmlfile/abs/…` scope.
 *
 * Joined with `/` on every platform: both gates accept a Windows path with either separator, and
 * `htmlFileUrl` normalises a mixed one — verified against `C:\\Users\\me\\proj/docs/design.md`.
 */
export function absoluteUnder(cwd: string | null, relative: string): string {
  if (!cwd) return relative;
  // Sliced rather than matched: a trailing-separator regex with a quantifier backtracks, and one
  // separator is the only case a directory path actually produces.
  const base = cwd.endsWith("/") || cwd.endsWith("\\") ? cwd.slice(0, -1) : cwd;
  return `${base}/${relative}`;
}

/** Whether the Canvas can show `path` at all — what the Files pane's button is shown on. */
export const canOpenInCanvas = (path: string | null): boolean => (path ? canvasCardForFile(path) !== null : false);

/**
 * Write `card` into `sessionId`'s Canvas feed.
 *
 * The same route the agent's own results take, so the card is stored, replayed on reload, and
 * collapsed against the agent's card for the same file by `collapseByIdentity` — no reconciliation
 * of our own. Returns whether it landed; the caller reveals the Canvas only if it did, because
 * enlarging a cell to show nothing is worse than not enlarging it.
 */
export async function seedCanvasCard(sessionId: string, card: CanvasCard): Promise<boolean> {
  try {
    const res = await fetch("/api/agent/toolResult", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uuid: crypto.randomUUID(), ...card, sessionId }),
    });
    if (res.ok) return true;
    console.error(`[canvasOpenFile] HTTP ${res.status}`);
  } catch (err) {
    console.error("[canvasOpenFile] failed", err);
  }
  return false;
}

/**
 * Whether `sessionId` already has any Canvas card stored.
 *
 * Asked so a session that has something to show can open the pane even without the render MCP
 * (#1374). There is no count endpoint — this is the same list the panel fetches when it opens, and
 * the cost is accepted rather than hidden. A failure answers "no", which only means the button
 * falls back to what the tools said, as it did before.
 */
export async function hasStoredCard(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/agent/toolResults/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return isRecord(body) && Array.isArray(body.toolResults) && body.toolResults.length > 0;
  } catch {
    return false;
  }
}
