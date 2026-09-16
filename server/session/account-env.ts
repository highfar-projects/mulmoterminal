// Turning a resolved `accounts[]` entry into the env a spawned `claude` reads its login from
// (#579-shaped — see common/accounts.ts for the promise this keeps: a token's raw value never
// sits in a config file this app serves).
//
// Carried through the SAME channel session-settings.ts already uses for a provider's token, and
// that a devcontainer session's OAuth token rides too (server/infra/claude-credentials.ts): the
// settings file's `env` block, which Claude Code applies to its own process at startup — so
// CLAUDE_CONFIG_DIR takes effect before Claude Code goes looking for `~/.claude.json`.
//
// Never throws: requirement is that an account picked from a stale list, or one omitted here
// entirely, falls back to the host's default login rather than refusing to start. That is the one
// way this differs from a provider — a provider's TOKEN is required (a base URL with none would
// silently send the real Anthropic credential to the third party), while an account with no
// resolvable token is not a security hole, only a session that runs unauthenticated until someone
// logs in inside it.
import { homedir } from "node:os";
import { expandTilde } from "../files/pathContainment.js";
import type { Account } from "../../common/accounts.js";

// The env an account resolution contributes to a session's settings file, on top of whatever a
// provider already put there.
export function accountEnvFor(account: Account, env: NodeJS.ProcessEnv, home: string = homedir()): Record<string, string> {
  const result: Record<string, string> = { CLAUDE_CONFIG_DIR: expandTilde(account.configDir, home) };
  if (account.oauthTokenEnvVar) {
    const token = env[account.oauthTokenEnvVar];
    if (token) {
      result.CLAUDE_CODE_OAUTH_TOKEN = token;
    } else {
      console.warn(
        `[accounts] account '${account.id}' names ${account.oauthTokenEnvVar} for its token, but it is not set in the server's environment — starting without one`,
      );
    }
  }
  return result;
}
