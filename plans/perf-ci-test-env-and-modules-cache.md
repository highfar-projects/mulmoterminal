# CI をさらに速くする: テスト環境の宣言漏れと node_modules キャッシュ

#1644 / #1680 で lint は片付いた（CI 105s → 2〜8s）。次に効くところを実測で探した結果が これ。

## どこが律速か（実測、main の直近 run）

| ステップ | ubuntu | macOS |
|---|---:|---:|
| setup-node + yarn install | 51s | 84s |
| Lint | 2s | 8s |
| Typecheck | 23s | 27s |
| Build | 26s | 39s |
| **Test** | **196s** | **282s** |
| ジョブ合計 | 309s | **450s** ← PR の律速 |

Test が 6〜7 割。次が install。

## 1. テスト環境の宣言漏れ 18 本（#1331 のドリフト）

#1331 が `// @vitest-environment node` を 153 本に入れて 2026-08-03 に完了している。今日数えると
**404 本中 386 本が宣言済み、18 本が未宣言**。#1331 のあとに書かれたファイルで、DOM を一切使わない
のに jsdom を立てていた。

宣言が抜けても **spec は通る。遅くなるだけ**なので、レビューでもテストでも気づけない。これが
2 週間で 18 本たまった理由。

### setup ファイルも環境をまたいで走っている

`setupFiles` は環境に関係なく全ファイルで走る。`setup-i18n.ts` は既に `typeof window` で
ガードしてあり、その理由もコメントに書いてあった。**`setup-auto-unmount.ts` はガードが無く**、
node 環境の 400 本すべてが `@vue/test-utils` のモジュールグラフを読んで、絶対に発火しない
`afterEach` を登録していた。同じガードを入れる。

### 実測（`--maxWorkers=4`、CI の 4 コアを模した条件）

main をマージしたあとのコミットで、この変更だけを戻して測り直した値:

| | Duration | setup | environment |
|---|---:|---:|---:|
| 変更前 | 95.4s | 49.5s | 143.3s |
| **変更後** | **84.9s** | **25.5s** | **127.8s** |

**−11%**。テスト結果は同一（増えている 1 ファイル / 2 件は下のガード spec 自身）。
CI 換算で ubuntu Test 196s → 約 175s、macOS 282s → 約 250s。

マージ前のベースでは 106.4s → 90.4s（−15%）だった。取り込んだ spec が jsdom 側に
増えたぶん比率が下がっている。

20 コアの機械では wall がほとんど変わらない（47.9s → 48.7s）。CPU 総量は 397s → 283s に減って
いるので、**コアが少ないほど効く** = CI ほど効く、という形。

### 却下した案（いずれも実測して落とした）

| 案 | 結果 |
|---|---|
| `vitest.config.ts` を projects 構成に分ける | 90.3s。最小案（90.4s）と同じ。386 本の docblock が冗長になるだけなので採らない |
| `pool: "threads"` | 84.8s と速いが **61 テスト失敗**。HOME や env をファイル単位で差し替える spec がプロセス共有で壊れる |
| `isolate: false` | **312s**。3 倍遅い |
| Typecheck と Build の `vue-tsc -b` 重複を削る | 2 回目は incremental でほぼ無料。合計は変わらないので無意味 |

### 再発防止

`test/server/specEnvironmentDeclared.spec.ts` を足す。対象ディレクトリは
**`tsconfig.test-server.json` の `include` から読む** — あのファイルが既に「どの spec がサーバ側か」
を決めており、二つ目の手書きリストこそが `appRequest.spec.ts` を孤児にした原因（#1348）だから。

宣言を 1 本消すとファイル名を挙げて落ちること、戻すと通ることを確認済み。

## 2. node_modules を直接キャッシュ

`setup-node` の `cache: yarn` は **1.6GB** の yarn キャッシュを復元し、そのあと `yarn install` が
別途走る（macOS で 43s + 41s = 84s）。node_modules 自体は 1.2GB なので、**組み上がった木を
そのままキャッシュする**ほうが転送 1 回で済む。windows-daily.yaml が既にこの方式。

- キーは lockfile のハッシュ、prefix restore 付き（lockfile が変わっても前の木から差分解決）
- 解決後の node バージョンもキーに入れる（node-pty は ABI ごとの prebuilt を持つ）
- `yarn install --frozen-lockfile` は残す。warm でも postinstall（`server/fix-pty-perms.js`）は
  走ることを実測で確認済み

**これは未実測**。tar の展開が遅くて逆効果の可能性がある。PR の CI で測る（初回はキー変更直後
なので必ずミス、2 回目以降が本当の値）。効果が無ければこの半分だけ revert する。

`package-smoke` は律速ではない（142〜174s、並列）ので触っていない。

## 3. eslint キャッシュが依存ツリーを見ていない（#1680 の穴）

この作業中に踏んで気づいた。**ESLint がキャッシュ項目に混ぜるのは自身のバージョン・node の
バージョン・config だけで、依存ツリーは入らない**（`lib/cli-engine/lint-result-cache.js:56`）。
型付きルールは `node_modules` から型を読むので、**古い依存で計算した結果が、変わっていない
ファイルに対してそのまま再利用される**。

これは依存更新 PR の形そのもの: 動くのは `yarn.lock` だけで、ソースは 1 行も変わらない。

### 実証

`@receptron/sharedapp` の型定義を退避して、依存更新で型が壊れた状況を作った:

| 状態 | `yarn lint` の終了コード |
|---|---|
| 型定義なし + **warm キャッシュ** | **0（見逃す）** |
| 型定義なし + fresh キャッシュ | 1（正しく検出） |
| 型定義を戻す + fresh キャッシュ | 0 |

逆向きにも踏んだ: main をマージしたあと `yarn install` の前に lint を走らせたら、300 件の
"error typed" がキャッシュに焼き付き、install で木が直ったあとも同じ 300 件を報告し続けた
（ファイルが変わっていないので再 lint されない）。

### 対処

eslint キャッシュのキーに `hashFiles('yarn.lock')` を足す（ci.yml と windows-daily.yaml）。
依存が変われば別スコープになるので全件 lint し直す — **それは依存更新のときにこそ欲しい挙動**。
同じ lockfile の間は今までどおり再利用される。速度の代償はほぼ無い。

ローカルにも同じ罠はある（install 前に lint すると焼き付く）。`.eslintcache` を消せば直る。

## 確認したこと

- `yarn test` 10013 件が変更前後で同一（692 passed / 3 skipped / 45 skipped tests）
- ガード spec は宣言を消すと落ち、戻すと通る
- `yarn format` / `lint` / `typecheck` / `build` 通過
- ci.yml を YAML としてパースし、ステップ順（cache → install → eslint cache → Lint）を確認
