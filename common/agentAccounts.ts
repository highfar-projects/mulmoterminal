// An ACCOUNT: a second login for an agent CLI, kept in its own config home (#2215).
//
// Claude Code and Codex each keep their login, transcripts and settings in one directory, and
// both let the environment move it (CLAUDE_CONFIG_DIR / CODEX_HOME). An account names such a
// directory, so a cell can run on a different subscription from the cell beside it.
//
// It is NOT a custom agent (common/customAgents.ts). A custom agent is HOW the CLI is started;
// an account is WHOSE login it runs under. The two combine: an `ollama launch claude` custom
// agent can run on the work account.
//
// Configuring none changes nothing. A cell without an account gets no variable at all — not the
// default value, because Claude Code keys its keychain entry on the variable being SET: pointing
// CLAUDE_CONFIG_DIR at `~/.claude` explicitly is already a different login.
import { isRecord } from "./isRecord.js";

// The CLIs whose home an account can move. Each needs the spawn to set its variable and every
// reader of its state to follow the session's home, so adding one is that work, not a label.
export const ACCOUNT_AGENTS = ["claude", "codex"] as const;

export type AccountAgent = (typeof ACCOUNT_AGENTS)[number];

export const isAccountAgent = (value: unknown): value is AccountAgent => ACCOUNT_AGENTS.some((agent) => agent === value);

export interface AgentAccount {
  /** Stable slug. It keys the wire (`?account=`) and the per-session record, so renaming the
   *  LABEL is free while renaming this strands the sessions started on it. */
  id: string;
  /** What the launch form and the cell show. */
  label: string;
  /** Which CLI this is a login for. */
  agent: AccountAgent;
  /** The config home, absolute or `~/`-relative, as written. */
  home: string;
}

// Lowercase slug, for the same reasons as a custom agent id: it travels in a query string and is
// compared exactly on both sides.
export const ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const isAccountId = (value: unknown): value is string => typeof value === "string" && ACCOUNT_ID_RE.test(value);

// Relative homes are refused rather than resolved: the CLI would resolve one against each cell's
// own working directory, i.e. a different home — and login — per directory.
export const isAccountHome = (value: unknown): value is string =>
  typeof value === "string" && (value.startsWith("/") || value.startsWith("~/") || /^[A-Za-z]:[\\/]/.test(value));

/** A wire/config row read back as an AgentAccount. Used by the server sanitizing config.json and
 *  by the browser filtering GET /api/config. */
export function isAgentAccount(row: unknown): row is AgentAccount {
  if (!isRecord(row)) return false;
  return isAccountId(row.id) && typeof row.label === "string" && !!row.label.trim() && isAccountAgent(row.agent) && isAccountHome(row.home);
}
