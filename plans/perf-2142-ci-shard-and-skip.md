# CI の壁時計を縮める（#2142）

PR の CI は Windows の ~12min で決まっている。計測すると、長い 3 ジョブはすべて `yarn test` 律速で、
それ以外のステップは全部足しても 1 分前後しかない。だからここでやることは「test を並べる」ことと、
「test が見られないものしか変わっていない PR で test を動かさない」ことの 2 つに尽きる。

計測元は run 35340476205（CI）と 35340476166（Windows (PR)）。再取得は
`gh api repos/receptron/mulmoterminal/actions/runs/<id>/jobs`。

| ジョブ | 全体 | うち Test |
|---|---|---|
| Windows (PR) / test_windows | 11.9min | 666s（93%） |
| CI / lint-and-build (macos) | 8.5min | 381s（74%） |
| CI / lint-and-build (ubuntu) | 7.6min | 365s（79%） |

vitest 自身の内訳は `environment 37%, import 36%, tests 14%, setup 10%`。実テストは 14% しかなく、
残りはファイル単位の固定費なので、**コア数を増やす以外に縮める手が無い**。だからシャード分割。

jsdom 削減はすでに #1331 が回収済み（911 spec 中 582 が `@vitest-environment node` 宣言、
`test/server/specEnvironmentDeclared.spec.ts` が強制）。残りは `test/src` が中心で、伸びしろは小さい。

## 1. `yarn test` を 3 シャードに分ける

`vitest --shard=<i>/3` を matrix で回す。分割が排他かつ網羅であることは実測で確認した:

```
npx vitest run test/bin --shard=1/3 --reporter=json   # 以下 2/3, 3/3
```

3 つの結果ファイルの和が非シャード実行のファイル集合と完全一致し、重複も欠落もゼロだった。
ファイル単位の隔離は現状の worker 並列がすでに前提にしているので、シャードで壊れるものは無い。

シャード数を 4 以上にしないのは macOS の同時実行上限（public リポで 5 ジョブ）に当てたくないため。

## 2. lint / typecheck / build を ubuntu 単独ジョブに出す

今は test と同じジョブの前に直列で並んでいるので、lint の失敗が test の後ろに隠れる。
別ジョブにすれば shard と並走し、失敗も早く出る。

macOS からは落とす。`vue-tsc` と `vite build` と eslint はプラットフォームで答えが変わらない。
`windows-pr.yaml` がすでに同じ理由で test だけに絞っていて、その判断をここにも適用するだけ。
macOS の test 自体は PR に残す（node-pty の prebuild とパス分岐は runner でしか本当には走らない）。

## 3. docs-only のスキップ範囲 — **test は例外**

`windows-pr.yaml` の scope step と同じ「job 内で自分で判定する」方式を使う。`paths-ignore` も
`needs` によるスキップも使わない: どちらもチェックが「成功」ではなく **不在** になり、
required gate になった瞬間に docs PR が永久に待つ（理由は `windows-pr.yaml` に書かれている通り）。

判定ロジックは `.github/actions/changed-scope` の composite action に切り出して
`ci.yml` と `windows-pr.yaml` で共有する。

**ここで当初案を修正した。** docs は test にとって不可視ではない:

- `test/docs/keymap-samples.spec.ts` は `docs/guide/**` と `server/skills/**` の **すべての .md** を
  収集時に読み、keymap サンプルを本物の validator に通す。
- `test/docs/claude-requirement-claims.spec.ts` は `README.md` と両言語の getting-started を読む。
- `test/scripts/factsJson.spec.ts`、`test/server/docs/agentSetClaims.spec.ts` も同種。

つまり docs だけの PR こそ、この spec 群が一番効く場面。よってスキップするのは:

| ジョブ | docs/plans/md だけが変わった PR |
|---|---|
| Lint, typecheck, build | スキップ（eslint は .md を一切処理しない、tsc/vite も読まない） |
| Test (ubuntu, 3 shards) | **走る** |
| Test (macOS, 3 shards) | スキップ（コードが変わっていない以上プラットフォーム差は出得ない） |
| Windows (PR) | スキップ（現状の挙動のまま） |
| package-smoke | スキップ |

判定不能なとき（base が diff できない、イベントが pull_request でない）は常に全部走らせる。

## 4. `concurrency` を足す

`ci.yml` / `dead-code-scan.yaml` / `duplication-scan.yaml` に無い。`windows-pr.yaml` と
`pr_triage.yaml` には有る。fix/2133 の 4 連続 push では CI が 4 本とも完走し、macOS の queue が
125s まで伸びた。`cancel-in-progress` は pull_request のときだけ true にする — main への push を
途中で殺すと、そのコミットに対する結果がどこにも残らない。

## 検証

CI 自体を変えるので ground truth は CI。この PR の run で確認する:

- 3 シャードの合計テストファイル数が、変更前の run が報告していたファイル数と一致すること。
- docs だけの追随 PR を出さずに済むよう、この PR 自体はコードを含むので全ジョブが走ること。
  docs-only 側の挙動は scope step のログ（変更ファイル一覧を出す）で読む。

## 積み残し（この PR ではやらない）

- `package-smoke` の `cache: yarn`（setup-node 25s）。node_modules キャッシュに寄せれば縮むが効果は小さい。
- `tsBuildInfoFile` は `node_modules/.tmp/` にあり、CI は node_modules ごとキャッシュしている。
  復元された tsbuildinfo が typecheck を取りこぼす可能性は、ローカルで既知の罠と同じ形。
  ただし現状の typecheck 実時間は cold 相当なので、実際に取りこぼしているという証拠は無い。別件。
