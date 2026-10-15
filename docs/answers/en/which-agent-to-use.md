---
title: Which of the seven coding agents to run
nav_title: Which agent to use
layout: default
parent: Answers
nav_order: 21
description: Claude Code, Codex, Antigravity, Grok, Muse, GitHub Copilot and Cursor hosted through one mechanism, so their differences line up — whether they report state, whether approvals can be waived, and whether they read .claude/skills as-is.
---

# Which of the seven coding agents to run
{: .no_toc }

For parallel work, three things decide it: whether the agent reports its state, whether approvals
can be waived, and whether it reads `.claude/skills` as it stands.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Side by side

| | Reports state | Waives approvals | `.claude/skills` |
|---|---|---|---|
| Claude Code | finished + waiting | `--permission-mode` | read as-is |
| Codex | finished + waiting | none | mirrored first |
| Antigravity | not wired | `--dangerously-skip-permissions` | a different file |
| Grok | not wired | `--permission-mode auto` | read as-is |
| Muse | not wired | `--yolo` | read as-is |
| GitHub Copilot | finished only | — | — |
| Cursor | finished only | — | — |

## Reading the table

**Leaving sessions unattended for long?** Take one that reports state. The others have to be
visited to learn whether they are done.

**Want it to keep moving?** Take one whose approvals can be waived. Codex is the one that cannot.

**Have `.claude/skills` worth carrying?** Grok and Muse read that directory themselves. Codex
mirrors it; Antigravity wants a file of its own per directory.

## You do not have to choose one

Each cell picks its own. Long unattended work on Claude Code, careful work on Codex, in the same
grid.

## Related

- [Knowing which session is waiting for you](which-is-waiting.html)
- [Which coding agent to use](../guide/en/agents.html)
- [The capability matrix](https://github.com/receptron/mulmoterminal/blob/main/docs/agent-capability-matrix.md)

---

*日本語版: [which-agent-to-use](../ja/which-agent-to-use.html)*
