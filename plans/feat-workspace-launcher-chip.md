# feat: ランチャーに workspace のチップを常に出し、区別して表示する

## きっかけ

「workspace は特別な場所なのだから、チップの見せ方を変えて、ランチャー UI に既定で出すべき」
（オーナー判断 2026-08-03）。

#1355 / #1358 で確定した通り、workspace は**全 GUI ツールに届く唯一のディレクトリ**
（サーバー側 `carriesFullGuiMcp`）。にもかかわらず UI 上は「最近使ったディレクトリ」の 1 つでしか
なかった。

## 直前の状態

チップの一覧は `cwdPresets` そのもの。これは `recordPreset` が**起動したときに自動記録する**リストなので:

- workspace で一度も起動していなければ、チップは**存在しない**
- チップの × でユーザーが消せる（消したら二度と出ない）

つまり「最も重要なディレクトリが、クリックできないかもしれない」状態だった。

## 変更

**`launchChips(orderedPresets, defaultCwd)` を `src/components/presets.ts` に追加。** 純関数で、

- workspace を**常に先頭**に置く（`orderByDirPriority` の外側 — あれはユーザーが設定した
  ディレクトリ同士の順位であって、workspace はその競争に参加していない）
- すでに presets に含まれていれば**重複させず**、そのラベル（ユーザーが付けた名前）を維持する
- `isWorkspace` フラグを付けて返す
- `defaultCwd` が null（`/api/config` 未解決）のときは何も足さない — 誰も選んでいない
  ディレクトリにクリック先を作らないため

パス比較は `common/dirPathKey.ts` の **`isSameDirPath`** を使う。同ファイルが worktree 行で使って
いるのと同じ字句比較で、末尾スラッシュや `..` を畳む。ブラウザは symlink を解決できないので
ここは「同じ綴りか」までしか答えない — 本当の判定はサーバーの realpath（`isWorkspaceCwd`）。
外した場合の被害は「同じディレクトリが 2 回出る」だけ。

**表示（`CellLaunchForm.vue`）:**

- ラベルの前に Material Symbols の `workspaces` アイコン。**ラベル自体は変えない**
- **× ボタンを出さない** — 合成されたエントリなので消すものが無く、消しても次の描画で戻る
- hover / aria-label に「the workspace: every GUI tool is available here」を足す。アイコンだけでは
  *なぜ*特別なのかが言えず、他にそれを言う場所が画面上に無いため
- **枠と背景は触らない。** あの 2 つは既に「ここでセッションが走っている」という意味を持っており
  （#1106 でまさにその二重化がバグとして報告された）、同じ 2 つに別の意味を重ねない
- 色ストライプは通常どおり — workspace にも `.mulmoterminal.json` はある

## 実装上の落とし穴

`presetPaths`（`useDirColors` に渡す）が `chips` を参照するので、**`chips` を先に宣言しないと
マウント時に TDZ で throw する**。`useDirColors` は watch で即座に評価するため、computed の遅延評価
では守られない。

## 既存テストへの影響

チップを**位置で選んでいた**テストが 5 本落ちた。workspace が先頭に入ったため。これは仕様変更が
正しく現れたもので、いずれもパス指定で選ぶよう直した（`chipForPath` / `launchButtonFor` ヘルパー）。
1 本は「`my-project` は "proj" を含む」ため、ラベルの部分一致ではなくパスの前方一致にしている。

Material Symbols は**アイコン名がそのままリガチャのテキスト**なので、`text()` は
`"workspacesws"` を返す。テスト側はアイコン要素を引いて差し引く。

## 検証

`yarn typecheck` / `format` / `lint`（0 errors）/ `yarn test` 7733 passed、`yarn build` 成功。
**実ブラウザでの確認は未実施**（この環境に Playwright が無いため）。
