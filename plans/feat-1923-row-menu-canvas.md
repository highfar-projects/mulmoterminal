# feat(#1923): ツリーの行を右クリックして Canvas で開く

## 何を足すか

Files ペインの行メニュー（#1859 / #1912）に **Canvas で開く** を 1 項目足す。判定と emit は既にあるものをそのまま使い、**サーバ側の変更はゼロ**。

## なぜこの形か

`filesRowActions()` は最初からこれを想定して書かれている:

> A LIST rather than two booleans so a later action (a text file's contents, say) is an entry here and nothing else.

判定も 2 つ目を作らない。ヘッダーの Canvas ボタンが使っている `canOpenInCanvas(絶対パス, workspace)` を**そのまま**呼ぶ。ここで独自の拡張子判定を書くと、`canvasOpenFile.ts` の冒頭が警告しているとおり「開けると言ったのに何も描かれない」を作れてしまう:

> Which files qualify is decided by each PLUGIN rather than by an extension test here. A second opinion in this file could only be a weaker one that reports success for a file that never renders.

## 決定

### D1: アクションの型は `id` で判別する union にする

いまの `FilesRowAction` は `text: string` が必須で、その意味は「ターミナルに送る文字列」に固定されている（コメントで明記）。Canvas の項目は送る文字列を持たず、**行の相対パス**を持つ。`text` を `string | undefined` に緩めると、呼び出し側が「空文字を送る」経路を作れてしまうので、`id` を判別子にした union にする。

```ts
export type FilesRowAction =
  | { id: "insert-relative" | "insert-absolute"; label: string; icon: string; text: string }
  | { id: "open-canvas"; label: string; icon: string; pathRel: string };
```

### D2: 相対パスを載せる（絶対パスではない）

`open-in-canvas` の既存 emit（ヘッダーの Canvas ボタン）は `openPath`＝**ツリー root からの相対**を渡し、受け側の `TerminalGrid.openFileInCanvas` が `absoluteUnder(paneCwd, path)` で絶対にしている。メニューだけ絶対を渡すと受け側で二重解決になるので、**同じ相対**を載せる。判定に要る絶対パスは `filesRowActions` の中だけで作る。

### D3: ゲートは insert と独立させる

`canvasTarget`（Canvas を置く相手のセルがあるか）と `insertTarget`（挿入先のターミナルがあるか）は FilesPane で**別の prop** になっている（ペインがセルを trailing しているときに割れるため）。なので Canvas の項目は `terminal` ではなく `canvas` の可否で決める。全画面の Files ビューはどちらも false なので、メニューが出ないという現在の挙動は変わらない。

### D4: 位置は挿入 2 項目の**前**

行を右クリックする動機として「見せる」は「パスを打ち込む」より強い（#1374 がそのために作られている）。先頭にあるとキーボードで開いたとき最初にフォーカスが載るのも同じ理由で望ましい。

### D5: アイコンは `space_dashboard`

挿入 2 つは `attach_file` を共用している（「同じ仕事を木から呼んでいるので、区別はラベルの仕事」）。Canvas は別の仕事なので別アイコンにする。

## 触るファイル

| ファイル | 変更 |
|---|---|
| `src/components/filesRowActions.ts` | 型を union に、`canvas` 可否と `workspace` を受け取り、`open-canvas` を先頭に積む |
| `src/components/FilesPane.vue` | `filesRowActions` に `canvas` を渡す、`runRowAction` を分岐 |
| `test/src/components/filesRowActions.spec.ts` | 出る/出ない条件（md / html / workspace の story / リポジトリ内の story / 対象外 / canvas 相手なし） |
| `test/src/components/filesRowMenu.spec.ts` | クリックで `open-in-canvas` が相対パスで飛ぶこと |

## 出ないケース（意図的）

リポジトリ内に置いた mulmoScript は開けない。プラグインが絶対パスを拒否し、stories の根が起動時に 1 個へ固定されているため（receptron/mulmoclaude#3014）。#3014 が入れば `storyWirePath` の拡張だけで、このメニューは何も変えずに mulmoScript が並ぶ。

## 検証（2026-08-30）

**ユニット。** `filesRowActions.spec.ts` に 6 件、`filesRowMenu.spec.ts` に 2 件追加。判定を落とす mutation
（`canOpenInCanvas` の分岐を無効化）で **5 件が赤**になることを確認済み。`yarn test` は 11802 passed / 50 skipped。

**実機。** `SERVER_SOCKET` を `mt-verify1923` に隔離し、scratch HOME + 別ポート（34723）で実サーバを起動、
system Chrome を Playwright で駆動して、シェルセル → 拡大 → ファイルペイン → `talk.md` を右クリック、まで実行。

| 見たこと | 結果 |
|---|---|
| メニューの項目 | `Open in the Canvas` / `Insert relative path` / `Insert absolute path` の 3 つ、この順 |
| クリック後 | **Canvas が開き、md が描画された**（`---` が区切り線として出る。PDF ボタンと Edit Markdown Source つき） |
| ディレクトリ行 | 項目は挿入 2 つのまま |
| console error | 無し |

**最初の測定は嘘をついた。** クライアントは `dist/` から配信されるので、`yarn build` 前の実行ではメニューに
項目が出ず「実装が効いていない」ように見えた。ビルド後に出た。ソースだけ直して実機を見るときの落とし穴。

**シェルセルでも Canvas は開く。** #1598 が指摘している「シェルセルは MCP グループを学習していないので
パネルが開かない」は、このクライアント側 seed 経路には当たらない（実測）。
