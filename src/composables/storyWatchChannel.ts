// Which channel to hold open so the server watches the MulmoScript a Canvas card shows (#3014).
import { TOOL_NAME as STORY_TOOL } from "@mulmoclaude/mulmoscript-plugin";
import { MULMOSCRIPT_SCOPE, pluginFileChannel } from "../../common/fileChannel";
import type { CanvasCard } from "./canvasOpenFile";

/** The one-file channel for a story card, or null for any other card.
 *
 *  The path is the card's own `filePath`, verbatim: the server announces the change on it, and the
 *  View compares the two as strings, so a normalised spelling would watch the file and reload
 *  nothing. A card that names a root is left out — the server announces without one, and the View
 *  matches the root as well as the path. */
export function storyWatchChannel(card: CanvasCard | null): string | null {
  if (card?.toolName !== STORY_TOOL) return null;
  const { filePath, root } = card.data;
  if (typeof filePath !== "string" || filePath === "") return null;
  if (typeof root === "string" && root.trim() !== "") return null;
  return pluginFileChannel(MULMOSCRIPT_SCOPE, filePath);
}
