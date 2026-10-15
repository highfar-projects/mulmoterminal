---
title: Claude Squad と何が違うのか
nav_title: Claude Squad との違い
layout: default
parent: 日本語の答え
grand_parent: 疑問に答える
nav_order: 11
description: Claude Squad は端末の中で完結する TUI で、tmux と git worktree を束ねます。MulmoTerminal はブラウザに出します。端末から出たくないなら Claude Squad、スマホや別の端末から見たいならブラウザのほうが向きます。
---

# Claude Squad と何が違うのか
{: .no_toc }

**どちらも tmux と git worktree を束ねます。** 違うのは、出す先です。

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Claude Squad が向く場面

端末の中で完結します。Go で書かれた TUI で、ブラウザを開く必要がありません。

- 端末から出たくない
- ssh の先で完結させたい
- 画面を1枚しか使いたくない

**この3つのどれかが当てはまるなら、Claude Squad のほうが素直です。**

## MulmoTerminal が向く場面

ブラウザに出すので、端末の外に出られます。

- スマホや別のマシンから見たい
- 枠ごとにファイルや図や PDF を開きたい
- 端末の表示では狭い

ブラウザを閉じても裏の tmux は動き続けるので、あとから開き直せます。

## 状態の見え方

Claude Squad も MulmoTerminal も、セッションの状態を出します。

MulmoTerminal は、**終わったことと人を待っていることを分けて**出します。Claude Code は
`Notification` フックから、Codex は `PermissionRequest` フックから取っています。
この区別が要るかどうかは、放っておく時間の長さで変わります。

## どちらも入れなくてよい場合

2つか3つなら、tmux だけで足ります。[tmux との違い](tmux-difference.html)に書きました。

## 関連

- [他の選択肢との比較](../../guide/ja/alternatives.html)（Vibe Kanban・Nimbalyst・Conductor も）
- [どのセッションが自分待ちか知るには](which-is-waiting.html)

---

*English version: [claude squad difference](../en/claude-squad-difference.html)*
