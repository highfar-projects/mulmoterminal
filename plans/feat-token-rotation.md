# feat: rotate Claude subscription tokens per session (#2919)

## What the user asked for

Several Claude subscriptions, one set of conversations. Each new session should run on whichever
subscription is best placed to absorb it, so the weekly windows drain as evenly as possible, with
nothing for the user to pick. A session that hits its limit moves to another subscription and the
conversation carries on.

## Why not `accounts` (#2215)

An account is a separate `CLAUDE_CONFIG_DIR`, so its transcripts live in its own home and a
conversation cannot cross to another account. The user switches with `/login` today and the
conversation survives, because the home stays the same and only the credential changes. Rotation
does the same: **one home, many tokens.**

## Ground truth (Claude Code 2.1.284, measured on the user's two subscriptions)

- A `claude setup-token` token handed as `CLAUDE_CODE_OAUTH_TOKEN` runs on that subscription:
  `/status` says `Auth token: CLAUDE_CODE_OAUTH_TOKEN` and the statusLine's `rate_limits` are that
  token's own windows (different values and reset times per token). The header's "Claude API" is
  a label only.
- It wins over the `/login` keychain credential in the default home.
- It works from the `--settings` file's `env` block, not only the process environment — so it can
  travel in the 0600 settings file the provider path already uses, never on tmux's argv.
- A conversation started on token A and `--resume`d on token B in the same home continues.
- A turn that hits the limit fires the `StopFailure` hook with `error_type: "rate_limit"` (docs),
  and the transcript records `isApiErrorMessage: true, error: "rate_limit"`. Other providers' 429s
  are recorded the same way, so rotation only ever acts on sessions it started itself.

## Decisions (agreed with the user)

- Config key, off unless set. The default `/login` credential takes part as one more candidate.
- Choose by **burn pace** of the 7-day window: remaining % / time to reset, highest first — the
  window that resets soonest with room left is used before it is lost. A 5-hour window at or above
  its ceiling takes a token out of the running.
- Token secrets are never in `config.json`: an entry names a keychain item or a file.
- On a limit hit, the session is resumed on another token (PR 2).

## Config

```json
"tokenRotation": {
  "enabled": true,
  "includeDefaultLogin": true,
  "tokens": [
    { "id": "a", "label": "Personal", "keychain": "mulmoterminal-token-a" },
    { "id": "b", "label": "Work", "file": "~/.mulmoterminal/tokens/b" }
  ]
}
```

`keychain` reads `security find-generic-password -a mulmoterminal -s <name> -w` (macOS);
`file` reads a small file (other platforms). A token that cannot be read is skipped for that spawn.

## Which sessions rotate

Only a plain claude cell on the default home: no account bound, no custom agent, no provider.
Anything else already says whose credential it runs on. A tmux reattach starts nothing, so it
keeps the token its process was started with; only a newly started process is assigned one.

## Series

1. **Core (this PR).** Config + validation, the choice rule (pure, in its own file), token
   injection through the settings file (with `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` unset),
   the per-session record of which token a process runs on, and a usage probe per token whose
   readings appear beside the accounts' gauges. `mulmoterminal-model` skill documents the key.
2. **Limit hit.** Register `StopFailure`; a `rate_limit` from a rotated session marks its token
   spent and resumes the session on the next choice. The move is the Restart button's path done
   from the server (`server/session/limit-rotation.ts`): the cell's socket is detached before the
   process is ended, so no exit frame reaches it, then closed bare; the cell's own reconnect
   `--resume`s the conversation and the spawn chooses with the spent token held out. Agreed with
   the user: the prompt that hit the limit is not re-sent. A spent mark lasts until the next probe
   can measure the token; a session with nowhere better to go is left as it is.
3. **UI + guide.** The token's label on a cell (a `credential` frame after the spawn), the address in the
   gauge's hover, a "Token usage" screen in the feature menu (only while rotation is on), a usage-limit
   probe verdict that holds a used-up token out, the 98% switch line (choice ceiling, and a move at the
   end of a turn), and the setup guide in both languages.

## Choice rule (`server/agents/token-choice.ts`)

Input: candidates in config order, each with its last reading (or none) and `now_sec`.
- A window whose `resetsAt` has passed counts as unused.
- Out of the running: 7-day used >= 100, or 5-hour used >= `FIVE_HOUR_CEILING_PERCENT`.
- Eligible with a reading: highest `(100 - used7d) / max(hoursToReset, MIN_HOURS)`.
- No reading: after every eligible measured candidate (it is measured on the next probe).
- None eligible: the one whose blocking window resets first.
- Ties: config order.

The choice uses the last reading even when it is too old for the gauge to show: a stale number
is a better guide than none, and the gauge's age rule exists for display.
