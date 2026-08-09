// listCollectionProjects command handler.
//
// The other half of the project scope (../commandScope.ts): the handlers can already RESOLVE a
// project a command names, and this is how the phone LEARNS which ones there are. A picker needs
// `{ id, label }` pairs from the host and can invent neither.
//
// Mirrors GET /api/collection-projects, minus the `cwd`. The browser is handed each project's
// path because it has to MATCH a project to a cell it is already showing, and it knows every
// cell's cwd anyway. The phone has no such need and is a genuinely remote client, so the path
// stays here: an absolute root in a command or an artifact publishes the user's home directory
// over the wire, and the id is what the host resolves against its own list.
//
// The workspace is included and leads the list, as it does in the HTTP listing — a phone that
// wants "the host's own collections" names it like any other project rather than by omitting the
// parameter and hoping.
import { toJsonObject, type CommandHandlers } from "@mulmoclaude/core/remote-host";
import { listProjectRoots, type ProjectSummary } from "../../../infra/project-root.js";

export const listCollectionProjects: CommandHandlers["listCollectionProjects"] = async () => toJsonObject({ projects: disambiguated(listProjectRoots()) });

/** How many parent directories a duplicated label may borrow to become distinct. Two is enough to
 *  separate `~/mulmoclaude` from `~/git/ai/mulmoclaude`, which is the real case; a cap is what
 *  keeps this from walking up to the home directory and sending the whole path after all. */
const MAX_BORROWED_SEGMENTS = 2;

/** Labels a person can tell apart, without sending a path.
 *
 *  Two saved directories can carry the SAME label — `cwdPresets` dedupes by path, and an
 *  auto-derived label is just the basename, so a repo and its clone are both "mulmoclaude" (this
 *  is the author's own config). The browser never had to care: its listing carries each project's
 *  `cwd` and it matches them to cells. The phone deliberately gets no path, so two identical rows
 *  would be two rows it cannot choose between — the picker would be a coin toss.
 *
 *  A duplicate therefore borrows the least it needs from its parent directories: `git/ai/mulmo…`
 *  is enough to tell two clones apart and is NOT the absolute root the no-path rule is about (the
 *  rule exists so a command or an artifact never publishes the user's home directory). If two
 *  still collide after `MAX_BORROWED_SEGMENTS`, the id's first characters break the tie — ugly,
 *  but ugly and distinct beats pretty and ambiguous. */
function disambiguated(projects: ProjectSummary[]): { id: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const project of projects) counts.set(project.label, (counts.get(project.label) ?? 0) + 1);
  return projects.map((project) => ({
    id: project.id,
    label: (counts.get(project.label) ?? 0) > 1 ? distinguish(project, projects) : project.label,
  }));
}

/** The shortest tail of `cwd` that no other project shares, or the label plus an id fragment. */
function distinguish(project: ProjectSummary, projects: ProjectSummary[]): string {
  const tailOf = (cwd: string, depth: number) => cwd.split("/").filter(Boolean).slice(-depth).join("/");
  for (let depth = 2; depth <= MAX_BORROWED_SEGMENTS + 1; depth += 1) {
    const tail = tailOf(project.cwd, depth);
    const shared = projects.some((other) => other.id !== project.id && tailOf(other.cwd, depth) === tail);
    if (!shared) return tail;
  }
  return `${project.label} (${project.id.slice(0, 6)})`;
}
