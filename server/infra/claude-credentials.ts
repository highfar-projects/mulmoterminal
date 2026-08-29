// Reusing the HOST's Claude Code login inside a devcontainer session, instead of every container
// rebuild starting from a fresh, unauthenticated `claude`.
//
// Bind-mounting `~/.claude/.credentials.json` into the container and pointing `CLAUDE_CONFIG_DIR`
// at it was the first approach, and it half-worked: a non-interactive `claude -p` call picked it
// up and authenticated fine, live-tested. The INTERACTIVE flow still showed the login picker
// regardless — copying the whole `~/.claude` directory in (not just credentials.json) made no
// difference either, live-tested — which points at an extra check the interactive path makes that
// isn't satisfied by the file's mere presence (`~/.claude.json`'s `machineID` field is the likely
// candidate: a device-binding check meant to stop credentials from being copied to a different
// machine, which working around further would mean deliberately defeating).
//
// `claude setup-token` is the mechanism Claude Code documents for exactly this shape of problem —
// a long-lived (1-year) token for headless/CI use, read from `CLAUDE_CODE_OAUTH_TOKEN` — and
// doesn't hit the device-binding check the copied session file did.
//
// Carried through the SAME channel session-settings.ts already uses for a provider's token
// (hook-settings.ts's `env` block, written into the per-session 0600 settings file Claude Code
// reads at startup and applies to its own process) rather than `devcontainer exec --remote-env`:
// that flag's value lands in the wrapping process's own argv, which `ps` shows to anyone on the
// host — the opposite of what session-settings.ts's own file already exists to avoid for a
// provider token.
export function devcontainerAuthEnv(): Record<string, string> {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  return token ? { CLAUDE_CODE_OAUTH_TOKEN: token } : {};
}
