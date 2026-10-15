---
title: cmux と何が違うのか
nav_title: cmux との違い
layout: default
parent: 疑問に答える
nav_order: 12
description: cmux は macOS 専用の端末アプリで、縦タブと通知を持ちます。MulmoTerminal はブラウザなので OS を選びません。Mac だけで完結するなら cmux、Windows や Linux や スマホから触るならブラウザのほうが向きます。
---

# cmux と何が違うのか
{: .no_toc }

**cmux は macOS のアプリ、MulmoTerminal はブラウザ**です。そこから差が出ます。

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## cmux が向く場面

Ghostty を土台にした macOS 専用の端末で、縦タブとエージェント向けの通知を持ちます。

- Mac だけで使う
- ネイティブのアプリの速さと操作感が欲しい
- 端末アプリそのものを置き換えたい

**Mac で完結するなら、ネイティブのほうが素直です。**

## MulmoTerminal が向く場面

ブラウザなので、OS を選びません。

- Windows や Linux でも使う
- スマホや別のマシンから見たい
- サーバーを別のマシンに置いて、手元からは見るだけにしたい

インストールが要らないのも、ブラウザ側の性質です。`npx` で起動します。

## worktree の扱い

MulmoTerminal は枠ごとに git の worktree を切ります。同じリポジトリを同時に触っても、
ファイルを取り合いません。

## どちらも入れなくてよい場合

2つか3つなら、tmux だけで足ります。

## 関連

- [他の選択肢との比較](../guide/ja/alternatives.html)
- [スマホから使う](../guide/ja/phone.html)
