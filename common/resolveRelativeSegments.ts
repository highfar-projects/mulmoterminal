// Lexical only: no filesystem, no separator other than `/`. Callers normalise backslashes first,
// and each decides for itself what root the result is relative to — this does not widen any.

/** `rel` with `.` and empty segments dropped and `..` applied, `/`-joined — or null when it climbs
 *  above its root, or resolves to the root itself (there is then no file to name). */
export function resolveRelativeSegments(rel: string): string | null {
  const out: string[] = [];
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.pop() === undefined) return null;
      continue;
    }
    out.push(segment);
  }
  return out.length ? out.join("/") : null;
}
