---
title: Claude の契約を複数持っているとき、どう使い分けるか
nav_title: 複数の契約を使い分ける
layout: default
parent: 日本語の答え
grand_parent: 疑問に答える
nav_order: 22
description: Claude Code の週の枠は、使わずに残った分がリセットで消えます。契約ごとにリセットの時刻がずれているので、手で切り替えると余らせる契約と使い切る契約が出ます。残りとリセットまでの時間から自動で選ぶ方法を書きます。
---

# Claude の契約を複数持っているとき、どう使い分けるか
{: .no_toc }

**残りが多い契約ではなく、「リセットまでに使い切れない契約」から使うのが得です。**

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 残った分は消えます

Claude の有料プランには、5時間ごとにリセットされる枠と、1週間ごとにリセットされる枠があります。
どちらも、**使わずに残った分はリセットで消えます。**

契約を複数持っても、リセットの時刻はそろいません。水曜の朝に更新される契約と、
土曜の夜に更新される契約が混ざります。

## 手で切り替えると余ります

火曜の夜に、水曜更新の契約に40%残っていれば、それは今夜のうちに使わないと消えます。
土曜更新の契約は、急いで使う必要がありません。

手で切り替えていると、この比較を毎回はできません。**なんとなく決めた順番で使うことになり、
ある契約は枠を残したままリセットを迎えます。**

## 選び方の基準

「残りが多い」ではありません。**「残りを、リセットまでの時間で割った値」が大きいもの**です。

```
残り 40% ÷ あと 9時間   →  大きい（今夜使わないと消える）
残り 90% ÷ あと 139時間 →  小さい（急がなくてよい）
```

## MulmoTerminal の場合

セッションを始めるたびに、この値がいちばん大きい契約を選びます。上限が近づいたセッションは、
会話を保ったまま別の契約へ移します。

```bash
npx mulmoterminal@latest
```

設定の手順は[複数の契約を自動で使い分ける](../../guide/ja/token-rotation.html)に、
セルごとに契約を指定する方法は[契約を複数並べて使う](../../guide/ja/accounts.html)にあります。

## Codex の場合

自動の振り分けは Claude だけです。Codex も契約を複数並べられますが、
どのセルをどの契約で動かすかは自分で選びます。
[Codex の契約を複数使い分けるには](codex-multiple-accounts.html)に書きました。

## 関連

- [複数の Claude の契約を自動で使い分ける](../../guide/ja/token-rotation.html)
- [Claude Code / Codex の契約を複数並べて使う](../../guide/ja/accounts.html)
- [Codex の契約を複数使い分けるには](codex-multiple-accounts.html)

---

*English version: [multiple accounts](../en/multiple-accounts.html)*
