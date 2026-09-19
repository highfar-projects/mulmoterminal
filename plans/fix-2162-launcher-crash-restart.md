# fix(#2162): the shipped launcher restarts a crashed server, as `yarn dev` already does

## The asymmetry

`scripts/dev-server.mjs` has supervised the backend since #734: any exit brings it back with
backoff. `bin/mulmoterminal.js` — what every user runs — did the opposite: its `close` handler
ran `process.exit(code ?? 1)` for everything except exit 75. So the developer was protected and
the user was not.

Reproduced before changing anything, on a scratch `HOME` and a free port: start the launcher,
wait for the ready banner, `kill -SEGV` the server child. The launcher exited without printing
anything about it and the port stopped answering (`curl` → `000`). tmux still held the sessions,
so what was lost was only the thing that serves them — and on a phone there is no way back.

## The decision, and why it is not `restartPlan`

The issue suggested reusing `restartPlan` from `scripts/dev-server-config.js`. Two reasons not to:

- **`scripts/` is not in package.json's `files`.** An import of it from `bin/` resolves in this
  checkout and `ERR_MODULE_NOT_FOUND`s for everyone who installed the package — the exact failure
  the launcher already prints an npx-cache hint for.
- **The policy differs.** Dev retries EVERY exit forever, because a file save is how the developer
  fixes what was wrong. Production has no watcher, and it has exits dev never sees.

So the decision is a pure module of its own, `bin/server-supervision.js` (shipped, because `bin/`
is), and the launcher's `close` handler reports the exit instead of acting on it.

`planAfterServerExit` answers with one of three actions:

- **`port-in-use`** (exit 75) — unchanged: the caller says who has the port and stops. A port that
  is taken will still be taken.
- **`stop`** for
  - **exit 0.** `mulmoterminal stop` and the browser's Stop button both SIGTERM the server, whose
    handler exits 0. Restarting that would mean the product's own stop button does not stop it.
  - **a signal that is not a crash signal.** `kill -9 <pid>` is what `bin/stop.js` PRINTS when a
    server will not stop on its own, and the pid it prints is the server child's. A restart there
    defeats a documented escape hatch. The cost is named in the module: an OOM killer sends SIGKILL
    too, and that crash is not recovered. A stop that does not stop is the worse failure.
  - **a server that never bound in this launcher's lifetime.** Nothing was serving, so there is no
    browser session to bring back, and the next boot fails the same way. This is what keeps a bad
    config or a half-unpacked npx cache from being respawned — and keeps the npx-cache hint at the
    top of the output where it has always been, rather than under several repeats of the stack.
  - **too many failures in a row.** Bounded, so a server that binds and then dies immediately
    cannot be respawned forever.
- **`restart`** otherwise, with exponential backoff from the consecutive-failure count.

## Windows cannot have this yet, and the reason is not squeamishness

Found by reading the diff back, not by a bot: on Windows Node has no real signals, so
`mulmoterminal stop`, the browser's Stop button and a `taskkill` all TERMINATE the server instead
of delivering something its handler runs. `bin/stop.js` says so in its own note. The server
therefore never reaches the `exit(0)` that means "somebody asked for this", and the exit arrives as
a bare non-zero code with no signal — the exact shape of the crash this exists to recover from. A
launcher that restarted on it would resurrect a server the user had just stopped, and leave them no
way to stop it at all: `stop` reports success, and the thing comes back.

So the plan asks the platform, and Windows keeps the behaviour it had before supervision existed —
the launcher leaves with its server, silently, exactly as before. Fixing it properly means giving
`stop` a way to reach the LAUNCHER and not only the server it spawned, which is a change to the
instance registry and to `stop` itself. That is a separate PR, and it is the one thing this change
knowingly leaves undone.

The count resets when the server reports `{ type: "listening" }` — the launcher was already
listening for that message to decide where to poll. Deliberately not elapsed time: #1735 is the
case where "it stayed up N seconds" read every crash as a one-off because the server does its
whole setup before it binds.

Crash signals are enumerated (`SIGABRT`, `SIGSEGV`, `SIGBUS`, `SIGILL`, `SIGFPE`, `SIGTRAP`)
rather than derived: Node aborts on OOM, which is `SIGABRT`, and a native addon — `node-pty` here
— can take the process down with `SIGSEGV`. Anything not on that list is treated as a stop.

## What the user sees

A restart does not open a second browser tab — theirs is still open, waiting to reconnect — so
the browser is opened on the first lifetime only. The ready banner reprints, which is the point:
it says the URL is live again.

## Shape of the change

- `bin/server-supervision.js` (+ `.d.ts`) — the pure decision.
- `bin/mulmoterminal.js` — `runServer` takes one options object, resolves with
  `{ code, signal, served, stderrTail }` and exits the process nowhere; `superviseServer`
  recurses on the plan. The 20s address-fallback timer is now cleared on close: left armed, a
  dead child's timer would fire after a restart and announce the NEW child as if it were the old.
- `test/bin/server-supervision.spec.ts` — every branch, both directions.
- `test/server/infra/server-exit.spec.ts` — its source-text guard followed the literal to the
  new module.

## The ceiling was dead code, and a mutation sweep is what said so

Every decision in `planAfterServerExit` was inverted in turn against the new spec. All but one went
red.
The eighth — DELETING the clamp on the backoff delay — stayed green, because the doubling could
never reach the ceiling before the failure cap stopped it: the line executed and decided nothing.
Lowering the ceiling so the last allowed attempt reaches it makes it live, and the spec now pins
the relationship between the three numbers rather than just the delays they produce, so raising
the ceiling or lowering the cap says so instead of quietly returning the line to decoration.
With that, every mutation — the platform gate included — goes red.

## Verified

Against a real server, on a scratch `HOME` and a free port, with a fake `open` earlier on `PATH`
so browser launches are countable:

- **Crash after serving** (`kill -SEGV`): the launcher survives, names the signal, comes back, and
  the port answers 200 again. `open` was called once across both lifetimes — the restart does not
  take over the user's tab.
- **tmux's promise holds across it.** Both boots report the same surviving-session count and
  `reattach on connect`; nothing was reaped by the restart.
- **`mulmoterminal stop`** still stops it — exit 0, no restart — and the port goes quiet.
- **SIGTERM to the launcher** takes the server with it; **`kill -9` of the server child** ends the
  launcher rather than resurrecting the server, and says why.
- **A server that cannot boot at all** (an invalid `keymap`, which exits before binding) stops on
  the first failure, with the server's own reason directly above the launcher's.
- **A crash loop** (crash it, then make every later boot fail): five restarts, the delay doubling
  and then holding at the ceiling, then a give-up that names the count. The launcher exits.
- **The port stolen inside the restart window**: the fresh child exits 75 and the launcher prints
  the same port-in-use report as before, which is how that branch is reachable at all in practice.
