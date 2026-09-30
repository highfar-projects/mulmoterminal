// What the Files pane can show a file AS, besides its text (#2269). Decided from the name alone, like
// every other "what kind of file is this" question here, and asked of the same content-type table
// the raw route answers from (common/rawContentType.ts), so the pane and the server agree on which
// names are images.
import { rawContentType } from "../../common/rawContentType";
import { langKindForFilename } from "./cmEditor";
import { HTML_FILE_NAME } from "../../common/filesPage";

/** How a text file is previewed: Markdown rendered by the server, an HTML page in its sandbox, an
 *  SVG drawn as the image it is, or a CSV / TSV as a table (#2559). */
export type FilePreviewKind = "markdown" | "html" | "svg" | "table";

const SVG_TYPE = "image/svg+xml";

/** The extensions the table route reads, `.tsv` by tabs and the rest by commas. */
const TABLE_FILE_NAME = /\.(csv|tsv)$/i;

/** The file's Preview, or null for a file that is only ever read as text. */
export function filePreviewKind(name: string): FilePreviewKind | null {
  if (langKindForFilename(name) === "markdown") return "markdown";
  if (HTML_FILE_NAME.test(name)) return "html";
  if (TABLE_FILE_NAME.test(name)) return "table";
  return rawContentType(name) === SVG_TYPE ? "svg" : null;
}

/** Whether the Preview is drawn in the app's colours. The server writes them into the documents it
 *  renders; an HTML page or an SVG is the file's own, and gets the white a browser would give it. */
export const previewFollowsAppTheme = (kind: FilePreviewKind | null): boolean => kind === "markdown" || kind === "table";

/** What the pane draws from the raw route instead of reading as text (#2269, #2674). An SVG is
 *  text and is not one of these; it is edited as such and previewed. */
export type FileMediaKind = "image" | "pdf" | "video" | "audio";

export function fileMediaKind(name: string): FileMediaKind | null {
  const type = rawContentType(name);
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return type.startsWith("image/") && type !== SVG_TYPE ? "image" : null;
}
