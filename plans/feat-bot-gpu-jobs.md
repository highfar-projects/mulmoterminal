# feat: run a remote bot's Python jobs on this Mac's GPU

## Goal

An agent that runs on someone else's server (GrokBot, on Grok's) has little compute. When a task
needs a GPU it currently hands the user a Python script, and the user copies it into a terminal
here, runs it, and copies the output back. Replace that copy-and-paste with a queue:

1. the bot POSTs a job (a Python script) over HTTP,
2. MulmoTerminal picks it up through Firebase — no polling, no inbound port on this machine,
3. the user approves it (always, at first) and it runs in a visible cell,
4. stdout / exit code go back to the bot.

Later, once it has proven itself, a job may run without the approval step.

No `claude -p` anywhere: the job is `python` running in a PTY cell, not an agent turn.

## What already exists — most of the transport

The Remote Host (`server/backends/remoteHost/`, `plans/feat-remote-host.md`) already listens to
`users/{uid}/hosts/mulmoterminal/commands` with `onSnapshot`, claims each command in a transaction,
runs a handler and writes `status: done | error` + `result` back. Handlers run concurrently
(`dispatchAddedCommands` does not await one before the next), so a handler that waits minutes for
an approval and a Python run blocks nothing else.

What is missing is **who the bot is**. `../mulmoserver/firestore.rules` lets only
`request.auth.uid == uid` touch `users/{uid}/hosts/**`. The bot cannot sign in with the user's
Google account, and handing it the user's session would hand it everything the phone can do —
collections, shared apps, typing into any terminal.

## Design

### 1. The bot never touches Firestore: a Cloud Function writes for it

New functions in `../mulmoserver/functions` (next to `push/`):

| Function | Caller | Does |
|---|---|---|
| `createBotToken` | MulmoTerminal (callable), signed in as the user | `{ hostId, name? }` → mint `mtb_<43 base64url>`, store `sha256(secret)` → `{ uid, hostId, name, createdAt }` in a top-level `botTokens/{hash}`, return `{ token, tokenId }` — the secret ONCE. The token is bound to ONE of the caller's hosts: an account can connect several machines (#3092), and a job is for this Mac |
| `revokeBotToken` | MulmoTerminal (callable), signed in as the user | `{ tokenId }` → delete it if it is the caller's |
| `submitBotJob` | the bot: `POST`, `Authorization: Bearer mtb_…`, body `{ script, args?, name? }` | write a command `{ method: "botJob", params: { script, args, name?, from: { tokenId, name } }, bot: { tokenId }, expiresAt: +10min }` into `users/{uid}/hosts/{hostId}/commands` with the Admin SDK; `202 { id, status }`. `params.from` is written by the Function, so the name shown at approval is the token's, never one the bot chose. `503` when the host is offline OR does not advertise `botJob` in its presence `capabilities` — the host registers the handler only when `botJobs.enabled`, so that one check is also the on/off switch |
| `getBotJob` | the bot: `GET ?id=&wait=<s>`, same bearer | `200 { id, status, result, error }`; with `wait` (≤ 50s) **long-polls** until `done` / `error`. Another token's job and a non-job command both read as `404`; the script is never echoed back |

What this buys:

- The **method is fixed by the Function** (`botJob`). The bot supplies params only, so it cannot
  call `terminalSession`, `startChat` or any other handler, however it is prompted.
- **Rules do not change** for the write path: Admin SDK bypasses them, and `botTokens` has no rule,
  so clients are denied by default. Nothing is added to any request's expression budget.
- A leaked secret is revoked from Settings, and reaches nothing but this one method.

### 2. MulmoTerminal: a `botJob` handler

Params: `{ script: string, args?: string[], name?: string }` — size-capped (e.g. 256 KB script).

1. Write the job to `~/.mulmoterminal/bot-jobs/<jobId>/job.py` (plus `meta.json`: bot name, time).
2. Open a **command cell** in that directory running a small wrapper:
   - prints the bot name and the script,
   - **asks `Run this job? [y/N]`** — the approval lives in the terminal the user is already looking
     at, so there is no new approval UI; a push (`pushKinds`) says a job is waiting,
   - runs `<python> job.py <args>` with stdout/stderr teed to `output.log`, then writes `exit_code`.
3. The handler waits for `exit_code` (or a "declined" marker) and returns
   `{ approved, exitCode, output }`, `output` being the **tail** of the log capped well under
   Firestore's 1 MB document limit (e.g. 200 KB), with a `truncated` flag.

