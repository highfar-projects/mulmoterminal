---
title: Claude Code を複数同時に動かすには
nav_title: Claude Code を複数同時に
layout: default
parent: 疑問に答える
nav_order: 1
description: Claude Code を複数同時に動かす方法は3つあります。ターミナルを分ける、tmux で分ける、ブラウザのグリッドに並べる。それぞれ何が楽になって何が面倒になるかを、作っている側から書きます。
---

# Claude Code を複数同時に動かすには
{: .no_toc }

やり方は3つです。**どれも Claude Code 側の設定は要りません。**

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## ターミナルの窓を分ける

いちばん手軽です。窓を2枚開いて、それぞれで `claude` を打ちます。

困るのは、作業が同じファイルに当たったときです。2つが同じ場所を書き換えると、片方の変更が消えます。
**ディレクトリを分けるか、git の worktree を切る**必要が出てきます。

```bash
git worktree add ../work-auth -b fix-auth
cd ../work-auth && claude
```

## tmux で分ける

窓が増えて管理できなくなったら、tmux でペインに分けます。閉じても消えないので、
ssh で繋ぎ直しても作業が続きます。

```bash
tmux new-session -d -s auth -c ../work-auth 'claude'
tmux attach -t auth
```

数が増えると、画面が狭くなります。9つ並べると1つあたりの文字が読めません。
**どれが人を待っているかは、覗いて回るまで分かりません。**

詳しくは [tmux との違い](tmux-difference.html)に書きました。

## ブラウザのグリッドに並べる

MulmoTerminal は、tmux を裏で使いながら、ブラウザに格子を出します。

```bash
npx mulmoterminal@latest
```

枠ごとに git の worktree が切られるので、1の問題が起きません。枠の色で、動いているか、
人を待っているか、終わったかが分かります。待ちになったときには終わったときと違う音が鳴ります。

## どれを選ぶか

| 同時に動かす数 | 向くもの |
|---|---|
| 2つまで | ターミナルの窓を分ける |
| 3〜4つ | tmux |
| 5つ以上 | 状態が見えるもの |

**2つなら、何も入れないのがいちばん速いです。** 増えてきて「どれが止まっているか分からない」が
困りごとになってから、次を考えれば足ります。

## 関連

- [git worktree で作業を隔離する](../guide/ja/worktree.html)
- [どのセッションが自分待ちか知るには](which-is-waiting.html)
- [他の選択肢との比較](../guide/ja/alternatives.html)
