// The rules behind the Files pane's Markdown Preview, with none of the pane in it.
//
// Preview is an iframe onto a route that renders the file ON DISK. That makes two things
// decisions rather than details — which revision the iframe asks for, and whether the toggle
// survives a load — and both were wrong in a way nothing could catch while they lived inside
// the component as an interpolated template string and a bare assignment (#2136).
import { browseQuery } from "./filesPaneApi";

/** The version of the open file ON DISK, as the pane currently knows it.
 *
 *  Preview follows disk even while the buffer is dirty: it is the server's rendering of the
 *  file, so it already showed something other than the buffer before the first keystroke. A
 *  conflict holds the version the poll found on disk; `baseVersion` holds it whenever the
 *  buffer was clean enough to adopt the new content. */
export function diskVersion(baseVersion: string | null, conflict: { version: string | null } | null): string | null {
  return conflict ? conflict.version : baseVersion;
}

/** The `?cwd=&path=&v=` the preview iframe asks for.
 *
 *  `/api/files/browse/md` resolves `cwd` and `path` and reads nothing else, so `v` reaches no
 *  server logic. It is there so the src CHANGES when the file does — the only thing that makes
 *  a browser refetch a document it already has. */
export function previewQuery(cwd: string | null, pathRel: string, version: string | null): string {
  const params = new URLSearchParams(browseQuery(cwd, pathRel));
  if (version) params.set("v", version);
  return params.toString();
}

/** Does a load of `pathRel` keep the Preview/Edit toggle where the user left it?
 *
 *  Only when it re-reads the file already open. That load is a REFRESH — the external-change
 *  poll adopting an agent's edit, or the conflict banner's Reload — and dropping out of Preview
 *  there throws the reader into the editor at the moment the preview finally has something new
 *  to show. Opening a DIFFERENT file is a fresh start and gets the default. */
export function keepsViewMode(pathRel: string, openPath: string | null): boolean {
  return pathRel === openPath;
}
