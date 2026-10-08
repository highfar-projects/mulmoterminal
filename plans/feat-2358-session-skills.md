# feat(remote-host): listSkills per session (#2358)

## Decisions (maintainer, 2026-09-29)

- `listSkills` takes an optional `sessionId`. Absent, the list is exactly as before.
- For a claude session, the host looks the session's directory up itself (no path on the wire).
  It returns that directory's `.claude/skills/` plus the user's skills, minus collections, plus the
  skills of every ENABLED plugin as `plugin:skill`.
  - A session whose agent the host cannot tell (after a restart) is read as claude.
- Plugins enabled at user and project level both count. `enabledPlugins` is merged per key over
  user → project → project-local settings, the same layers `skillOverrides` reads.
  - An install applies if it is user scope, or if its `projectPath` is the session's directory.
- Another agent's session (codex, …) gets the plain list, because those agents call skills
  differently.
- A malformed id, or one the host does not know, is refused, as the terminal-session commands do.

## Not in this change

- mulmoserver sending `sessionId` (separate PR there).
- The header's Skill menu, which still lists no plugin skills.
