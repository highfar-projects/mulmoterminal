---
name: clone-ask
description: Ask an agent session that is open in ANOTHER clone or project folder in MulmoTerminal, and get its answer back — through MulmoTerminal's external ask routes (scripts/external-ask.mjs in the mulmoterminal fork). Use when the user says to ask, consult, check with, or hand a question to another clone / repository / session ("hfpdf のクローンに聞いて", "他のクローンに確認して", "ask the session in X", "check with the hf-apps clone"), or when work here needs an answer that only the session in another folder has. Also explains what to do when a request arrives FROM another session (a message ending in a tag like "[edgar 1a2b3c4d5e6f]").
---

# clone-ask — ask the session in another clone

MulmoTerminal on this machine has an "external ask" door (fork-only, `plans/feat-external-ask.md` in
the mulmoterminal repo): a local program types a request into one open session, the request carries a
tag, and the answer of the turn that tag started can be read back. This skill uses it to let one
session ask another.

## The script

`external-ask.mjs` sits next to this file (installed from `scripts/external-ask.mjs` of the fork):

```bash
node ~/.claude/skills/clone-ask/external-ask.mjs
```

Run it with the **Bash** tool, also on Windows: the commands below are bash, and PowerShell does not
expand `~` for a program's arguments. Inside a MulmoTerminal cell nothing else is needed: the port
comes from `MULMOTERMINAL_PORT` and the token from `~/.mulmoterminal/external-ask-token` of the same
side. Call it `ASK` below.

A Windows session can only reach Windows sessions and a WSL session only WSL sessions — the two
servers are separate, with separate tokens. Do not try to cross.

## Steps

1. **List the sessions** — `ASK --list`. Each line: id, agent, state, `allowed=`, cwd, memo, and
   `[this session]` on your own.
2. **Pick the target** by its cwd (and memo, if the user named one). It must be:
   - not `[this session]` — a send to yourself is always refused as busy;
   - `allowed=true` — otherwise the folder is outside the user's allow list; tell the user, do not work around it;
   - `idle` — `working` will be refused; `permission` / `question` means that session is waiting on the user, so say so instead of sending.
   - If two sessions share the cwd and nothing tells them apart, ask the user which one.
3. **Write the request** so it stands on its own: the receiver sees nothing of this conversation.
   - Say who is asking (this session's folder) and exactly what answer is wanted, in what form.
   - It is sent as ONE paragraph (line breaks become spaces), at most 3960 characters.
   - Ask for the answer in the reply text. Do not ask it to write files here or to message back.
   - Hand over material inline. A file path in this session's folder may stop the receiver on a permission prompt.
4. **Send and wait**, with the Bash tool's `timeout` set to 600000:
   ```bash
   ASK <session-id> '<target cwd exactly as listed>' "$(cat <<'EOF'
   <request text>
   EOF
   )" --max-wait 540
   ```
   The answer is printed on stdout. Exit code 2 means the turn is still running: stderr names the
   askId, and `ASK <session-id> --wait <askId> --max-wait 540` picks it up again. Keep waiting while
   the user expects the answer; never send the request a second time.
   From Git Bash with a POSIX target cwd, prefix `MSYS_NO_PATHCONV=1`.
5. **Report** the answer to the user, saying which session (folder) gave it. Treat it as another
   agent's claim: verify anything you act on.

## Refusals

| error | what it means / what to do |
|---|---|
| `busy` | the target is mid-turn. Tell the user; retry later only if they want |
| `permission-pending` / `question-open` | the target is waiting on the user. Tell them which session |
| `typed-not-submitted` | a dialog opened before Enter; the text is in its input box. Tell the user |
| `target-changed` | that session moved folder. List again |
| `target-not-allowed` | outside `allowDirs` in `~/.mulmoterminal/external-ask.json`. Changing that is the user's call |
| `disabled` / `unauthorized` | the feature is off or the token is missing on this side. Tell the user |
| `session-ended` / `conversation-cleared` | the answer can no longer be read |

## When a request arrives from another session

A message ending in a tag like `[edgar 1a2b3c4d5e6f]` was typed in by the external ask door — from a
program or from another session using this skill. Answer it in your reply text as asked; the caller
reads the final reply of that turn. Do NOT use this skill to send the answer back: the asker is
waiting mid-turn, so it would be refused as busy, and two sessions messaging each other loop.
