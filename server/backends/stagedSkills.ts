// Does this root keep its collection skills in a `data/skills` staging tree?
//
// ONE predicate, because the engine reads the answer through two knobs that must agree — the
// host's `skillsStagingDir` (where views and schemas are READ from) and its
// `stagedSkillAuthoring` (which guide the agent is served, and where `putSchema` WRITES). Core
// spells the consequence out: a root told "author directly" while still handed a staging path
// reads a stale staged view instead of the one it just wrote, silently.
//
// Staging exists to route around the `.claude/` permission gate: the agent writes drafts to a
// plain data dir and a bridge mirrors the allowlisted files into `.claude/skills`. Only
// `views/*.html` never crosses — a staged collection's view HTML exists ONLY under
// `data/skills/<slug>/`, which is why a root that skips this base 404s every custom view (#1925).
import { existsSync } from "node:fs";
import path from "node:path";
import { isWorkspaceRoot } from "../infra/project-root.js";
import { isManagedWorkspace } from "./workspaceSetup.js";

const STAGING_DIR = ["data", "skills"];

/** `<root>/data/skills` when this root keeps its collection skills there, else `null` — the
 *  shape the engine's `skillsStagingDir` binding takes, where `null` means "skip the staging
 *  base entirely" (core 3.1.0).
 *
 *  Two roots qualify, and they are different questions:
 *
 *  - **The managed mulmoclaude workspace** (`~/mulmoclaude`). Unconditional, because it is what
 *    MulmoClaude stages into and what this app stages into when it runs there — including before
 *    the tree exists, since the first `putSchema` is what creates it.
 *  - **The workspace THIS server serves** (`CLAUDE_CWD`, the directory the launcher was started
 *    in) — but only on evidence, `data/skills` actually being there. The two roots are the same
 *    path only by coincidence, and when they differ a collection MulmoClaude staged into the
 *    directory we serve was unreadable here (#1925). The evidence check is what keeps that from
 *    reaching a launch directory that is somebody's git repository: a repo with no staging tree
 *    answers `null` exactly as it did before, so nothing starts writing a second copy of a skill
 *    definition into it. A directory that HAS one was staged by something, and reads and writes
 *    there agree with each other and with MulmoClaude.
 *
 *  A SAVED PROJECT is neither, and gets `null`. The engine reads staging first, so a stray
 *  `data/skills` file there would shadow the skill the repo commits.
 *
 *  Not cached: a workspace gains its staging tree the first time MulmoClaude writes to it, and a
 *  remembered "no" would keep this server blind to that for as long as it runs. */
export function skillsStagingDirFor(root: string): string | null {
  const staging = path.join(root, ...STAGING_DIR);
  if (isManagedWorkspace(root)) return staging;
  return isWorkspaceRoot(root) && existsSync(staging) ? staging : null;
}

/** The same answer as the authoring knob wants it. Derived rather than decided again, so the two
 *  cannot drift apart. */
export function usesStagedSkillAuthoring(root: string): boolean {
  return skillsStagingDirFor(root) !== null;
}
