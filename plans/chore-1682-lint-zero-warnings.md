# chore #1682 — lint の警告を 0 にして、緩んでいたルールを error に上げる

## 出発点

`yarn lint` は 0 errors / 16 warnings。警告は CI を止めないので、増えても誰も気づかない。実際に
2 件それが起きていた。

- **`max-params` の理由書きが実態とずれていた。** config には「唯一の意図的な違反者は
  `spawnClaudePty` の 7 引数、解消したら error に上げる」とあるが、`spawnClaudePty` は既に
  options オブジェクト化されて引数 4 個。error に上がらないまま、別の 2 ファイルが新たに違反した。
- **`max-lines` は全ファイルで error なのに spec だけ warn。** そのため spec は 600 行を超え放題で、
  現在 7 ファイル、最大 2264 行。`.vue` 側は超過ファイルを明示リストにして `off` にする方式
  （数えられる負債）なのに、spec はその扱いになっていなかった。

## 方針

**減らせるものは減らす。減らせないものは、増えないように閉じる。**

「明示リストに載せる」は silencing ではない。config の既存コメントが述べているとおり、
`eslint-disable` コメントは現場に隠れるが、config の `files:` リストは 1 か所で数えられ、
ファイルが基準を満たした時点でエントリを消せばルールがそのまま押さえてくれる。

## 手順

### 1. 減らす（副作用なし）

1. `test/src/utils/customViewSrcdoc.spec.ts` — disable 指定から、何も報告していない `no-new-func`
   を落とす。`sonarjs/code-eval` は残す。
2. `common/gitlabHosts.ts` — `HOSTNAME_RE` の入れ子量指定子を外す。**等価性は旧実装との差分テストで
   示す**（生成入力で全件比較し、件数を記録してから harness を捨てる）。
3. `server/backends/sharedApp/deploy.ts` の `establishAndScan`（7 引数）と
   `server/backends/sharedApp/publish.ts` の `publishSteps`（9 引数）を options オブジェクトに。
   どちらもモジュール内ローカルで呼び出し元は 1 か所ずつ。

   位置引数→名前付きの変換で唯一こわいのは**同じ型の引数の取り違え**（`establishAndScan` の
   `aid` と `root` はどちらも `string` なので、入れ替えても型検査を通る）。だから旧シグネチャの
   並びと新しい呼び出し側のキーの並びを 1 対 1 で突き合わせて確認する。変換後は名前で検査される
   ので、この危険は恒久的に消える。

### 2. 厳しくする

4. `max-lines` — spec も `error` に戻し、現在超過している 7 ファイルだけを `.vue` と同じ明示リストへ。
5. `max-params` — `warn` → `error`（手順 3 のあと）。停滞していた理由書きも実態に更新する。
6. `security/detect-unsafe-regex` — `warn` → `error`（手順 2 のあと）。
7. `sonarjs/deprecation` — `warn` → `error` にし、意図的な 5 件を抱える 3 ファイルだけを明示リストで
   `off`。新しい非推奨 API の使用はどこでも CI を止める。
8. `linterOptions.reportUnusedDisableDirectives: "error"`。今は既定の warn。

## 完了条件

`yarn lint` が 0 errors / 0 warnings。残る負債は全部 config 内の明示リストに載っていて数えられる。

## やらないこと

- **spec 7 ファイルの分割。** config 自身が「分割はアサーションを引き離す」と述べており、その判断を
  覆さない。リスト化で「減らないが増えない」状態にする。
- **意図的な非推奨 5 件の置き換え。** MCP SDK の `Server` は低レベル API のために公式に継続使用を
  案内しており、`execCommand("copy")` と `e.returnValue` はそれぞれ代替が効かない場面のために置いてある。
