// Workspace file-change publisher, shared with MulmoClaude via @mulmoclaude/core.
// A write site calls publishFileChange(workspaceRelPath); the publisher stats the
// post-write mtime and forwards a { path, mtimeMs } payload to every plugin View
// whose scope matches, on the channel that View's runtime subscribes to
// (plugin:<scope>:file:<path>). This unifies the markdown + html live-refresh paths
// that each previously hand-rolled their own pubsub publish.
//
// No primaryChannel: MulmoTerminal has no general files-explorer subscriber, so only
// the plugin-scoped channels are published.
import path from "node:path";
import { stat } from "node:fs/promises";
import { configureFileChangePublisher, publishFileChange } from "@mulmoclaude/core/file-change";
import type { Publisher } from "../infra/pubsub.js";
import { MARKDOWN_FILE_SCOPE } from "../../common/fileChannel.js";
import { createDocumentWatchers, resolveWatchableDocument, type FileStamp, type WatchableScope } from "../files/documentWatch.js";

type PubSub = Publisher;

/** What the document watchers need of pubsub: to be told when a channel gains its first
 *  subscriber and loses its last. Its own interface for the reason `Publisher` is — a module
 *  that only listens should not have to grow a method each time pubsub gains one. */
export interface SubscriptionSource {
  onSubscriptionChange(listener: (channel: string, subscribed: boolean) => void): () => void;
}

const log = {
  warn: (message: string, data?: Record<string, unknown>) => console.warn(`[file-change] ${message}`, data ?? ""),
};

// Scope matchers mirror what the host write sites ACCEPT, so a file can't save without
// refreshing. Both are now "any file of this type": presentDocument/presentHtml's `path`
// argument opens any `.md` / `.html` on disk (backends/openPath.ts), and the only callers
// of publishFileChange are those two save paths.
//
// Deliberate divergence from MulmoClaude, which still scopes markdown to its own
// `artifacts/markdowns/**` (server/events/file-change.ts): there, a View editing a repo
// file simply doesn't get the live-refresh event. Same widening belongs upstream; until
// it lands, MulmoTerminal refreshes in a case MulmoClaude doesn't.
// Case-insensitive, and `.htm` as well as `.html`, because that is what the write
// side accepts: core's `classifyFilePath` compares against MARKDOWN_EXTENSIONS /
// HTML_EXTENSIONS case-insensitively, so `README.MD` and `report.htm` both save. A
// matcher narrower than the write site means a file that saves and never refreshes.
function isMarkdownDoc(posixPath: string): boolean {
  return /\.md$/i.test(posixPath);
}

function isHtmlDoc(posixPath: string): boolean {
  return /\.html?$/i.test(posixPath);
}

// presentShapeScript's `path` form opens any `.shape` on disk, the same widening the
// two above already have. Without this scope the publish in backends/shapescript.ts
// matches nothing and emits no channel at all — a save that silently never refreshes
// (codex on #2000).
function isShapeDoc(posixPath: string): boolean {
  return /\.shape$/i.test(posixPath);
}

// The scopes a write is forwarded to — and, because a watcher exists to make a publish land,
// the same list decides which files are worth watching (files/documentWatch.ts).
const PLUGIN_FILE_SCOPES: readonly WatchableScope[] = [
  { scope: MARKDOWN_FILE_SCOPE, matches: isMarkdownDoc },
  { scope: "html", matches: isHtmlDoc },
  { scope: "shapescript", matches: isShapeDoc },
];

/** Configure the shared publisher against MulmoTerminal's pubsub + workspace. Call
 *  once at startup, before any write route runs. */
export function initFileChangePublisher(deps: { workspace: string; pubsub: PubSub | null }): void {
  const { workspace, pubsub } = deps;
  configureFileChangePublisher({
    publish: (channel, payload) => pubsub?.publish(channel, payload),
    workspaceRoot: workspace,
    // Normalise to POSIX so payload.path + channel suffix never drift on mixed
    // separators (our rels are already "/"-joined, so this is a no-op on POSIX).
    toPosix: (relativePath) => relativePath.split(path.sep).join("/"),
    pluginScopes: [...PLUGIN_FILE_SCOPES],
    warn: (message, data) => log.warn(message, data),
  });
}

// Re-export so write backends import the publish from one place (and so they can't
// reach a differently-configured copy).
export { publishFileChange };

/** mtime + size, as one comparable value; null when the file is not there. */
async function fileStamp(absolutePath: string): Promise<FileStamp> {
  try {
    const { mtimeMs, size } = await stat(absolutePath);
    return `${mtimeMs}:${size}`;
  } catch {
    // Missing, or unreadable — both are "not the file we last saw", which is what the poll
    // compares. Distinguishing them would change nothing it decides.
    return null;
  }
}

/** Watch the documents Views are subscribed to, so a write from OUTSIDE this app reaches them.
 *
 *  The publisher above only ever hears about this app's own saves. Everything else — the agent
 *  in the next cell, an editor, a checkout — changes the file with nothing to announce it, and
 *  every open view goes quietly stale.
 *
 *  Returns a function that stops listening and every watcher. Shutdown does not need it —
 *  `process.exit` clears the timers — so it is there for a caller that wants the loops gone
 *  while the process stays up.
 *
 *  The announcement goes through `publishFileChange`, so the channel and the payload stay the
 *  ones every View already subscribes to. For a document named by ABSOLUTE path that publish
 *  logs one `[file-change] stat failed` line per change — the shared publisher joins its
 *  argument onto the workspace, as it already does for an absolute save (backends/markdown.ts).
 *  Cosmetic: the channel is still right, and `mtimeMs` only cache-busts. */
export function startDocumentWatchers(deps: { workspace: string; pubsub: SubscriptionSource }): () => void {
  const watchers = createDocumentWatchers({
    resolve: (channel) => resolveWatchableDocument(channel, deps.workspace, PLUGIN_FILE_SCOPES),
    stamp: fileStamp,
    announce: (channelPath) => void publishFileChange(channelPath),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const stopListening = deps.pubsub.onSubscriptionChange((channel, subscribed) => {
    if (subscribed) watchers.start(channel);
    else watchers.stop(channel);
  });
  return () => {
    stopListening();
    watchers.stopAll();
  };
}
