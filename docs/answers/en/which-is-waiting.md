---
title: How to tell which agent session is waiting for you
nav_title: Which session is waiting
layout: default
parent: Answers
nav_order: 3
description: Plenty of coding-agent CLIs can tell you a turn finished. Far fewer can tell you they are blocked on your input — two of the seven hosted here. Two more emit something that looks like it and fires on every tool call.
---

# How to tell which agent session is waiting for you
{: .no_toc }

**It depends on whether the CLI says so itself.** Scraping the terminal works until the output
changes shape, which it does.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Which CLIs can say it

MulmoTerminal hosts seven agents through one mechanism, so the differences line up.

| CLI | Says "finished" | Says "waiting on you" |
|---|---|---|
| Claude Code | yes | yes |
| Codex | yes | yes |
| GitHub Copilot | yes | no |
| Cursor | yes | no |
| Antigravity | not wired | not wired |
| Grok | not wired | not wired |
| Muse | not wired | not wired |

Four can announce a finished turn. Two can announce being blocked.

## The ones that look like it and are not

GitHub Copilot's `permissionRequest` and Cursor's `beforeShellExecution` read like
blocked-on-input signals.

Measured, both fire on **every** tool call, whether or not anyone was asked. Mapped straight to a
waiting indicator, every tool call would light up as needing you — **worse than showing nothing**,
because an indicator that is always on is one people stop looking at.

## How the two that can do it work

Claude Code has a `Notification` hook that fires when input is needed.

Codex takes it from two places: turn boundaries from the rollout file it appends to, and blocked
from the `PermissionRequest` hook. **Declining the hook costs only the blocked signal**, never the
working one.

## Wiring it yourself

Put a hook in Claude Code's settings and pass one to Codex at launch. On the receiving side,
record which session called and make a sound.

Sound alone stops scaling. **With nine sessions running, a chime does not say which one rang.**
Something has to tie the session to a place on screen.

```bash
npx mulmoterminal@latest
```

MulmoTerminal uses the cell's colour, and gives each cell its own git worktree so parallel work
does not collide.

## Related

- [Push notifications to your phone](../guide/en/notifications.html)
- [Running Codex sessions in parallel](codex-parallel.html)
- [Which coding agent to use](../guide/en/agents.html)

---

*日本語版: [which-is-waiting](../ja/which-is-waiting.html)*
