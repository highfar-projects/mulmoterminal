// Open a file the user picked in the Canvas, without asking the agent for it (#1374).
//
// The Canvas renders a session's TOOL RESULTS, so the way in is to write one: a synthetic result
// standing in for the tool call nobody made. `presentCollection` has done exactly this since #1768
// — see seedCollectionCanvas.ts, which this mirrors, including POSTing to the same route so the
// card survives a reload and the agent's own card supersedes it.
//
// Which files qualify is decided by each PLUGIN rather than by an extension test here. A second
// opinion in this file could only be a weaker one that reports success for a file that never
// renders. How that decision is reached differs per tool, and the difference is the shape of this
// module:
//
//   markdown, html   a lexical guard their executors already run (`isDocumentPath` refuses a
//                    prefixed traversal; `isPresentableHtmlPath` refuses a dotfile the iframe
//                    mount would deny). The card carries a path and the View self-fetches.
//   mulmoScript      no absolute path is accepted at all, and the card needs the parsed script
//                    rather than a path — so the question is WHERE the file is, and the card
//                    comes from the plugin's own reopen. See storyWirePath / reopenStory.
import { TOOL_NAME as DOCUMENT_TOOL, isDocumentPath } from "@mulmoclaude/markdown-plugin/vue";
import { TOOL_NAME as HTML_TOOL, isPresentableHtmlPath, isHtmlArtifactPath, htmlArtifactPreviewUrl, htmlFileUrl } from "@mulmoclaude/html-plugin";
import { TOOL_NAME as STORY_TOOL } from "@mulmoclaude/mulmoscript-plugin";
import { dirPathKey } from "../../common/dirPathKey";
import { isRecord } from "../../common/isRecord";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export interface CanvasCard {
  toolName: string;
  data: Record<string, unknown>;
}

/** What asking for a card ended in.
 *
 *  Three outcomes, not one nullable card: `none` and `refused` used to collapse into `null`, and
 *  the caller then had nothing to say — a click that the server had answered with a sentence
 *  looked exactly like a click on a file nothing renders (#1941).
 *
 *  `none` stays silent on purpose: nothing offers the action for such a file, so it cannot be
 *  clicked. `refused` carries what the server said, which is already a sentence about what to do. */
export type CanvasCardResult = { kind: "card"; card: CanvasCard } | { kind: "refused"; reason: string } | { kind: "none" };

/** Where mulmoScript keeps its stories, under the workspace. Both halves are fixed by the plugin:
 *  the artifacts area is its only file capability, and `stories/` is its wire prefix. */
const STORY_DIR = "artifacts/stories";

/** Where stories can live, as this server serves them.
 *
 *  `rootId` is the id the plugin knows the WORKSPACE SUBTREE by — served on `/api/config`, never
 *  re-derived here: a card carries it, and a browser rule that drifted from the server's would
 *  mint cards naming a root nothing registered. Null where the config has not arrived yet, which
 *  reads as "only the workspace's own stories directory", i.e. exactly the pre-#1933 behaviour. */
export interface StoriesRoots {
  /** Every spelling this workspace is known by — the one the user launched with AND the resolved
   *  one, because BOTH reach the Files pane. A cell opened from the launcher carries the spelling
   *  the user typed; one opened in a git worktree carries the realpathed spelling `git worktree
   *  list` reports. `dirPathKey` is lexical (a browser cannot realpath), so a gate that knew only
   *  one of them hid the Canvas entry for every deck under the other (Codex P1 iter-5 on #1934).
   *
   *  Only a GATE: the server re-checks containment with a realpath when the card is built, so a
   *  spelling accepted here that names something else still opens nothing. */
  workspaces: readonly string[];
  rootId: string | null;
}

/** A story as the wire addresses it: the path, plus which root it is relative to (absent = the
 *  workspace's own `artifacts/stories`, the only one before #1933). */
