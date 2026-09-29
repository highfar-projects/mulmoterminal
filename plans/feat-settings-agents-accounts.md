# feat: custom agents and accounts added and removed in Settings (#2620)

Part of #2616.

## What

Settings → Models and backends had read-only lists of `customAgents` and `accounts`. Each is now a
list with a remove button per entry and an add form, in the shape of the other Settings lists:

- custom agent: a name and a command (`agent` is always `claude`, the only kind that exists);
- account: a name, Claude Code or Codex, and the config directory.

Each add or remove is ONE entry, applied on the server to the list ON DISK
(`/api/config/custom-agents/{add,remove}`, `/api/config/accounts/{add,remove}`,
`server/config/agent-entry-routes.ts`), which answers the resulting list. A tab never sends its copy
of the whole list, which would drop an entry another tab, another MulmoTerminal or a hand-edit added
since it loaded — the reason the saved directories and palette favorites work this way too. The
Agent Picker and the launch form's account select follow at once, without a reload or a restart.

## Decisions

- **The id is derived from the name** (`slugFromLabel`, then `-2`, `-3` … until free), never asked
  for. A name with no Latin letters falls back to `agent` / `account`. A custom agent never takes a
  built-in agent's id (`claude` becomes `claude-2`).
- **No edit, only remove and add.** The id is what a session is remembered by, so changing it is a
  different entry; the hint says so, and that re-adding an account under the same name brings its
  sessions back.
- **The id is built on the server, against the list under the lock** (`common/agentEntries.ts`,
  shared with the form, which uses it to refuse early and say why). A refusal comes back as the same
  problem word the form shows. Adding an account installs the bundled skills into its home, as
  `POST /api/config` does.
- **Every row's remove button is held while a change is out**, so two quick removes cannot race.
- **The limits moved to `common/`** (`CUSTOM_AGENT_*_MAX`, `ACCOUNT_*_MAX`), so the form refuses
  before sending what the server would cut or drop.
- **The custom-agent hint says how a command must end** (`--` for a wrapper with its own flags, and
  how to check with `--version`) — the failure the skill warns about, and the reason these were
  display-only (`settings-coverage.spec.ts`, now edited deliberately).

## Verification

- Specs: `agentEntries.spec.ts` (slug, uniqueness, every refusal), `agent-entries-server-keeps.spec.ts`
  (what Settings builds is what the server's sanitizers keep, unchanged),
  `agentEntryEditors.spec.ts` (add, remove sends the rest, problem text, refused save keeps the form).
  Each decision was inverted and the specs went red.
- A real server with a scratch HOME: both editors wrote `config.json`; the new custom agent was in the
  Agent Picker and the account in the Codex account select, both without a reload.
