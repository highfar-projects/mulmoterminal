// The Files pane's rendered-page route (#2269): an HTML file shown in the pane's Preview, addressed
// by PATH rather than by query so that what the page links relatively (an image beside it) resolves
// to a file beside it. Both ends build or read this shape, so it lives here once.
//
//   /api/files/page/<cwd, one encoded segment>/<path, each segment encoded>
//
// The base is ONE segment — `encodeURIComponent` turns its slashes into `%2F` — so a relative URL
// the page resolves stays under the same base, and the path after it is the page's own directory.

export const FILES_PAGE_ROUTE = "/api/files/page";

/** The URL of `pathRel` (relative to `cwd`) as a rendered page. */
export const filesPageUrl = (cwd: string, pathRel: string): string =>
  `${FILES_PAGE_ROUTE}/${encodeURIComponent(cwd)}/${pathRel.split("/").map(encodeURIComponent).join("/")}`;

const decoded = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

/** The base and the relative path a page request names, or null when it names none. `tail` is what
 *  follows the route, still percent-encoded. Each path segment is decoded ON ITS OWN and refused if
 *  it then holds a separator: decoding the whole first would let `%2F` smuggle a `/` past the split,
 *  and `..` is left for the caller's containment check, which is where escapes are decided. */
export function filesPageRequest(tail: string): { cwd: string; pathRel: string } | null {
  const [base, ...rest] = tail.split("/");
  const cwd = base === undefined ? null : decoded(base);
  const segments = rest.map(decoded);
  if (!cwd || segments.length === 0) return null;
  if (segments.some((segment) => segment === null || segment === "" || /[/\\]/.test(segment))) return null;
  return { cwd, pathRel: segments.join("/") };
}
