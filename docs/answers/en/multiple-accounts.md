---
title: Using several Claude subscriptions without wasting them
nav_title: Several Claude subscriptions
layout: default
parent: Answers
nav_order: 22
description: Unused allowance on a Claude subscription disappears at the reset, and reset times do not line up across subscriptions. Switching by hand leaves some exhausted and others expiring half full. The number that decides which to use is the remainder divided by the time left.
---

# Using several Claude subscriptions without wasting them
{: .no_toc }

**The one to spend is not the one with the most left. It is the one that cannot spend what it has
before it resets.**

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## What is left does not carry over

A paid Claude plan has a window that resets every five hours and one that resets weekly.
**Whatever is unspent at the reset is gone.**

Hold several subscriptions and the reset times do not line up. One renews Wednesday morning,
another Saturday night.

## Switching by hand wastes it

On Tuesday evening, 40% left on a subscription that renews Wednesday has to be spent tonight or
lost. A subscription with 90% left that renews Saturday is in no hurry.

Nobody compares those two numbers before every session. **So the order ends up arbitrary, and
some subscription reaches its reset still half full.**

## The number that decides it

Not "how much is left" — **how much is left divided by how long until it resets**.

```
40% left ÷ 9 hours   →  high  (spend it tonight or lose it)
90% left ÷ 139 hours →  low   (no rush)
```

## With MulmoTerminal

Every new session picks the subscription where that number is highest, and a session nearing its
limit is moved to another one with the conversation intact.

```bash
npx mulmoterminal@latest
```

Setup is in [rotating between subscriptions](../guide/en/token-rotation.html); assigning one to a
specific cell is in [running several subscriptions side by side](../guide/en/accounts.html).

## For Codex

Automatic selection is Claude-only. Codex subscriptions can also sit side by side, but you pick
which cell uses which. See [using several Codex subscriptions](codex-multiple-accounts.html).

## Related

- [Rotating between subscriptions](../guide/en/token-rotation.html)
- [Running several subscriptions side by side](../guide/en/accounts.html)

---

*日本語版: [multiple-accounts](../ja/multiple-accounts.html)*
