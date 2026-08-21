# Stopping MulmoTerminal — three independent routes (#1820)

The only way a user can stop the server today is Ctrl+C in the terminal that started it. That
terminal is exactly what gets lost: `npx mulmoterminal@latest` opens a browser, so attention moves
there, and the reported case is a Windows user whose starting tab was buried among many others —
they ended up hunting the process and killing it by hand.

Three routes, deliberately independent. Each is revertible on its own, so each is its own PR.

## What the audit found before any of this was designed

Two findings changed the shape of the answer, and both are cheap to lose again:

**`process.title` is not one feature on three platforms.** libuv implements it three ways.
On Linux it is `prctl(PR_SET_NAME)` plus an argv overwrite; on macOS the argv overwrite plus a
LaunchServices check-in; on Windows it is `SetConsoleTitleW` and *nothing else* — the image name
stays `node.exe`, so Task Manager, `Get-Process` and `taskkill /IM` are all untouched. The
platform where the report came from is the one where naming the process does not help.

**The instance registry already exists.** `bin/instances.js` writes
`~/.mulmoterminal/instances/<pid>.json` holding `{pid, port, startedAt}` (#1061), and the launcher
already reads it to ask "MulmoTerminal is already running — start another one anyway? [y/N]".
So in the reported scenario the user has *already been told* a server is running. The missing
half is only how to stop it — and the registry hands over the pid to do it with, on every
platform including the one `process.title` cannot serve.

## PR 1 — `process.title` (this PR)

Set the title on both the launcher and the server, once each, to `mulmoterminal :<port>`.

- **The port is in the string on purpose.** Overwriting argv is what makes `ps` say
  `mulmoterminal`, and the same overwrite erases `--port` and the install path that were the
  documented way to find the process. Putting the port back keeps `pkill mulmoterminal` working
  (both platforms match unanchored) while restoring what `ps` used to tell you, and it makes
  `pkill -f "mulmoterminal :34567"` able to pick one of several worktrees.
- **Both processes, not just the server.** A `node` with no name sitting next to a named one in
  `ps` is the confusion this removes, and killing either collapses both anyway — the launcher
  exits from its child's `close`.
- **Windows too, accepting that the console title is not restored on exit.** It does not name the
  process there, but it *does* name the Windows Terminal tab, which is the reported symptom.

Set once: on macOS each assignment costs ~7ms (libuv dlopens ApplicationServices and CoreFoundation
every call), measured at 14.6ms for the first.

## PR 2 — `mulmoterminal stop`

Read the registry, signal each live pid, report what was stopped. This is the route that works on
all three platforms, and the one Windows actually needs.

Also add a line to the launcher's "already running" prompt naming the command, because that prompt
is the exact moment the question gets asked.

## PR 3 — a Quit button in the browser

`POST /api/shutdown` — the path MulmoClaude already answers this need at (#2616), so both hosts
stop the same way — behind a confirmation, surfaced in Settings under the `sessions` group.

It runs the same path as Ctrl+C by SIGNALLING ITSELF rather than by calling the cleanup directly:
`process.kill(process.pid, "SIGTERM")` lands on the handler this PR extracted into
`server/infra/shutdown.ts`, so there is one shutdown implementation and not two that drift.

No extra CSRF defence is needed and none should be added: `sameOriginGuard` is mounted before
every route in `app-routes.ts` and covers all state-changing methods by default, which is the
whole point of it being central. The confirmation text has to say what happens to sessions,
because that answer differs — with tmux the agent sessions survive and reappear under Surviving
sessions, without it they end.

Exposure is unchanged by this: with a non-loopback `BIND_HOST` anyone who can reach the server can
already spawn an agent, so a quit route adds no new class of privilege.
