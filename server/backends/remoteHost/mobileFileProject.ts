// Which project's shared files a terminal session's screen links to (#2915).
//
// The DEEPEST project containing the session's directory, and only when that project itself
// declares `mobileFiles`: a session in a registered sub-project that shares nothing must not open
// the enclosing workspace's files under its own name. The answer is the opaque project id the
// file commands already take — never a path (commandScope.ts).
import { isWithin } from "../../infra/path-within.js";

export interface ProjectRow {
  id: string;
  cwd: string;
}

/** The id to link to, or "" when the session's project shares no files. */
export function mobileFilesProjectFor(projects: readonly ProjectRow[], cwd: string, shares: (root: string) => boolean): string {
  if (!cwd) return "";
  const containing = projects.filter((project) => isWithin(project.cwd, cwd));
  const deepest = containing.reduce<ProjectRow | null>((best, project) => (best === null || project.cwd.length > best.cwd.length ? project : best), null);
  return deepest !== null && shares(deepest.cwd) ? deepest.id : "";
}
