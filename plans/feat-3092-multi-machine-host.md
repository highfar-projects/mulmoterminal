# feat: several machines under one account, each on its own channel (#3092)

Design agreed on the issue: https://github.com/receptron/mulmoterminal/issues/3092#issuecomment-6253618453

## Order (each step needs the one before it)

1. receptron/mulmoserver#356: the phone accepts `mulmoterminal-<8 hex>` and lists `users/{uid}/hosts`. Merged.
2. receptron/mulmoserver#358: hosts unused for 30 days are deleted; the phone can remove an offline one.
3. receptron/mulmoclaude#3506: `@mulmoclaude/core` gains `resolveHostId` and `HostRunnerOptions.machine`. Must be published before this repo can build.
4. This repo.

## Deciding the channel

`hostIdentity.ts` (pure), `hostIdentityResolver.ts` (side effects injected), and `hostIdentityFile.ts` (`~/.mulmoterminal/remote-host.json`).

- A stored record is reused when its uid and hostname match. A different hostname means the directory was copied from another machine (synced dotfiles).
- Otherwise read `users/{uid}/hosts/mulmoterminal` from the server:
  - the doc exists with no `machineId`: a machine connected before this change, so it keeps `mulmoterminal`
  - the doc is absent (a new account), or carries another machine's id: `mulmoterminal-<8 hex>`
- A failed read rejects the connect. Guessing could put two machines on one channel, and core stops the old runner and lets the next connect retry.
- Every presence beat carries `machineId` and `label` (the hostname without `.local`).

## Writers outside the connect path

The session-activity publisher and Web Push read `currentHostId()` per write instead of a constant.

## Known limit (documented in the phone guide)

Two machines that shared `mulmoterminal` before this change: while one of them still runs the old version, it rewrites the presence doc without `machineId`. The other machine can then also claim `mulmoterminal` when it upgrades. The guide says to delete `remote-host.json` on one of them and reconnect.
