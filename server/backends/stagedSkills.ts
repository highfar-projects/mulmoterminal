// Does this root keep its collection skills in a `data/skills` staging tree?
//
// ONE answer, for two things that must agree: where views and schemas are READ from
// (`skillsStagingDir`) and where the agent is told to AUTHOR them (`schemaDocs` / `putSchema`).
// The second is not a second binding — core's `authoringTarget` falls through to this same path
// unless the host hands it a `stagedSkillAuthoring: false`, so MulmoTerminal hands it nothing and
// there is only ever one thing to keep right (server/infra/collection-tool.ts says why).
//
// Core spells the consequence of getting it wrong out: a root told "author directly" while still
// handed a staging path reads a stale staged view instead of the one it just wrote, silently.
//
// Staging exists to route around the `.claude/` permission gate: the agent writes drafts to a
// plain data dir and a bridge mirrors the allowlisted files into `.claude/skills`. Only
// `views/*.html` never crosses — a staged collection's view HTML exists ONLY under
// `data/skills/<slug>/`, which is why a root that skips this base 404s every custom view (#1925).
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { isWorkspaceRoot } from "../infra/project-root.js";
import { isManagedWorkspace } from "./workspaceSetup.js";

const STAGING_DIR = ["data", "skills"];
const SCHEMA_FILE = "schema.json";

/** Does this staging tree hold a staged COLLECTION — some `<slug>/schema.json`?
 *
 *  The directory merely existing is a weaker claim than it looks. `data/skills` is a
 *  generic-looking path a repository could own for its own reasons, and answering "staged" for
 *  one would redirect where the agent authors on the strength of a name. A `<slug>/schema.json`
 *  under it is the layout a staged collection actually has — the same evidence core's own
 *  `canonicalBase` looks for before it treats the staging tree as authoritative.
 *
 *  Every entry is probed rather than only the directories, so a symlinked collection counts. The
 *  scan stops at the first hit and walks one directory of collection slugs.
 */
function holdsStagedCollection(staging: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(staging);
  } catch {
    return false; // absent, unreadable, or not a directory
  }
  return entries.some((entry) => existsSync(path.join(staging, entry, SCHEMA_FILE)));
}

/** `<root>/data/skills` when this root keeps its collection skills there, else `null` — the
 *  shape the engine's `skillsStagingDir` binding takes, where `null` means "skip the staging
 *  base entirely" (core 3.1.0).
 *
 *  Two roots qualify, and they are different questions:
 *
 *  - **The managed mulmoclaude workspace** (`~/mulmoclaude`). Unconditional, because it is what
 *    MulmoClaude stages into and what this app stages into when it runs there — including while
 *    the tree is still empty, since the first `putSchema` is what fills it.
 *  - **The workspace THIS server serves** (`CLAUDE_CWD`, the directory the launcher was started
 *    in) — but only when a staged collection is actually sitting there. The two roots are the
 *    same path only by coincidence, and when they differ a collection MulmoClaude staged into
 *    the directory we serve was unreadable here (#1925). The evidence is what keeps that from
 *    reaching a launch directory that is somebody's git repository: no staged collection, and
 *    the root answers exactly as it did before, so nothing starts writing a second copy of a
 *    skill definition into it.
 *
 *  A SAVED PROJECT is neither, and gets `null` whatever it holds. The engine reads staging first,
 *  so a stray `data/skills` file there would shadow the skill the repo commits.
 *
 *  Not cached: a workspace gains its first staged collection the moment MulmoClaude writes one,
 *  and a remembered "no" would keep this server blind to that for as long as it runs. */
export function skillsStagingDirFor(root: string): string | null {
  const staging = path.join(root, ...STAGING_DIR);
  if (isManagedWorkspace(root)) return staging;
  return isWorkspaceRoot(root) && holdsStagedCollection(staging) ? staging : null;
}
