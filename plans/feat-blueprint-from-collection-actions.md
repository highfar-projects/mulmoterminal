# feat(blueprint): 元のアクションと自動取り込みを、普通の機能として作る (#2542)

設計 `plans/feat-blueprint-from-collection.md`（#2480）の段階 5。

## 方針

- **決定を機械で読める形にする**
  - 仕様書の工程が、元の各アクション（`actions` / `collectionActions`）と自動取り込み（`ingest`）の扱いを、`.blueprint/actions.json` に書く。
  - 扱いは三つ。
    - `feature`: 機能にする
    - `manual`: 人が手で行う
    - `drop`: やめる
  - `mutate` は必ず `feature`。提案として書き、人は承認の前に仕様書の会話で決め直せる。
- **仕様書の判定**（`checks/spec.sh`）: 元の全アクション・全取り込みに、正しい扱いが一つずつ付いていることを確かめる。落とす場合は次のとおり。
  - ファイルが無い。
  - 扱いが無い、または二重。
  - 三つ以外の値。
  - `mutate` を作らない。
  - 元に無い名前がある。
  - 元にアクションも取り込みも無ければ、ファイルを求めない。
- **工程 `actions`**（「必須の機能の試験」の直後。local は `run-check`、Firebase は `data-rules` の後ろで、試験の次に並ぶ）
  - local: `mutate` は API とボタン、`chat` / `agent` はテンプレートの手順をアプリの処理にする。モデルが要る手順だけサーバーから Claude API（鍵は `.env`）。宣言による取り込みはサーバー内の定期実行と `yarn ingest <slug>`。
  - Firebase:
    - `mutate` は画面とルール。
    - モデルが要る手順は、App Check を強制した callable 関数から呼ぶ。鍵は Secret Manager に置く。
    - 取り込みは `onSchedule` の関数にする。
  - 試験はネットワークを呼ばない（モデルの呼び出しも取得も差し替える。鍵なしで通る）。
- **決定の検査**（`checks/decisions.mjs`）: 仕様書の判定と工程の判定の両方がこれを走らせる（仕様書の判定を経ずに工程に来たビルドにも、同じ検査がかかる）。
  - 元の全アクション・全取り込みに、名前と `kind` が元と一致する記録が一つずつあること。
  - 扱いが三つのどれかで、`mutate` は必ず `feature` であること。
  - 元に無い名前が無いこと、ファイルが JSON で `actions` の配列を持つこと。
- **判定**（`checks/actions.sh local|firebase`）
  - 決定の検査を先に走らせる。
  - `feature` は、試験の題名にその名前がある（local `test/actions.test.ts`、Firebase `test/blueprint/actions.spec.ts`）。題名は `checks/test-titles.mjs` が、プロジェクトの TypeScript でファイルを構文解析して取り出す。
    - **許す形だけを数える**: そのファイルで `vitest` から import した `it` / `test`（別名での import 可）の呼び出し。付けてよいのは Vitest の修飾（`.only` `.skip` `.todo` `.concurrent` `.sequential` `.fails`）だけ。第 1 引数が文字列のときだけ、その文字列を題名とする。import した名前がファイル内で別にも宣言されていれば、その名前は数えない。
    - グローバルの `it`、同名の自作関数、ほかのモジュールの `test`、コメント・文字列の中、`describe` の題名、`.bind` などの呼び出し、実行時に組み立てる題名は数えない。安全な書き方も一部弾くが、文面から本物の試験と確かめられないものは数えない、という選択。
    - この形は、題名の判定への 3 度目の指摘で、悪い形を一つずつ足すのをやめて反転させたもの。
    - スキルは、`it` / `test` を `vitest` から import するよう求める。
  - 元の記録（写し）のアクションや取り込みに `kind` が無ければ落とす。何だったか（`mutate` か）が決められないため。
  - `manual` は、README の見出しにその名前がある。
  - `.env` があるなら、`.gitignore` がそれを無視している。作ったフォルダは git を足した時点でリポジトリになり、鍵が一緒に入ってしまうため。
  - `feature` が一つでもあれば、試験を走らせる（`tests-pass.sh actions` / `emulator-test.sh actions`）。
- local のセキュリティ診断（`blueprints/local/checks/security.sh`）にも、同じ `.env` の確認を足した。セキュリティ診断のスキルは、秘密の値を `.env` に置くよう求めていたのに、無視されていることを確かめていなかった。

## 確かめたこと

- 試験: 次を確かめた。
  - 仕様書の判定の決定の検査（5 通りの誤りと、アクションが無い場合）。
  - `actions.sh`: 通る場合、試験が無い、README に無い、作るものが無い、ファイルが無い、知らない土台。
  - パックの組み立て（`packs.spec.ts` が local と Firebase の両方の並びを検査する）。
- 実物: 段階 1 で写した `jma-weather`（`chat` のアクションが 2 つ）の写しに仕様書の判定を当てた。決定が無いと落ち、書くと通った。

## 確かめていないこと

- エージェントが実際にアクションを機能として作るビルド（Claude API を呼ぶものを含む）。

## 範囲外

- 新しい土台（段階 6）
