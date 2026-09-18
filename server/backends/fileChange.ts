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
import os from "node:os";
import { stat } from "node:fs/promises";
import { configureFileChangePublisher, publishFileChange } from "@mulmoclaude/core/file-change";
import type { Publisher } from "../infra/pubsub.js";
import { MARKDOWN_FILE_SCOPE } from "../../common/fileChannel.js";
import { createDocumentWatchers, resolveWatchableDocument, type FileStamp, type WatchableScope } from "../files/documentWatch.js";
import { containForWatching } from "../files/pathContainment.js";

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

/** mtime + size + file identity, as one comparable value; null when the file is not there.
 *
 *  The identity is what makes the atomic write detectable. An agent's edit is a temp file
 *  renamed over the target, so the path ends up pointing at a DIFFERENT file — and mtime and
 *  size alone can both survive that, when the replacement is the same length and lands inside
 *  one tick of the filesystem's timestamp resolution. `ino` changes with the rename whatever
 *  the clock did. Read as BigInt because a Windows file id is 64-bit and the default numeric
 *  form silently loses precision on large ones (CodeRabbit on #2147). */
export async function fileStamp(absolutePath: string): Promise<FileStamp> {
  try {
    const { mtimeMs, size, ino } = await stat(absolutePath, { bigint: true });
    return `${mtimeMs}:${size}:${ino}`;
  } catch {
    // Missing, or unreadable — both are "not the file we last saw", which is what the poll
    // compares. Distinguishing them would change nothing it decides.
    return null;
  }
}

export function startDocumentWatchers(deps: { workspace: string; pubsub: SubscriptionSource; sessionCwds: () => Iterable<string> }): () => void {
  const watchers = createDocumentWatchers({
    resolve: (channel) =>
      resolveWatchableDocument(channel, PLUGIN_FILE_SCOPES, (candidate) =>
        containForWatching([deps.workspace, ...deps.sessionCwds()], candidate, os.homedir()),
      ),
    stamp: fileStamp,
    announce: (channelPath) => void publishFileChange(channelPath),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    warn: (message, data) => log.warn(message, data),
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
