---
title: What a browser grid adds over plain tmux
nav_title: Compared with tmux
layout: default
parent: Answers
nav_order: 10
description: tmux already solves panes, persistence and layout, and MulmoTerminal keeps using it underneath. What tmux does not solve is which pane is blocked on you, which pane maps to which worktree, and the screen running out past a handful of panes.
---

# What a browser grid adds over plain tmux
{: .no_toc }

**If tmux is enough, it is the faster answer.** Nothing to install, and the keys you already know.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## What tmux already solves

Splitting into panes. Surviving a closed terminal. Remembering a layout. Reattaching over ssh.

MulmoTerminal leans on tmux for every one of these. **None of it is reimplemented.**

## What it does not

The problems that show up once the panes hold agents sit outside what a multiplexer is for.

- **Which pane is blocked on you.** tmux does not interpret what is inside a pane
- **Which pane belongs to which worktree.** That mapping lives in your head
- **Screen space.** Nine panes leaves text too small to read
- **Notifications.** There is nothing for tmux to fire on; the signal has to come from the agent

## It is a question of count

| Panes | Is tmux enough |
|---|---|
| 2–3 | yes |
| 4–6 | telling them apart starts costing time |
| 7+ | the screen runs out |

**At two panes, installing nothing wins.**

## Where MulmoTerminal sits

Not a replacement — a screen on top. tmux runs underneath, the sessions outlive a closed browser,
and `tmux ls` still lists them.

```bash
npx mulmoterminal@latest
```

Each cell gets a worktree and a colour for its state. **What tmux is good at stays; only the
telling-apart is added.**

## Related

- [Isolating work with git worktrees](../guide/en/worktree.html)
- [Knowing which session is waiting for you](which-is-waiting.html)

---

*日本語版: [tmux-difference](../ja/tmux-difference.html)*
