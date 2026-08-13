# lint を CI 用とローカル用に分ける（#1644 の残り）

#1645 で `eslint . --cache --cache-strategy content` を入れて、CI の lint は 105s から 3〜11s に
なった。ここで扱うのは、そのあと残った 2 つ:

1. **CI が時々 110s に戻る**。#1645 では原因不明だった。
2. **ローカルの cold / 大量変更後が遅いまま**（55.8s / 17.3s）。`--concurrency` は
   #1645 の時点で「.vue が 91 個パースエラーになる」ので見送っていた。

計測はすべてこのリポジトリ、`eslint@10.8.1` / `typescript-eslint@8.67.0`、20 コアの mac。
CI 側の数値は該当 run のログから読んだ実測。

## 1. CI が 110s に戻る真因: ESLint のキャッシュキーに **Node のバージョン** が入っている

`node_modules/eslint/lib/cli-engine/lint-result-cache.js:56`:

```js
hash(`${pkg.version}_${nodeVersion}_${stringify(config)}`)
```

`nodeVersion` は `process.version`。つまり **Node のパッチが 1 つ上がるだけでキャッシュ全体が捨てられる**。
`setup-node` に渡しているのは `node-version: 22` なので、実際に入る版は runner 任せになる。

| run | ubuntu の Node | Lint | macOS の Node | Lint |
|---|---|---:|---|---:|
| 31699909874 | 22.23.1 | 10s | 22.23.1 | 8s |
| 31720870393 | **22.23.2** | 109s | 22.23.1 | 3s |
| 31732315098 | **22.23.1**（戻った） | 112s | 22.23.1 | 5s |

`actions/cache` のログ上は 3 回とも復元に成功していて（69KB、直前 run のキー）、それでも全ファイルを
lint し直していた。復元は成功、中身は全部無効、という状態。同じ run の macOS が速いままだったのは、
macOS 側の Node が動かなかったから。

`windows-daily.yaml` はさらに構造的で、matrix が `22.x / 24.x` の 2 本。キャッシュキーを OS だけで
切ると 2 つのジョブが 1 つのキーを奪い合い、**毎回必ず**この無効化が起きる。

対処: キャッシュキーに `setup-node` の出力 `node-version`（解決後のフルバージョン）を入れる。
バージョンごとに別のキャッシュを持つので、行き来しても各々のキャッシュが残る。
`eslint-cache-<os>-` だけの広いフォールバックは外す — 別バージョンのキャッシュは復元しても
1 件も使えないので、ダウンロードするだけ無駄になる。

## 2. `--concurrency` は使える。`.vue` のパースエラーは設定側の問題だった

`--concurrency auto` で `.vue` が 95 件パースエラーになるのは worker のバグではなく、
**型付き lint のブロックに `extraFileExtensions` が無い**ため。`.vue` ブロックは
`extraFileExtensions: [".vue"]` を渡しているが、`server/src/common/**/*.ts` のブロックは同じ
`tsconfig.app.json` を `project` に指定しながらそれを渡していない。同じ tsconfig から
**`.vue` を含まない program** が作られ、worker がそれを引くと `.vue` が program に居ない。
シングルスレッドでは作られる順が違って表に出ていなかっただけ。

`.ts` ブロックにも `extraFileExtensions: [".vue"]` を足すと 95 件 → 0 件になる。

### 挙動が変わらないことの確認

`--no-cache` で 3 通り走らせ、`(file, line, column, ruleId, severity, message)` の全件を突き合わせた:

| 比較 | 件数 | 差分 |
|---|---|---|
| 変更前の設定・シングル vs 変更後の設定・シングル | 16 / 16 | 0 |
| 変更後の設定・シングル vs 変更後の設定・`--concurrency auto` | 16 / 16 | 0 |

