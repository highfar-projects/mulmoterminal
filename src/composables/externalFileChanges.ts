// The three ways the Files pane finds out that the file under the editor has moved, and the
// one thing it does about each of them.
//
// None of the three is enough alone. The write hook is immediate but speaks only for Claude —
// codex reports through a different channel, and git, a build or another editor through none.
// The document's own channel covers those, but only for a file the server watches, and only
// once the subscription has landed. The poll is late and misses nothing. The 409 on save is
// still the hard guarantee; these only get the news out before the user has typed into a file
// that already moved.
//
// Split out of the pane because it is subscriptions and a timer with no view state in it: what
// it does with an answer is the pane's business, and it is handed in as `recheck`.
import { watch } from "vue";
import { usePubSub } from "./usePubSub";
import { FILE_WRITE_CHANNEL, isFileWriteEvent } from "../../common/fileWriteChannel";
import { isWriteToOpenFile } from "./fileWriteMatch";

export const EXTERNAL_CHECK_MS = 30_000;

export interface ExternalFileChangesDeps {
  /** The pane's project root — half of what says whether a reported write is the open file. */
  cwd: () => string | null;
  openPath: () => string | null;
  /** The open document's own channel, or null for a file the server does not watch. */
  docChannel: () => string | null;
  /** Go and look: something may have changed. Called more often than the file changes. */
  recheck: () => void;
}

/** Start listening; the returned function stops everything it started. */
export function watchExternalFileChanges(deps: ExternalFileChangesDeps): () => void {
  const pubsub = usePubSub();
  const timer = setInterval(deps.recheck, EXTERNAL_CHECK_MS);
  const unsubscribeWrites = pubsub.subscribe(FILE_WRITE_CHANNEL, (data) => {
    if (isFileWriteEvent(data) && isWriteToOpenFile(data.file, deps.cwd(), deps.openPath())) deps.recheck();
  });
  // Follow the open document onto its own channel. This is both halves of one thing: the server
  // watches a file only while someone is subscribed to it, so this subscription is what ASKS
  // for the watch as well as what hears the answer (#2136).
  let unsubscribeDoc: (() => void) | null = null;
  const stopFollowing = watch(
    deps.docChannel,
    (channel) => {
      unsubscribeDoc?.();
      unsubscribeDoc = channel ? pubsub.subscribe(channel, () => deps.recheck()) : null;
    },
    { immediate: true },
  );
  return () => {
    clearInterval(timer);
    unsubscribeWrites();
    stopFollowing();
    unsubscribeDoc?.();
  };
}
