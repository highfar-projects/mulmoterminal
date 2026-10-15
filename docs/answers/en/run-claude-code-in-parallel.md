---
title: How to run several Claude Code sessions at once
nav_title: Running Claude Code in parallel
layout: default
parent: Answers in English
grand_parent: Answers
nav_order: 1
description: Three ways to run several Claude Code sessions side by side — separate terminal windows, tmux panes, or a browser grid. What each one buys you, what it costs, and the point where the simplest option stops being enough.
---

# How to run several Claude Code sessions at once
{: .no_toc }

Three ways. **None of them needs anything configured on the Claude Code side.**

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Separate terminal windows

The cheapest option. Open two windows and run `claude` in each.

What bites is when both sessions touch the same file. One overwrites the other's change and
nobody is told. **Give each session its own directory, or its own git worktree.**

```bash
git worktree add ../work-auth -b fix-auth
cd ../work-auth && claude
```

## tmux panes

Once windows stop being manageable, split with tmux. The sessions survive a closed terminal,
so reconnecting over ssh picks up where you left off.

```bash
tmux new-session -d -s auth -c ../work-auth 'claude'
tmux attach -t auth
```

Past a handful of panes the screen runs out. Nine panes leaves text too small to read, and
**you still have to visit a pane to learn whether it is waiting for you.**

More on that in [what tmux does not solve](tmux-difference.html).

## A browser grid

MulmoTerminal keeps tmux underneath and puts the sessions in a browser grid.

```bash
npx mulmoterminal@latest
```

Each cell gets its own git worktree, so the first problem does not arise. The cell's colour says
whether the agent is working, waiting for you, or done, and the sound for waiting differs from
the sound for finished.

## Which to pick

| Sessions at once | What fits |
|---|---|
| up to 2 | separate windows |
| 3–4 | tmux |
| 5+ | something that shows state |

**At two sessions, installing nothing is the fastest answer.** Move on when "which one is stuck?"
becomes the thing costing you time.

## Related

- [Isolating work with git worktrees](../../guide/en/worktree.html)
- [Knowing which session is waiting for you](which-is-waiting.html)
- [Open-source alternatives](../../guide/en/alternatives.html)

---

*日本語版: [claude-code-parallel](../ja/claude-code-parallel.html)*
