---
title: Running Codex and Claude Code side by side
nav_title: Codex and Claude Code together
layout: default
parent: Answers in English
grand_parent: Answers
nav_order: 20
description: Putting both in the same grid surfaces the differences one at a time — who owns the session id, whether approvals can be waived, what ends up in the record. Having both open also makes it cheap to send one task to each and compare.
---

# Running Codex and Claude Code side by side
{: .no_toc }

**Putting them side by side is just picking one per cell.** The differences arrive afterwards.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Where the conventions diverge

| | Claude Code | Codex |
|---|---|---|
| Session id | we mint it | it mints its own |
| Resuming | `--resume <id>` | `resume <id>` |
| Waiving approvals | `--permission-mode` | none |
| Tool-call history | kept | turn edges only |
| Dollar cost | shown | not shown |

**Approvals matter most.** Left running in parallel, Codex always stops somewhere, so
[being told that it stopped](codex-parallel.html) has to be arranged first.

## Picking between them

Claude Code shows more of itself. Good for long unattended work you will want to audit later, and
approvals can be waived so it keeps moving.

Codex stops and asks. Inconvenient in parallel, **reassuring on work you do not want running
ahead of you** — touching production configuration, for instance.

## Sending one task to both

Cheap once they are side by side. Open two cells, give the same instruction, compare what comes
back.

It is also the escape hatch when one gets stuck. Same repository is fine: the worktrees are
separate, so both touching the same file breaks nothing.

## Separate subscriptions

Claude Code subscriptions can be assigned per cell. See
[rotating between subscriptions](../../guide/en/token-rotation.html); the Codex equivalent is in
[using several Codex subscriptions](codex-multiple-accounts.html).

## Related

- [Which coding agent to use](../../guide/en/agents.html)
- [Running Codex sessions in parallel](codex-parallel.html)

---

*日本語版: [codex-and-claude-code](../ja/codex-and-claude-code.html)*
