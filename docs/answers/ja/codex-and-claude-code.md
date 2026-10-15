---
title: Codex と Claude Code を一緒に動かすには
nav_title: Codex と Claude Code を一緒に
layout: default
parent: 疑問に答える
nav_order: 20
description: 同じ画面に Codex と Claude Code を並べると、作法の違いが順番に出てきます。セッションの番号を誰が決めるか、承認を飛ばせるか、何を記録に残すか。同じ仕事を両方に投げて比べる使い方もできます。
---

# Codex と Claude Code を一緒に動かすには
{: .no_toc }

**並べること自体は、枠ごとにどちらかを選ぶだけです。** 差が出るのは、そのあとです。

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 作法が違うところ

| | Claude Code | Codex |
|---|---|---|
| セッションの番号 | こちらが決めて渡す | 向こうが決める |
| 続きから始める | `--resume <id>` | `resume <id>` |
| 承認を飛ばす | `--permission-mode` | 無い |
| ツールの履歴 | 残る | 区切りだけ |
| 金額 | 出る | 出ない |

**承認のところがいちばん効きます。** Codex は並列で放っておくと必ず止まるので、
[止まったことに気づく仕組み](codex-parallel.html)が要ります。

## 使い分け

Claude Code は様子が細かく見えます。長い作業を任せて、あとから何をしたか追いたいときに向きます。
承認を飛ばせるので、放っておく用途にも向きます。

Codex は止まって聞いてきます。並列には不便ですが、**勝手に進んでほしくない作業では安心できます。**
本番の設定を触るときなどです。

## 同じ仕事を両方に投げる

並べてあると、これが手軽になります。枠を2つ作って、同じ指示を打って、出てきたものを比べます。

**片方が詰まったときの逃げ道**にもなります。同じリポジトリでも worktree が分かれているので、
両方が同じファイルを触っても壊れません。

## 契約の使い分け

Claude Code の契約を複数持っている場合は、枠ごとに別の契約を割り当てられます。
[複数の契約を使い分ける](../guide/ja/token-rotation.html)に書きました。

## 関連

- [どの coding agent を使うか](../guide/ja/agents.html)
- [Codex を並列で動かすには](codex-parallel.html)
