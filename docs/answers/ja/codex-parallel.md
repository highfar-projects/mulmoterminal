---
title: Codex を並列で動かすには
nav_title: Codex を並列で
layout: default
parent: 日本語の答え
grand_parent: 疑問に答える
nav_order: 2
description: Codex CLI を複数同時に動かすと、承認待ちで止まります。Claude Code と違って承認を飛ばす起動方法が無いためです。止まるのを避けるのではなく、止まったことに気づく方法を用意するのが筋です。
---

# Codex を並列で動かすには
{: .no_toc }

並べること自体は、Claude Code と同じやり方でできます。**ただし必ずどこかで止まります。**

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 止まる理由

Codex は、コマンドを実行する前に「これを実行してよいか」と聞いてきます。

Claude Code には `--permission-mode` という、聞かずに進める起動方法があります。grok には
`--permission-mode auto`、muse には `--yolo` が同じ役割です。

**Codex には、これにあたるものがありません。** MCP サーバーごとに自動承認する設定はありますが、
全体を飛ばす方法は用意されていません。並列で放っておく限り、誰かが待っています。

## 止まったことに気づく

Codex 0.156 からフックが入りました。`PermissionRequest` は、承認ダイアログを出したときに動きます。
実測では、ダイアログが出たときだけ動き、ほかのツール呼び出しでは動きませんでした。

自分で組むなら、起動時に渡します。

```bash
codex -c 'hooks.PermissionRequest=[{hooks=[{type="command",command="curl -s -X POST http://127.0.0.1:8080/waiting || true"}]}]'
```

気をつける点が3つあります。

1. **Codex が一度だけ確認してきます。**「Hooks need review」が出て、承認しないと動きません。
   コマンドの中身が変わるたびにまた聞かれるので、セッションごとの値は環境変数で渡します
2. **`|| true` を付けます。** Codex はフックの終了状態を見るので、サーバーが落ちていても失敗にしません
3. **終わったことは別で取ります。** 作業の区切りは rollout という記録ファイルに追記されるので、
   そちらを読みます。フックと違って信頼の確認が要りません

## MulmoTerminal の場合

この仕組みが最初から入っています。

```bash
npx mulmoterminal@latest
```

枠で Codex を選ぶと、承認待ちのときに色が変わって、終わったときとは違う音が鳴ります。

Windows ではフックを登録しません。コマンドがシェルの展開に依存していて、Windows での挙動を
測っていないためです。最初の指示を渡して起動する場合も登録しません。確認ダイアログが出ている
ところに指示が打ち込まれると、Enter が「Hooks を確認する」を選んで指示が消えるためです。

## 関連

- [Codex と Claude Code を一緒に動かすには](codex-and-claude-code.html)
- [どのセッションが自分待ちか知るには](which-is-waiting.html)
- [どの coding agent を使うか](../../guide/ja/agents.html)

---

*English version: [codex parallel](../en/codex-parallel.html)*
