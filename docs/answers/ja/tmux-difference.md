---
title: tmux で並列にするのと何が違うのか
nav_title: tmux との違い
layout: default
parent: 日本語の答え
grand_parent: 疑問に答える
nav_order: 10
description: tmux はペイン・永続化・レイアウトを既に解決しています。解決していないのは、どのエージェントが人を待っているかの見分けと、worktree との結びつけです。差が出るのは数が増えてからです。
---

# tmux で並列にするのと何が違うのか
{: .no_toc }

**tmux で足りるなら、そのほうが速いです。** 入れるものが無く、慣れた操作がそのまま使えます。

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## tmux が既に解決していること

ペインに分けること。閉じても消えないこと。レイアウトを覚えること。ssh で繋ぎ直せること。

これらは MulmoTerminal も tmux に任せています。**作り直していません。**

## tmux が解決していないこと

エージェントを並べたときに出てくる困りごとは、tmux の守備範囲の外にあります。

- **どのペインが人を待っているか。** tmux はペインの中身を解釈しないので、止まっていることを知りません
- **どのペインがどの worktree か。** 手で対応を覚えることになります
- **画面の狭さ。** 9つ並べると1つあたりの文字が読めません
- **通知。** 鳴らす材料をどこから取るかは、tmux の話ではありません

## 数で変わります

| ペインの数 | tmux で足りるか |
|---|---|
| 2〜3 | 足ります |
| 4〜6 | 見分けが面倒になります |
| 7以上 | 画面が狭くなります |

**2つなら、何も入れないほうが速いです。**

## MulmoTerminal の立ち位置

tmux を置き換えるのではなく、tmux の上に画面を足したものです。裏では tmux が動いていて、
ブラウザを閉じてもセッションは残ります。`tmux ls` で見えます。

```bash
npx mulmoterminal@latest
```

枠ごとに worktree が切られ、枠の色で状態が出ます。**tmux の良いところは残したまま、
見分けだけを足した形**です。

## 関連

- [git worktree で作業を隔離する](../../guide/ja/worktree.html)
- [どのセッションが自分待ちか知るには](which-is-waiting.html)

---

*English version: [tmux difference](../en/tmux-difference.html)*
