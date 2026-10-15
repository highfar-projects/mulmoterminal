---
title: 7つのうちどの coding agent を選べばいいのか
nav_title: どのエージェントを選ぶか
layout: default
parent: 疑問に答える
nav_order: 21
description: Claude Code・Codex・Antigravity・Grok・Muse・GitHub Copilot・Cursor を同じ枠組みで動かすと、できることの差が並びます。状態を知らせるか、承認を飛ばせるか、skills をそのまま読むか。選ぶときに効く順に並べました。
---

# 7つのうちどの coding agent を選べばいいのか
{: .no_toc }

並列で使うなら、効く順は3つあります。状態を知らせるかどうか、承認を飛ばせるかどうか、`.claude/skills` をそのまま読むかどうかです。

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 並べた表

| | 状態を知らせる | 承認を飛ばす | `.claude/skills` |
|---|---|---|---|
| Claude Code | 終わった・待っている | `--permission-mode` | そのまま読む |
| Codex | 終わった・待っている | 無い | 写してから読む |
| Antigravity | 配線されていない | `--dangerously-skip-permissions` | 別のファイル |
| Grok | 配線されていない | `--permission-mode auto` | そのまま読む |
| Muse | 配線されていない | `--yolo` | そのまま読む |
| GitHub Copilot | 終わったのみ | — | — |
| Cursor | 終わったのみ | — | — |

## 選び方

**放っておく時間が長いなら、状態を知らせるものを選びます。** 知らせないものは、
終わったかどうかを見に行くことになります。

**止まってほしくないなら、承認を飛ばせるものを選びます。** Codex だけが飛ばせません。

**Claude Code 用に skills を書き溜めているなら**、Grok と Muse はそのまま読みます。
Codex は写され、Antigravity は別のファイルが要ります。

## 組み合わせる

1つに絞る必要はありません。**枠ごとに別のものを選べます。**

長い作業は Claude Code、慎重に進めたいものは Codex、といった分け方ができます。

## 関連

- [どのセッションが自分待ちか知るには](which-is-waiting.html)
- [どの coding agent を使うか（詳細）](../guide/ja/agents.html)
- [対応表の原文](https://github.com/receptron/mulmoterminal/blob/main/docs/agent-capability-matrix.md)

---

*English version: [which agent to use](../en/which-agent-to-use.html)*
