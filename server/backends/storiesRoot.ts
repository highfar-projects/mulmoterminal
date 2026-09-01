// The one named mulmoScript stories root this server registers: the WORKSPACE.
//
// The plugin resolves `stories/<rel>` under a registered root, and a root is a SUBTREE — so one
// root at the workspace covers every repository beneath it, which is what "keep the deck next to
// the notes" needs (receptron/mulmoclaude#3014). The launcher puts the directory the user ran the
// command in into CLAUDE_CWD (bin/cli-args.js, chooseCwd), so the workspace IS that directory.
import { createHash } from "node:crypto";
import { canonicalPath } from "../infra/canonical-path.js";

/** Enough of the digest to be collision-free among the handful of directories one machine ever
 *  serves, short enough to read in a card payload. */
const ID_CHARS = 16;

/**
 * The id the wire `root` names, derived from the directory itself.
 *
 * NOT a label like `workspace`. The id is persisted in the Canvas cards the browser stores, and
 * the plugin treats it as opaque — so a label would keep matching after the user restarted
 * MulmoTerminal somewhere else, and an old card would silently open a file in a DIFFERENT subtree.
 * Derived from the path, a new workspace mints a new id, the old card names a root this server
 * never registered, and the plugin refuses it (receptron/mulmoclaude#3015 made an unregistered
 * root a rejection rather than a fallback). Wrong-file becomes a refusal.
 *
 * Canonical, so the same directory reached through a symlink or with a trailing separator is one
 * id — the same normalisation `worktree-env.ts` compares paths with.
 */
export function storiesRootId(workspace: string): string {
  return createHash("sha256").update(canonicalPath(workspace)).digest("hex").slice(0, ID_CHARS);
}
