// listSkills command handler.
//
// Discoverable skill ids (~/.claude/skills + <workspace>/.claude/skills), read-only. Collection
// slugs are subtracted — a skill dir that ships a schema.json is a collection served by
// listCollections, so it must not double-list here (mirrors MulmoClaude's listSkills).
//
// The subtraction is what `discoverCollections` answers FOR THIS ROOT, and since core 3.3.0 that
// is scope-isolated: outside the managed workspace it excludes `~/.claude/skills` (see
// backends/collections/collections.ts). So a user-scope collection stays in this list when a project is
// named — correctly, because the reason to subtract is that listCollections serves it, and for
// that root it does not. It is a skill there, runnable by `claude` like any other under `~`.
//
// With a `sessionId` (#2358) the list is the one that claude session can run: its own directory's
// skills instead of the workspace's, plus its enabled plugins' `plugin:skill` ids. The directory is
// looked up here, so no path travels over the wire. Another agent's session gets the plain list —
// it calls skills differently.
import { discoverCollections } from "@mulmoclaude/core/collection/server";
import { toJsonObject, type CommandHandlers, type JsonObject } from "@mulmoclaude/core/remote-host";
import type { SessionAgent } from "../../../../common/sessionAgent.js";
import { SESSION_ID_RE } from "../../../config/env.js";
import { agentOfSession, cwdOfSession } from "../../../session/session-lookup.js";
import { userSkillsDir } from "../../collections/collections.js";
import { discoverPluginSkillIds } from "../pluginSkills.js";
import { discoverSkillNames } from "../skills.js";
import { scopeFromCommand } from "../commandScope.js";

export interface SkillSessionLookup {
  cwd: (sessionId: string) => string;
  agent: (sessionId: string) => SessionAgent | null;
}

const LIVE_LOOKUP: SkillSessionLookup = { cwd: cwdOfSession, agent: agentOfSession };

/** The directory whose skills a `sessionId` asks for, or null for the plain list: no session named,
 *  or one run by an agent other than claude. Null agent means the host cannot tell, which after a
 *  restart is usually a claude session, so it is read as one. */
export function sessionSkillRoot(params: JsonObject, lookup: SkillSessionLookup): string | null {
  const { sessionId } = params;
  if (sessionId === undefined) return null;
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) throw new Error("sessionId is not a session id");
  const cwd = lookup.cwd(sessionId);
  if (!cwd) throw new Error("unknown session");
  const agent = lookup.agent(sessionId);
  return agent === null || agent === "claude" ? cwd : null;
}

export interface ListSkillsOptions {
  lookup?: SkillSessionLookup;
  /** `~/.claude/skills`, or a test's stand-in; plugins are read from its sibling `plugins/`. */
  userDir?: string;
}

async function skillIdsFor(workspaceRoot: string, userDir: string): Promise<string[]> {
  const [names, collections] = await Promise.all([discoverSkillNames({ workspaceRoot, userDir }), discoverCollections({ workspaceRoot })]);
  const collectionSlugs = new Set(collections.filter((collection) => collection.source !== "feed").map((collection) => collection.slug));
  return names.filter((name) => !collectionSlugs.has(name));
}

export const createListSkills =
  (workspace: string, options: ListSkillsOptions = {}): CommandHandlers["listSkills"] =>
  async (params: JsonObject) => {
    const userDir = options.userDir ?? userSkillsDir();
    const sessionRoot = sessionSkillRoot(params, options.lookup ?? LIVE_LOOKUP);
    if (sessionRoot === null) {
      // The injected workspace is the DEFAULT, not the only answer — see ../commandScope.ts.
      return toJsonObject({ skills: await skillIdsFor(scopeFromCommand(params, workspace).workspaceRoot, userDir) });
    }
    const [own, plugins] = await Promise.all([
      skillIdsFor(sessionRoot, userDir),
      discoverPluginSkillIds({ workspaceRoot: sessionRoot, userSkillsDir: userDir }),
    ]);
    // Two marketplaces can ship plugins of one name, so the same `plugin:skill` can come back twice.
    return toJsonObject({ skills: [...new Set([...own, ...plugins])].sort((left, right) => left.localeCompare(right)) });
  };
