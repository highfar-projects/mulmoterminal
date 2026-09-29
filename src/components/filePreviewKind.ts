// What the Files pane can show a file AS, besides its text (#2269). Decided from the name alone, like
// every other "what kind of file is this" question here, and asked of the same content-type table
// the raw route answers from (common/rawContentType.ts), so the pane and the server agree on which
// names are images.
import { rawContentType } from "../../common/rawContentType";
import { langKindForFilename } from "./cmEditor";

/** How a text file is previewed: Markdown rendered by the server, an HTML page in its sandbox, or an
 *  SVG drawn as the image it is. */
export type FilePreviewKind = "markdown" | "html" | "svg";

const HTML_NAME = /\.html?$/i;
const SVG_TYPE = "image/svg+xml";

/** The file's Preview, or null for a file that is only ever read as text. */
export function filePreviewKind(name: string): FilePreviewKind | null {
  if (langKindForFilename(name) === "markdown") return "markdown";
  if (HTML_NAME.test(name)) return "html";
  return rawContentType(name) === SVG_TYPE ? "svg" : null;
}

/** An image with no text to edit — a PNG, a JPEG. The pane shows the picture where it would
 *  otherwise say the file is not text. An SVG is text and is not one of these. */
export const isRasterImage = (name: string): boolean => {
  const type = rawContentType(name);
  return type.startsWith("image/") && type !== SVG_TYPE;
};
