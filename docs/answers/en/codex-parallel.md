---
title: How to run Codex sessions in parallel
nav_title: Running Codex in parallel
layout: default
parent: Answers
nav_order: 2
description: Running several Codex CLI sessions at once means one of them is always stopped at an approval prompt — Codex has no flag for skipping approvals the way Claude Code does. The fix is not avoiding the stop; it is being told about it.
---

# How to run Codex sessions in parallel
{: .no_toc }

Running them side by side works the same way it does for Claude Code. **One of them will always
be stopped.**

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Why it stops

Codex asks before it runs a command.

Claude Code takes `--permission-mode`, which skips the asking. Grok has `--permission-mode auto`
and muse has `--yolo`.

**Codex is passed none of these.** There is per-MCP-server auto-approval, but nothing that waives
approval as a whole. Run several in parallel and somebody is always waiting on you.

## Being told that it stopped

Codex 0.156 added hooks. `PermissionRequest` fires when the approval dialog is shown, and was measured
firing then and on no other tool call.

Wiring it yourself is one flag at launch:

```bash
codex -c 'hooks.PermissionRequest=[{hooks=[{type="command",command="curl -s -X POST http://127.0.0.1:8080/waiting || true"}]}]'
```

Three things to get right:

1. **Codex asks you to trust the hook once.** A "Hooks need review" dialog appears, and nothing
   fires until you accept. It asks again whenever the command's text changes, so keep anything
   per-session in an environment variable and the command itself constant
2. **End with `|| true`.** Codex reads the hook's exit status, so a server that is down must not
   read as a refusal
3. **Read "finished" from somewhere else.** Turn boundaries are appended to the rollout file, and
   reading that needs no trust prompt

## With MulmoTerminal

Both halves are wired already.

```bash
npx mulmoterminal@latest
```

Pick Codex in a cell and the cell changes colour when it is waiting, with a different sound from
the one for finished.

The hook is not registered on Windows — the command leans on shell expansion that has not been
measured there. It is also skipped when a seed prompt is passed, because the prompt would be typed into the
trust dialog and lost.

## Related

- [Running Codex and Claude Code together](codex-and-claude-code.html)
- [Knowing which session is waiting for you](which-is-waiting.html)
- [Which coding agent to use](../guide/en/agents.html)

---

*日本語版: [codex-parallel](../ja/codex-parallel.html)*