export interface StoryRef {
  filePath: string;
  root?: string;
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

/**
 * The wire path a mulmoScript card carries for `absolutePath`, or null when it is not a story.
 *
 * mulmoScript is the one tool here that cannot be handed an absolute path: `normalizeStoryPath`
 * refuses those (and backslashes) outright, taking only `stories/x.json` and its two historical
 * spellings. So where markdown and html are asked "can you render this file", this asks the
 * narrower question the plugin can actually act on — is this file in the WORKSPACE's story
 * directory — and answers with the path it wants.
 *
 * That distinction is the point rather than a technicality: a project cell may well have an
 * `artifacts/stories/` of its own, and those stories are not the ones the plugin would open.
 *
 * Lexical, on the same key the workspace chip compares with: a browser cannot resolve a symlink,
 * and `..` folds away here, so a traversal simply fails to match the prefix. Nothing rests on it —
 * the reopen below runs the plugin's own guard and a realpath check server-side, so a path this
 * lets through still yields no card.
 */
export function storyWirePath(absolutePath: string, roots: StoriesRoots): StoryRef | null {
  const { workspaces, rootId } = roots;
  if (workspaces.length === 0) return null;
  const key = dirPathKey(absolutePath);
  if (!key.endsWith(".json")) return null;
  // The workspace's own stories directory FIRST, and it answers without a root. It sits INSIDE the
  // named root's subtree, so both could name the same file — as `stories/x.json` and as
  // `stories/artifacts/stories/x.json` — and the two spellings are two identities, hence two cards
  // for one deck. Deciding the narrower one first means only one spelling is ever minted.
  // ONE rule for what "under this directory" means, because two goes wrong twice: `dirPathKey`
  // TRIMS its input (a trailing space in the last component is eaten — Codex P2) and answers a root
  // directory as `/`, `C:/` or `//server/share`, which already carry the separator (Codex P1). So a
  // prefix is keyed from a spelling that always ENDS in one — the trailing separator protects the
  // space, and the key that comes back is normalised into exactly one.
  const endsWithSeparator = (dir: string): boolean => /[/\\]$/.test(dir);
  const joinPath = (dir: string, rel: string): string => (endsWithSeparator(dir) ? `${dir}${rel}` : `${dir}/${rel}`);
  const prefixOf = (dir: string): string => {
    const keyed = dirPathKey(endsWithSeparator(dir) ? dir : `${dir}/`);
    return keyed === "" || keyed.endsWith("/") ? keyed : `${keyed}/`;
  };
  const under = (prefix: string): string | null => (prefix !== "" && key.startsWith(prefix) ? key.slice(prefix.length) : null);
  /** The first spelling that contains the file, as its relative tail. The tail is the same
   *  whichever spelling matched — they name one directory. */
  const underAny = (dirOf: (workspace: string) => string): string | null => {
    for (const workspace of workspaces) {
      const tail = under(prefixOf(dirOf(workspace)));
      if (tail) return tail;
    }
    return null;
  };
  const inDefault = underAny((workspace) => joinPath(workspace, STORY_DIR));
  if (inDefault) return { filePath: `stories/${inDefault}` };
  // Anywhere else under the workspace, which is the whole point: a deck kept beside the notes it
  // was written from. Needs the id this server registered — without it the subtree is unaddressable
  // and this answers null, which is what every caller did before the named root existed.
  if (!rootId) return null;
  const inWorkspace = underAny((workspace) => workspace);
  return inWorkspace ? { filePath: `stories/${inWorkspace}`, root: rootId } : null;
}

/**
 * Whether the Canvas can show `path` at all — what the Files pane's button is shown on.
 *
 * `workspace` is only consulted for stories; markdown and html are judged wherever they live.
 */
export const canOpenInCanvas = (path: string | null, roots: StoriesRoots = { workspaces: [], rootId: null }): boolean =>
  path !== null && (canvasCardForFile(path) !== null || storyWirePath(path, roots) !== null);

/**
 * Longer than the shared default because the reopen reads and schema-completes a whole script,
 * and it BLOCKS the Canvas from opening — giving up early here shows the user nothing, which they
 * cannot tell apart from "this file cannot be shown".
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The mulmoScript card for `wirePath`, built by the plugin's own reopen rather than here.
 *
 * `MulmoScriptData` requires the parsed `script`, not just a path — unlike markdown and html,
 * whose Views self-fetch — and reading and validating it in the browser would be a second copy of
 * logic this route already runs. What comes back is what the agent's own tool call produces,
 * including the normalized `filePath` that `filePathIdentity` collapses the two cards on.
 *
 * The route narrates a missing or refused file as a 200 with no `data` (its spec pins this), so
 * absence of `data` — not the status — is what "cannot open this" looks like.
 */
async function reopenStory(ref: StoryRef, expectPath: string): Promise<CanvasCardResult> {
  try {
    const res = await fetchWithTimeout(
      "/api/plugin/presentMulmoScript",
      // `kind: "save"` with a `filePath` and no `script` is the package's REOPEN — and it is the
      // only shape that carries a root. The kind-less body is the AGENT's tool call, which is
      // deliberately root-blind: `root` is not in the tool schema, so a model cannot name one
      // (receptron/mulmoclaude#3015). A browser asking for a deck it can see is not that caller.
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "save", ...ref, expectPath }) },
      REQUEST_TIMEOUT_MS,
    );
    const body: unknown = await res.json().catch(() => null);
    // A refusal is a 4xx with `{ok:false, error}` (the dispatch's shape) — the sentence the server
    // wrote is the whole point of reading it here rather than logging a status code.
    const refusal = isRecord(body) && typeof body.error === "string" ? body.error : null;
    if (!res.ok) {
      console.error(`[canvasOpenFile] reopen HTTP ${res.status}`);
      return refusal === null ? { kind: "none" } : { kind: "refused", reason: refusal };
    }
    // The dispatch answers FLAT — `{ok, script, filePath, root}` — where the agent's kind-less tool
    // call answers an envelope `{data}`. Measured, and the difference is not cosmetic: reading
    // `body.data` here built no card at all, so the row's menu entry appeared and clicking it did
    // nothing. The card is assembled from the fields the View needs (`script` + `filePath`, the
    // shape the tool path's `data` has), plus the root the response echoes — which is what keeps
    // two roots' identically-named decks on two cards (canvasIdentity.filePathIdentity).
    if (!isRecord(body) || body.ok !== true || !isRecord(body.script) || typeof body.filePath !== "string") {
      return refusal === null ? { kind: "none" } : { kind: "refused", reason: refusal };
    }
    const root = typeof body.root === "string" ? { root: body.root } : {};
    return { kind: "card", card: { toolName: STORY_TOOL, data: { script: body.script, filePath: body.filePath, ...root } } };
  } catch (err) {
    console.error("[canvasOpenFile] reopen failed", err);
    return { kind: "refused", reason: "could not reach this server to open the deck" };
  }
}

