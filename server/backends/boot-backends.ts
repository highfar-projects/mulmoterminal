// Every backend this server configures once pub/sub exists, in the order it needs.
//
// The ORDER is the subject of this file, which is why it is one function rather than a dozen
// exports: several of these hand a capability to the next (openPath -> mulmoScript, artifacts ->
// mulmoScript), and one reads a Firebase session that must already be wired. index.ts keeps the
// single call, at the point in the boot where it happens.
import type { createPubSub } from "../infra/pubsub.js";
import { initFileChangePublisher, startDocumentWatchers } from "./fileChange.js";
import { initNotifier } from "./notifier.js";
import { initMarkdownBackend } from "./markdown.js";
import { initArtifactsBackend } from "./artifacts.js";
import { initOpenPathBackend } from "./openPath.js";
import { initMulmoScriptBackend } from "./mulmoscript.js";
import { initCollectionsBackend } from "./collections.js";
import { initSharedCollections } from "./sharedCollections.js";
import { initGoogleBackend } from "./google.js";
import { initAccountingBackend } from "./accounting.js";
import { initFeedsBackend } from "./feeds.js";
import { createFeedsWorker, type FeedsWorkerDeps } from "./feeds-worker.js";
import { initPluginRuntime } from "../infra/pluginRuntime.js";
import { hydrateClearedTranscripts } from "../session/cleared-transcripts.js";
import { ptys } from "../session/registry.js";
import { getCwdPresets } from "../config/config-routes.js";
import { CLAUDE_CWD, MULMOTERMINAL_HOME } from "../config/env.js";

export interface BootBackendsDeps extends FeedsWorkerDeps {
  pubsub: ReturnType<typeof createPubSub>;
}

// The shared file-change publisher (markdown + html live-refresh) and the watchers that hear an
// edit this app did NOT make. Must run before any write route fires — publishFileChange is a no-op
// until configured.
function initFileChanges(pubsub: BootBackendsDeps["pubsub"]): void {
  initFileChangePublisher({ workspace: CLAUDE_CWD, pubsub });
  // The publisher above only hears this app's own saves. Watch the documents Views are actually
  // subscribed to as well, so an edit from the agent in a cell — or any editor — reaches a view
  // that is already open instead of waiting for a reload (#2136).
  startDocumentWatchers({
    workspace: CLAUDE_CWD,
    pubsub,
    // The same root set the raw file route serves from: a path a browser names is contained against
    // the workspace and the live sessions' own directories, and nothing else.
    sessionCwds: () => [...ptys.values()].map((entry) => entry.cwd),
  });
}

// The document/plugin backends, all pinned to the one workspace.
function initDocumentBackends(pubsub: BootBackendsDeps["pubsub"]): void {
  // Give the markdown host app its workspace (for artifacts/documents storage). File-change
  // live-refresh is handled by the shared publisher above.
  initMarkdownBackend({ workspace: CLAUDE_CWD });
  // Give the artifacts FileOps backend its workspace root (<workspace>/artifacts) so
  // @mulmoclaude/chart-plugin's executeChart can persist chart documents there.
  initArtifactsBackend({ workspace: CLAUDE_CWD });
  // Give the by-path backend the same workspace — presentDocument / presentHtml's `path` argument
  // resolves workspace-relative values against it (absolute ones are taken as-is), and the
  // /htmlfile mount resolves its `ws` scope from it. BEFORE initMulmoScriptBackend, which hands one
  // of this module's ops to the plugin as its `byPath` capability (the absolute-`filePath` opt-in).
  initOpenPathBackend({ workspace: CLAUDE_CWD });
  // Create the mulmoScript server ops (stories dir under <workspace>/artifacts, generation fan-out
  // on the plugin pubsub channel). After initArtifactsBackend — the ops' save/update kinds run
  // against the artifacts FileOps — and after initOpenPathBackend, whose `mulmoScriptByPath`
  // becomes the absolute-path capability. `extraRoots` — every directory the user launches in, read
  // ONCE; why in mulmoscript.ts (#1951).
  initMulmoScriptBackend({ workspace: CLAUDE_CWD, extraRoots: getCwdPresets().map((preset) => preset.path), pubsub });
}

// The collection engine and the shared (firestore-backed) rosters on top of it.
function initCollections(): void {
  // The path layout matches MulmoClaude's so discovery sees the same collection skills.
  initCollectionsBackend({ workspace: CLAUDE_CWD });
  // MulmoTerminal is the shared collections' host — its roots are project repositories, which is
  // what one `app.json` per roster requires — and MulmoClaude unbound its own accessor for that
  // reason (mulmoclaude#2870). Wired HERE rather than inside initCollectionsBackend because that
  // file is at its line budget, and because the Firebase session this reads is a boot-level
  // concern rather than one of the collection engine's configuration.
  initSharedCollections();
}

/** Configure every backend, in order. `await`ed where the next step — or the first hook, which can
 *  arrive as soon as we listen — depends on it having finished. */
export async function initBackends(deps: BootBackendsDeps): Promise<void> {
  const { pubsub } = deps;
  initFileChanges(pubsub);
  // Wire the notification engine against pubsub + its state files (shared with MulmoClaude on the
  // managed workspace only — see host-state-root.ts). Must run before any publish/clear and before
  // the collection watchers start.
  await initNotifier({ workspace: CLAUDE_CWD, pubsub, home: MULMOTERMINAL_HOME });
  // Which sessions were `/clear`ed before this process started: tmux keeps their claude running
  // across a restart, so the mark that stops us reading their frozen transcript has to come back
  // with it (#1085). Awaited here — the readers are synchronous, and the first hook can arrive as
  // soon as we listen.
  await hydrateClearedTranscripts();
  initDocumentBackends(pubsub);
  initCollections();
  // Give factory-style gui-chat-protocol plugins their scoped runtime (per-package data/config
  // under <workspace>, namespaced pub/sub, prefixed log) — see infra/pluginRuntime.ts. This
  // necessarily lands AFTER the plugin registry built those runtimes (it calls the factories from a
  // top-level await, so it finishes while this module's imports evaluate); the runtime tolerates
  // that by resolving the workspace per operation rather than capturing it at construction.
  initPluginRuntime({ workspace: CLAUDE_CWD, publish: (channel, data) => pubsub?.publish(channel, data) });
  // Bind @mulmoclaude/core/google's logger. Token/secret storage is core's own and is shared with
  // MulmoClaude (~/.config/mulmo, ~/.secrets), so a machine links once.
  initGoogleBackend();
  // Books live under <workspace>/data/accounting; the publisher drives the View's live-refresh.
  // Single pinned workspace root — exactly what the focused freelance product wants.
  initAccountingBackend({ workspace: CLAUDE_CWD, pubsub });
  initFeedsBackend({ workspace: CLAUDE_CWD, spawnWorker: createFeedsWorker(deps) });
}
