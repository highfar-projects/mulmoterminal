---
title: どのセッションが自分待ちか知るには
nav_title: どれが自分待ちか
layout: default
parent: 疑問に答える
nav_order: 3
description: 複数のエージェントを並べると、終わったものと人を待っているものの区別がつかなくなります。終わったことを知らせる CLI は多いのですが、止まっていることまで知らせるものは、7つ中2つしかありません。
---

# どのセッションが自分待ちか知るには
{: .no_toc }

**CLI が自分から知らせてくれるかどうかで決まります。** ターミナルの文字を外から読む方法もありますが、
表示が変わるたびに壊れます。

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 言えるものと言えないもの

MulmoTerminal は7つの CLI を同じやり方で扱っているので、差が並べられます。

| CLI | 終わったと言えるか | 待っていると言えるか |
|---|---|---|
| Claude Code | 言える | 言える |
| Codex | 言える | 言える |
| GitHub Copilot | 言える | 言えない |
| Cursor | 言える | 言えない |
| Antigravity | 配線されていない | 配線されていない |
| Grok | 配線されていない | 配線されていない |
| Muse | 配線されていない | 配線されていない |

終わったことを知らせられるのは4つ、待っていることまで知らせられるのは2つです。

## 似ているが使えないもの

GitHub Copilot の `permissionRequest` と Cursor の `beforeShellExecution` は、名前からは
承認を求めたときに動くように見えます。

実測では、どちらも**ツールを呼ぶたびに**動きました。承認したかどうかに関係なく動くので、
そのまま合図に使うと全部のツール呼び出しが「待っている」と表示されます。
**何も表示しないより悪い状態です。** 常に光っていれば、人はその表示を見なくなります。

## 言える2つの仕組み

Claude Code は `Notification` フックで、入力が必要になったときに動きます。

Codex は2か所から取ります。作業の区切りは rollout という記録ファイルの追記から、
承認待ちは `PermissionRequest` フックからです。**片方を断られても、もう片方は生き残ります。**

## 自分で組む場合

Claude Code なら設定ファイルに、Codex なら起動時にフックを書きます。受け取る側で、
どのセッションから来たかを記録して音を鳴らします。

数が増えると、音だけでは足りなくなります。**9つ並んでいると、鳴ったのがどれかを音では
区別できません。** セッションと画面を結びつける必要が出てきます。

```bash
npx mulmoterminal@latest
```

MulmoTerminal は枠の色で出します。枠ごとに git の worktree が切られるので、
同時に走らせてもファイルを取り合いません。

## 関連

- [エージェントが呼んだらスマホに通知する](../guide/ja/notifications.html)
- [Codex を並列で動かすには](codex-parallel.html)
- [どの coding agent を使うか](../guide/ja/agents.html)