Settings, in the global config (owned by `mulmoterminal-config`, which documents misc global keys):

```json
"botJobs": { "enabled": false, "python": "~/venvs/gpu/bin/python", "autoRun": false }
```

`python` matters: the GPU packages (torch with MPS etc.) live in the user's venv, not the system
python. `autoRun` skips the prompt — and it is decided **on the Mac**, never by a field the Function
or the bot can set. Phase 3 can make it per token.

Notes to verify while building:

- **How a server-side handler opens a command cell.** `launchTerminal` opens an agent cell via the
  grid and needs a connected browser (`NO_BROWSER_ERROR`); a command cell with a given command line
  may need its own channel message. Without a browser the job should fail fast with that message
  rather than wait.
- **Restart while a job is `processing`.** The runner never revisits a claimed command, so a
  restart leaves it hanging. On startup, finish such commands from the job directory (exit code
  present → `done`; otherwise `error: host restarted`).
- No Docker: the GPU here is Metal/MPS, which a container cannot reach. Isolation is the approval
  step, the dedicated working directory, and later a per-token allowlist — not a sandbox.

### 3. Getting the result to the bot — three ways, tried in order

1. **Long-poll `getBotJob`** — needs nothing but outbound HTTP, which the bot has. The baseline;
   ships first.
2. **Webhook** — `submitBotJob` accepts `callbackUrl`; a Firestore trigger (`onDocumentUpdated` on
   the commands path, filtered to `bot` commands) POSTs the result, signed with an HMAC of the
   secret. Real push, IF the bot can receive HTTP. Unknown — worth trying.
3. **Firestore listener** — the Function mints a custom token for uid `bot:<tokenId>` (NEVER the
   user's uid: the existing `hosts/**` rule would grant that full access) and a rule lets that uid
   read commands whose `bot.tokenId` matches. Only if the bot can keep a long-lived process with a
   Firebase SDK; costs one rule clause on a path the phone also reads.

## Phases

1. **mulmoserver** — DONE (receptron/mulmoserver#360, merged; functions not yet deployed).
2. **MulmoTerminal**, split in two:
   - **2a** — the `botJob` handler, `run.sh`, the cell, `botJobs` config, `/api/bot-tokens`. Set up
     through the `mulmoterminal-config` skill and the local API; no Settings control yet.
   - **2b** — a Settings section: the switch, the interpreter, mint (secret shown once) / revoke.
3. Try the webhook with GrokBot. Then `autoRun`, per token.

## What 2a settled

- **`botJob` is always in the handler table.** The table is built once at boot and the presence
  `capabilities` are its keys, so a handler registered only when enabled would need a restart to
  switch. `botJobs.enabled` is read per job instead, and refuses with a sentence. mulmoserver's
  capability check therefore means "this MulmoTerminal knows the command", and its 503 wording
  ("turn botJobs on") is only right for an older MulmoTerminal; the refusal of a switched-off host
  comes back through `getBotJob` as an error.
- **The cell is an unplaced `"shell"`.** The unplaced mark only knew agents, and a shell adopted as
  one falls to Claude. The mark now carries `"shell"`, and the grid adopts it as a Shell cell, which
  reattaches the live pty through `/ws/launch`. No open tab is needed.
- **Pinned against the reaper.** A detached idle session is reaped 30s after its tab closes, and a
  shell has no hooks, so it is always idle. The job's session is pinned (`registry.ts pinSession`)
  from before the spawn until the handler has an outcome.
- **`cat -v` on the approval screen**, so a script cannot repaint the prompt; the command line is
  printed from the same quoted words that run; anything but `y`/`yes` declines.
- **The push** follows `pushKinds: "waiting"` — a job waiting for approval is that kind of moment.
- **Known gap:** a restart while a job waits or runs leaves its command `processing` for good (the
  runner never revisits a claim). The tmux shell survives; the bot just never hears back.

## Open questions

- Inputs larger than the script (images, audio): inline base64 in params up to a cap, or the script
  downloads from a URL itself. Starting with the latter costs nothing.
- Output files (generated images): phase 2 returns stdout only; upload `out/` through the existing
  Storage staging (`mobileFileStaging.ts`) and return signed URLs later.
- Same Firebase project (`mulmoserver`) as the phone — yes, the host channel lives there.
