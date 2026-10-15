---
title: Using several Codex subscriptions
nav_title: Several Codex subscriptions
layout: default
parent: Answers in English
grand_parent: Answers
nav_order: 23
description: Codex subscriptions sit side by side by giving each its own CODEX_HOME directory and registering it as an account. Unlike Claude, there is no automatic selection — which cell uses which subscription is yours to decide.
---

# Using several Codex subscriptions
{: .no_toc }

**You pick per cell.** There is no automatic rotation for Codex the way there is for Claude.

<details open markdown="block">
  <summary>Table of contents</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## How it works

Codex keeps its settings and its login under `CODEX_HOME`. **Give each subscription its own
directory and they stand side by side.**

Register the directory as an account:

```json
{ "id": "personal", "label": "Personal", "agent": "codex", "home": "~/.codex-personal" }
```

Or add it from **Settings → Models and backends**, under additional subscriptions: a name, Codex,
and the directory.

## Do not point at `~/.codex` itself

That is the ordinary login's directory. Point an account at it and its cells simply run on the
ordinary login, with no separate usage gauge.

**Make a new directory and name that one.**

## Using it

1. Pick Codex in an empty cell
2. Look under the model for the **ACCOUNT** selector
3. Choose "Default login" or one of the registered subscriptions

Two of six cells on the work subscription and the rest on the personal one is a normal shape.

## The first login

A fresh directory **starts empty**.

Your settings, your registered MCP servers and your per-project trust answers all belong to the
ordinary login and are not carried over. The first session in that account asks again.

## The usage gauge

Codex accounts need **no extra setup step** for this. After the first session runs there, the
numbers are read from that account's own session records.

An account that has never run a session shows nothing in the tool bar. One run fixes that.

## How this compares with Claude

| | Claude | Codex |
|---|---|---|
| Pick a subscription per cell | yes | yes |
| Pick the one with most headroom automatically | yes | **no** |
| Move a session nearing its limit | yes | **no** |
| Setup for the usage gauge | a step is needed | none |

**Automatic selection is Claude-only.** The remainder-over-time rule described in
[rotating between subscriptions](../../guide/en/token-rotation.html) does not cover Codex.

## Related

- [Running several subscriptions side by side](../../guide/en/accounts.html)
- [Using several Claude subscriptions](multiple-accounts.html)
- [Running Codex sessions in parallel](codex-parallel.html)

---

*日本語版: [codex-multiple-accounts](../ja/codex-multiple-accounts.html)*
