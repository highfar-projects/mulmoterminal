// A file outside every directory the server already serves, opened in a tab by a click (#3024).
// The raw route refuses such a file, because a cross-site page could embed it; instead the app asks
// for a one-file URL with a same-origin POST, and only that file is served under it. Both sides
// decide from these: the browser which clicks go this way, the server which files it will grant.
import { HTML_FILE_NAME } from "./filesPage.js";
import { rawContentType } from "./rawContentType.js";

export const FILE_GRANT_ROUTE = "/api/files/grant";
export const GRANTED_FILE_ROUTE = "/api/files/granted";

/** How a granted file is sent: an HTML page under the preview CSP, anything else as the raw route
 *  sends it. Null for a type a tab would not show, which keeps going where it went before. */
export type GrantKind = "page" | "raw";

const SHOWN_RAW = /^(image|video|audio)\/|^application\/pdf$/;

export function grantKind(name: string): GrantKind | null {
  if (HTML_FILE_NAME.test(name)) return "page";
  return SHOWN_RAW.test(rawContentType(name)) ? "raw" : null;
}

/** The POST's answer: the URL to open, or why there is none. `missing` is its own reason so the tab
 *  can say the file is not there, rather than that it was refused. */
export type FileGrantResult = { ok: true; url: string } | { ok: false; reason: "missing" | "refused" };
