---
title: MulmoTerminal compared with cmux
nav_title: Compared with cmux
layout: default
parent: Answers in English
grand_parent: Answers
nav_order: 12
description: cmux is a native macOS terminal with vertical tabs and agent notifications. MulmoTerminal runs in a browser and does not care about the OS. Staying on a Mac favours the native app; Windows, Linux or a phone favours the browser.
---

# MulmoTerminal compared with cmux
{: .no_toc }

**cmux is a macOS app; MulmoTerminal is a browser page.** Everything else follows from that.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Where cmux fits

A Ghostty-based macOS terminal with vertical tabs and notifications aimed at coding agents.

- you work on a Mac and only a Mac
- you want native speed and native feel
- you want to replace the terminal app itself

**If the work stays on a Mac, native is the more natural fit.**

## Where a browser fits

No OS to pick.

- working on Windows or Linux as well
- reading the sessions from a phone or another machine
- running the server on one machine and watching from another

Nothing to install either — `npx` starts it.

## Worktrees

MulmoTerminal gives each cell its own git worktree, so several cells can work the same repository
without fighting over files.

## When neither is needed

Two or three sessions run fine on tmux alone.

## Related

- [Open-source alternatives](../../guide/en/alternatives.html)
- [Using it from a phone](../../guide/en/phone.html)

---

*日本語版: [cmux-difference](../ja/cmux-difference.html)*
