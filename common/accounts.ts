// An ACCOUNT: which Claude Code login (`~/.claude` config directory) a session authenticates as.
//
// Lets someone juggling several Claude accounts (a work login, a personal one) choose, per grid
// cell, which one `claude` runs under — without ever writing a token's raw value into a config
// file this app serves over HTTP. Same promise as a provider's `tokenEnv` (server/session/
// provider-env.ts): the config names WHERE a secret lives, never the secret itself.
import { isRecord } from "./isRecord.js";

// Lowercase slug, same shape as a custom-agent id (common/customAgents.ts): it travels in a query
// string and is compared exactly on both sides.
export const ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const isAccountId = (value: unknown): value is string => typeof value === "string" && ACCOUNT_ID_RE.test(value);

export interface Account {
  /** Stable slug. Keys the wire (`?account=`) and the persisted session→account log, so renaming
   *  the LABEL is free while renaming this is not. */
  id: string;
  /** What the ACCOUNT select and the settings list show. */
  label: string;
  /** Passed to the spawned `claude` as `CLAUDE_CONFIG_DIR` — which Claude Code login this account
   *  runs under. A leading `~` expands to the server's home directory. */
  configDir: string;
  /** Name of the env var the server reads a long-lived `claude setup-token` OAuth token from —
   *  never the token itself (see server/infra/claude-credentials.ts, which reads the same shape
   *  of env var for a devcontainer session's login). Optional: an account with no token still
   *  sets CLAUDE_CONFIG_DIR, for a host whose `claude` is already logged in under that directory. */
  // `| undefined` because config-schema.ts's accountSchema `satisfies z.ZodType<Account>`, and
  // Zod's `.optional()` produces `T | undefined`, not "key may be absent" (see the same note on
  // common/quickCommands.ts's QuickCommand.agents).
  oauthTokenEnvVar?: string | undefined;
}

/** A wire/config row read back as an Account. Used by both sides: the server sanitizing
 *  config.json and the browser filtering GET /api/config. */
export function isAccount(row: unknown): row is Account {
  return (
    isRecord(row) &&
    isAccountId(row.id) &&
    typeof row.label === "string" &&
    !!row.label.trim() &&
    typeof row.configDir === "string" &&
    !!row.configDir.trim() &&
    (row.oauthTokenEnvVar === undefined || (typeof row.oauthTokenEnvVar === "string" && !!row.oauthTokenEnvVar.trim()))
  );
}

// What GET /api/accounts answers with — enough for the launch form's ACCOUNT select, never the
// configDir or the token env var name (see server/config/config-routes.ts).
export interface AccountOption {
  id: string;
  label: string;
}
