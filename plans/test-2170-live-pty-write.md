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

The cases: the two design guards below, a round trip, the pty surviving the write, a second write
on the same pty, and the escape-wrapped-write-then-submit shape `draft-injection.ts` uses.

## The trap this spec is built around

A terminal echoes what it is sent. A command whose source text contains the token it prints would
satisfy every assertion here **while the shell sat idle** — the test would pass against a pty that
reads and never runs, which is exactly the failure being tested for.

So each command builds its token out of two halves — `echo "MT""OK-live"` — and the token is
asserted to appear **exactly once**, which only the command's output can produce. A test pins that
property of the test itself, so the protection cannot be removed by accident.

## Why the waiter races the pty's exit

A waiter that only ever answered "the token arrived" or "it did not" makes a pty that DIED and a
runner that was merely SLOW look identical — and those want opposite responses. So the wait settles
on `output`, `exited` or `timeout`, whichever comes first.

Measured, by mutating the pty to exit at the first write (node-pty#955's own shape) and running the
file with and without the distinction: with it, the suite reports in a few seconds saying
`expected 'exited' to be 'output'`; without it, it takes the full timeout budget and says
`expected 'timeout' to be 'output'`, which reads as a loaded runner. Same red, two orders of
difference in what the next person does about it.

The separate liveness case survives that change for a narrower reason: it asserts the pty is up
BEFORE the write as well as after. "Never started" and "the write killed it" are different bugs with
different owners, and nothing else here tells them apart.

## The paste case asserts what this repo owns, not what the shell does

It began by asserting the shell RAN the pasted command. That passes under zsh and times out under
bash and under the `/bin/sh` that `defaultShellPath` falls back to when SHELL is unset — which is
what ubuntu CI would have hit. Only zsh was ever run locally, so only the passing configuration
was seen.

Asserting it was also the wrong subject. Draft injection targets an agent's TUI, which turns
bracketed paste on; an arbitrary `$SHELL` may not have the mode at all. What must hold everywhere
is the part this repo owns: an escape-wrapped write and a separate submit both reach the child and
leave the session usable — an escape-laden write being exactly the shape that would break it. That
invariant was measured under zsh, bash, `/bin/sh` and with SHELL unset.

## Readiness is observed, not slept through

An interactive shell has rc files to read before it will take input. A fixed sleep is either too
long on every run or too short on the one loaded runner that matters, so the spec waits for the
shell's first output — its prompt — and then a short grace for the terminal modes a shell sets
straight afterwards, bracketed paste among them.

## Not in scope

Downgrading `node-pty` to beta.14, and whether #1595's fd-leak fix is in beta.14. Those only matter
if this goes red; the point of the spec is that we would find out.
