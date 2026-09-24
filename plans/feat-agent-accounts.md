# feat: a cell per subscription — `accounts` (#2215)

Builds on #2222 / #2224: every agent's home resolves through `server/agents/agent-homes.ts`, and
the claude path helpers in `server/session/project-dir.ts` already take the home as a parameter.

## What the user asked for

Pick a subscription per cell (Claude Code and Codex), see which one a cell runs on, and see each
subscription's remaining usage. **A user who configures nothing sees no change at all.**

## Decisions (agreed with the user)

- A new global config key, `accounts`, separate from `customAgents`: a custom agent is *how* claude
  is started, an account is *whose login* it runs under. The two combine in the picker.
- Claude and Codex both, in the first PR.
- Accounts are added through `config.json` and the `mulmoterminal-model` skill, not a Settings form.
- Per-account usage gauges are part of the series (PR 4).

```json
"accounts": [
  { "id": "work", "label": "Work", "agent": "claude", "home": "~/.claude-work" },
  { "id": "home2", "label": "Personal", "agent": "codex", "home": "~/.codex-personal" }
]
```

## Ground truth the design rests on

- Claude Code 2.1.281 names its keychain entry `Claude Code…` plus `-<sha256(config home)[0:8]>`
  **only when `CLAUDE_CONFIG_DIR` is set**. So a separate home is a separate login — and setting
  the variable to the default `~/.claude` is ALSO a separate login. A cell with no account must
  therefore get no variable at all, not the default value.
- The variable has to reach the process environment (tmux `-e`). The settings `env` block is read
  after claude has chosen its config home, so it splits the login from the transcripts (#2215).
- `tmux new-session -A` ignores env and argv on reattach, so the running process keeps its home;
  the server must REMEMBER a session's account rather than re-derive it.

## Series

1. **Core (this PR).** Config + validation, the per-session record, the spawn env, and every
   server reader. Server only: the browser can pass `?account=`, but nothing offers it yet.
2. **UI.** Account choice in the launch form, the account label on a cell, and account names on
   listed sessions.
3. **Per-home GUI MCP and bundled skills.** `claude mcp add` and the `.claude.json` read run
   against the session's home; bundled skills are installed into every account home.
4. **Per-account usage.** Rate-limit store keyed by (agent, account), one probe per claude account,
   one gauge per account.

## Core PR shape

- `common/agentAccounts.ts` — the `AgentAccount` type, id rule, and row guard (shared with the
  browser, which reads the list off `/api/config`).
- `server/config` — `accountSchema`, `sanitizeAccounts`, the `accounts` field, `getAccounts()`.
- `server/session/account-log.ts` + registry — `account-sessions.jsonl`, an append log like
  `custom-agent-sessions.jsonl`, hydrated before any resume decision.
- `server/agents/agent-accounts.ts` — resolve an account's home, and the home a SESSION reads from
  (its recorded account, else the server default).
- Spawn — `CLAUDE_CONFIG_DIR` / `CODEX_HOME` added to the pane env only for a session with an
  account. A resume keeps the recorded account and ignores the requested one.
- Readers — session-scoped reads take the session's home; per-directory lists and global scans
  read the default home plus every configured account, tagging rows with the account.

## Not in scope

- The tmux server's global environment can already hold a `CLAUDE_CONFIG_DIR` from an earlier
  start; a default cell inherits it and tmux offers no way to remove it for one pane. Pre-existing,
  not made worse.
- Relative account homes are rejected at load, not resolved.
