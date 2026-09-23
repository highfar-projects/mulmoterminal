// The "this file changed" channel name.
//
// Both sides decide it: the server mints it when a file is written or seen to change, and the
// UI subscribes to it for the document it has open. That makes it a wire shape rather than a
// server detail, so it lives here.
//
// The format is @mulmoclaude/core/file-change's (`pluginFileChannel`), which the UI cannot
// import — that entry pulls in node:fs. A spec pins this copy to core's rather than trusting
// the two to stay the same by inspection.

const CHANNEL_PREFIX = "plugin:";
const PATH_MARKER = ":file:";

/** The scope the markdown plugin's View and the server's markdown matcher agree on. */
export const MARKDOWN_FILE_SCOPE = "markdown";

/** The channel one file is announced on, under one plugin scope. */
export function pluginFileChannel(scope: string, posixPath: string): string {
  return `${CHANNEL_PREFIX}${scope}${PATH_MARKER}${posixPath}`;
}

/** The scope and path a channel names, or null when it is not one of ours.
 *
 *  Split on the FIRST `:file:` only: a POSIX filename may itself contain a colon, so
 *  everything after that marker is the path verbatim and never re-parsed. */
export function parsePluginFileChannel(channel: string): { scope: string; path: string } | null {
  if (!channel.startsWith(CHANNEL_PREFIX)) return null;
  const rest = channel.slice(CHANNEL_PREFIX.length);
  const marker = rest.indexOf(PATH_MARKER);
  if (marker <= 0) return null;
  const path = rest.slice(marker + PATH_MARKER.length);
  return path ? { scope: rest.slice(0, marker), path } : null;
}

/** A path spelled the way the channel spells it.
 *
 *  The publisher normalises to POSIX before it mints a channel, so a subscriber that keeps
 *  Windows separators names a channel nothing is ever published on — and nothing errors,
 *  which is why this is a function both sides call rather than a rule both sides remember. */
export function fileChannelPath(filePath: string): string {
  return filePath.split("\\").join("/");
}
