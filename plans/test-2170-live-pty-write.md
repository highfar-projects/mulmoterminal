# test: cover writing into a live PTY (#2170)

## The gap

Every spec that spawns a pty hands it argv and waits for `onExit` — a one-shot command. Nothing
anywhere writes into a pty that stays alive and reads the answer back, which is the shape a cell
actually uses:

```
server/session/pty-connection.ts:70    term.write(msg.data)
server/session/pty-connection.ts:162   entry.term.write(msg.data)
server/session/draft-injection.ts:103  entry.term.write(`\x1b[200~${line}\x1b[201~`)
```

The issue frames this as a Windows gap. It is not: `grep` for a pty `write()` across `test/` and
`server/**/*.spec.ts` finds none on any platform. Windows is the leg with an open report against
it — `node-pty` is pinned to an exact `1.2.0-beta.15` (the version that fixed #1595's fd leak), and
microsoft/node-pty#955 reports that exact version exiting with "terminal process has exited" at the
FIRST write, bisected, with beta.14 clean and no reply since 2026-08-18.

So: nobody knows whether this repo is affected, and nothing would say so.

## The change

One spec, `test/server/session/pty-live-write.spec.ts`, running on every platform. No production
code changes. It starts the **Shell cell's own invocation** — `launchInvocation(defaultShellTarget(...))`,
so `powershell.exe` on Windows and `bash -lc "exec '<shell>'"` on POSIX — writes into it, and waits
for the output.

Five cases: the design guard below, a round trip, the pty surviving the write, a second write on the
same pty, and the bracketed-paste-then-submit shape `draft-injection.ts` uses.

## The trap this spec is built around

A terminal echoes what it is sent. A command whose source text contains the token it prints would
satisfy every assertion here **while the shell sat idle** — the test would pass against a pty that
reads and never runs, which is exactly the failure being tested for.

So each command builds its token out of two halves — `echo "MT""OK-live"` — and the token is
asserted to appear **exactly once**, which only the command's output can produce. A test pins that
property of the test itself, so the protection cannot be removed by accident.

## Why "keeps the pty alive" is its own case

The round trips already fail if the pty dies. They fail by *timing out with no output*, which on a
loaded runner reads as a slow runner. Measured against a simulated early exit: the liveness case
fails in well under a second naming the cause, while each round trip takes the full timeout. The
separate case is what makes a future regression diagnosable rather than retried.

## Not in scope

Downgrading `node-pty` to beta.14, and whether #1595's fd-leak fix is in beta.14. Those only matter
if this goes red; the point of the spec is that we would find out.
