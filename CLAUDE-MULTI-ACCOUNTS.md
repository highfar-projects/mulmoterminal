# Multiple Claude accounts — setup notes

Personal-fork feature (not upstream): switch which Claude Code login a session authenticates as,
per grid cell or per directory. Built for juggling several Claude accounts (a work login, a
personal one) without logging in and out of `~/.claude` by hand.

Full reference stays in [README.md](README.md) ("Other accounts" section, and the `accounts` /
`GET /api/accounts` rows in the config and API tables) — this file is the setup walkthrough:
what to actually type, in what order, to get a second account working.

## What an account entry is

```jsonc
// ~/.mulmoterminal/config.json
{
  "accounts": [
    { "id": "work", "label": "Work", "configDir": "~/.claude-work" },
    { "id": "personal", "label": "Personal", "configDir": "~/.claude-personal", "oauthTokenEnvVar": "PERSONAL_CLAUDE_TOKEN" }
  ]
}
```

| Field | Required | What it does |
|---|---|---|
| `id` | yes | Lowercase slug, `^[a-z0-9][a-z0-9_-]{0,31}$`. Keys the `?account=` query param and the session→account log — pick it once, don't rename it later (see "Renaming" below). |
| `label` | yes | What the ACCOUNT select and the Settings list show. Up to 40 characters. |
| `configDir` | yes | Passed to the spawned `claude` as `CLAUDE_CONFIG_DIR` — which `~/.claude`-shaped directory that login's credentials/settings/session history live in. A leading `~` expands to the server's home directory. Up to 500 characters. |
| `oauthTokenEnvVar` | no | Names an environment variable (never the token itself) the **server** reads a long-lived `claude setup-token` OAuth token from, for a login that has no interactive session on this host. Up to 100 characters. |

Up to 16 accounts. Anything invalid (bad id shape, empty label/configDir, a duplicate id) is
dropped silently on save — the same "sanitize, never reject the whole file" rule every other list
setting in this app follows.

**The account's own directory is never created for you.** `configDir` just tells `claude` where to
look; give it a real directory (an empty one is fine — `claude login` in a terminal running under
that account creates the rest).

## Two ways to add one

**Settings → Claude accounts** — the id/label/config-dir/token-env fields, one row per account, add
and remove buttons. No server restart needed — the list is read live, so a **fresh launch** (a new
cell, or an empty one) can pick a newly added account right away. An **already-running** session
cannot: per "Resuming" below, it keeps whichever account (or lack of one) it already started on,
even through the header's Restart button — that button resumes the same conversation, and resuming
is exactly the case that ignores both the picker and the directory default on purpose.

**Hand-edit `~/.mulmoterminal/config.json`** — same shape as the JSON above. Also no restart needed
for the config itself, but see "Making a second login actually work" below for why the *token*
half can need one.

## Making a second login actually work

Two shapes, depending on whether the second account can log in interactively on this same machine.

### A: this machine already has (or can get) an interactive session for it

Just point `configDir` somewhere and log in there directly:

```bash
CLAUDE_CONFIG_DIR=~/.claude-work claude login
```

Follow the normal browser OAuth flow. From then on, any session that resolves to this account
(picked from the launch form, or the directory's default) runs with `CLAUDE_CONFIG_DIR` set to that
same directory, and `claude` reads the login it finds there. No `oauthTokenEnvVar` needed.

### B: no interactive session for it here (e.g. this account only exists on another machine)

Generate a long-lived token for it — `claude setup-token` is Claude Code's own mechanism for
exactly this, a token good for about a year, meant for headless use:

```bash
CLAUDE_CONFIG_DIR=~/.claude-personal claude setup-token
```

Take the printed token and put it in the **server's own environment** (not the account entry —
`oauthTokenEnvVar` only ever names *where* to look), e.g. in the `.env` file `yarn dev` / `npx
mulmoterminal` reads at startup:

```
PERSONAL_CLAUDE_TOKEN=sk-ant-oat01-...
```

Set `oauthTokenEnvVar: "PERSONAL_CLAUDE_TOKEN"` on the account entry so it matches. **Restarting
the mulmoterminal server itself is required here** — env vars are only read at process startup,
same as every other server-level setting — a config edit alone is not enough for this half.

If the env var is missing or unset when a session actually needs it, the session still starts (on
that account's `configDir`, just unauthenticated) and the server logs a line naming which account
and which env var it looked for:

```
[accounts] account 'personal' names PERSONAL_CLAUDE_TOKEN for its token, but it is not set in the server's environment — starting without one
```

## Using it

- **Per session**: an empty cell's launch form has an **ACCOUNT** select beside **MODEL**. Picking
  one applies only to that one launch.
- **Per directory (default)**: `.mulmoterminal.json` in a project sets `"account": "work"`. Every
  new session launched there uses it unless the launch form overrides it. Leave it `null`/absent to
  keep using the host's own `~/.claude` login by default.
- **Resuming**: a resumed session ignores both of the above and keeps running on whichever account
  it was actually **started** on (recorded per session, the same way the custom-agent picker's
  choice survives a resume) — picking a different account in the launch form and then resuming an
  old conversation from "or resume here" does not silently move it to a different login mid-thread.

## Unset, unknown, or removed

Leaving `accounts` empty, or a directory's `account` unset, is the whole feature opting out —
every session runs on the host's own `~/.claude` login, exactly as if this had never been added.
Picking (or resuming into) an id that no longer exists in `accounts` falls back the same way, with
a log line naming the missing id — it never blocks a session from starting.

## Renaming an account

The **label** is free to change any time (Settings, or the config file) — nothing keys on it.

The **id** is not: it is what a resumed session's persisted mapping and a directory's `account`
default both point at. Changing an id used anywhere breaks those references (they fall back to the
host's own login, per "Unset, unknown, or removed" above, rather than erroring) — add a new entry
instead of renaming an id already in use.

## Security note

The raw token value is never written into `~/.mulmoterminal/config.json`, never served by
`GET /api/config`, and never returned by the public `GET /api/accounts` route (which answers only
`{ id, label }` — not even `configDir`). Only the environment variable **name** is stored/served;
the value itself lives solely in the server's own process environment, read once at spawn time and
placed into the per-session settings file Claude Code applies to itself at startup (the same
channel a provider's API key token already travels through).