/**
 * The card to seed for `absolutePath`, or null when nothing here can show it.
 *
 * The async half of {@link canvasCardForFile}: markdown and html are decided in memory, and only a
 * story needs the round trip. Callers use THIS and {@link canOpenInCanvas} with the same arguments
 * — a button gated on one path while the card is built from another is a button that does nothing.
 */
export async function buildCanvasCard(absolutePath: string, roots: StoriesRoots): Promise<CanvasCardResult> {
  const direct = canvasCardForFile(absolutePath);
  if (direct) return { kind: "card", card: direct };
  const ref = storyWirePath(absolutePath, roots);
  // The absolute path travels with the wire path so the SERVER can check the two still name one
  // file. This gate is lexical and cannot realpath; the workspace it compares against was resolved
  // at boot, so the two can part company while the server runs (#1934). Sending what the pane
  // actually showed turns "a different deck opens" into a refusal with a sentence.
  return ref ? await reopenStory(ref, absolutePath) : { kind: "none" };
}

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
    const res = await fetchWithTimeout(
      "/api/agent/toolResult",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uuid: crypto.randomUUID(), ...card, sessionId }) },
      REQUEST_TIMEOUT_MS,
    );
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
    const res = await fetchWithTimeout(`/api/agent/toolResults/${encodeURIComponent(sessionId)}`, undefined, REQUEST_TIMEOUT_MS);
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return isRecord(body) && Array.isArray(body.toolResults) && body.toolResults.length > 0;
  } catch {
    return false;
  }
}