「今の木に指摘が無い」だけでは足りないので、**わざと違反を書いたファイル**（`src/` と `server/` の
`.ts`、`.vue`）を置いて同じ突き合わせをした。26 / 26 件で差分 0、
`no-floating-promises` / `no-unsafe-*` / `no-base-to-string` / `consistent-type-assertions` /
`vue/no-restricted-syntax`（テンプレート側）/ `vue/no-restricted-block` がどちらでも同じ位置に出た。
型情報を要する指摘が worker 側でも生きていることの確認。

## 3. `auto` がタダで効くのは `metadata` のときだけ

`eslint.js` の `calculateAutoWorkerCount`:

```js
/** True if cache is not used or if strategy is "content". */
const countAllMatched = !lintResultCache || cacheStrategy === "content";
```

worker 数は「lint し直す必要のあるファイル数 ÷ 50」（上限 `availableParallelism() >> 1`、1 は 0 に落ちる）。
`metadata` なら mtime を見て有効なキャッシュを除外できるので、**変更が無い run は worker 0 本**になる。
`content` は中身のハッシュが要るので全ファイルを数えてしまい、warm でも上限まで worker が立つ。

つまり **`content` と `auto` は組み合わせてはいけない**。ここが CI とローカルを分ける理由。

### ローカル（`--cache-strategy metadata --concurrency auto`）

| 状況 | 現在 | 変更後 |
|---|---:|---:|
| cold | 62.8s | **22.2s** |
| warm | 1.4s | **1.1s**（worker 0 本） |
| 1 ファイル編集後 | 2.4s | 2.3s |
| 300 ファイル更新後（pull 相当） | 17.3s | **11.3s** |

ローカルで `metadata` が安全な理由: mtime が中身と無関係に変わる操作をローカルではしない。
`prettier --write` は**内容が変わらないファイルを書き直さない**（mtime 据え置きを実測で確認）ので、
`yarn format` → `yarn lint` の順でもキャッシュは落ちない。

cold の最大 RSS は 15.7GB（このマシンで worker 10 本）。`auto` の上限はコア数の半分なので、
8 コア機なら 4 本・約 8GB に収まる。cold のときだけ。

### CI（`--cache-strategy content`、`--concurrency` 無し）

`content` は CI に必須。`actions/checkout` が全ファイルを新しい mtime で書くので、`metadata` だと
毎回全件が「変更された」ことになる。その上で worker を足すと **warm が遅くなる**:

| | シングル | worker 2 本（4 コア runner で `auto` が選ぶ数） |
|---|---:|---:|
| warm | 4.3s | 7.9s |
| cold | 55.8s | 43.7s |

毎 run に 3.6s 足して、稀な cold で 12s 返ってくる取引なので割に合わない。**CI は今のまま**。
CI の cold は 1 の対処で減らす。

## 変更するもの

- `eslint.config.js` — 型付き lint のブロックに `extraFileExtensions: [".vue"]`。
- `package.json`
  - `lint` → `eslint . --cache --cache-strategy metadata --concurrency auto --format …`
  - `lint:ci` → `eslint . --cache --cache-strategy content --format …`（今の `lint` と同じ）
  - `metadata` は既定値だが明示する。ここに `content` を書くと warm が 4 倍遅くなる、という
    ことが読んでわかる必要がある。
- `.github/workflows/ci.yml` — `setup-node` に `id`、キャッシュキーに Node バージョン、`yarn lint:ci`。
- `.github/workflows/windows-daily.yaml` — 同じキャッシュステップ（matrix があるので Node バージョンは
  キーに必須）と `yarn lint:ci`。#1645 で外したのは「連続で red で基準が無い」ためだったが、
  **落ちているのは Test ステップで Lint は success（105〜124s）**なので、lint の効果は測れる。
- `CLAUDE.md` — `yarn lint` の行に 2 本ある理由。

## 確認できないこと

CI 側は最初の run が定義上ミスなので、このブランチでは効果が出ない。Node バージョンをキーに
入れた効果は、**次に runner の Node パッチが動いたとき**にしか確認できない。
