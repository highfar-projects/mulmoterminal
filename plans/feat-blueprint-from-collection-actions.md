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
- **判定**（`checks/actions.sh local|firebase`）
  - `feature` には、その名前を含む試験がある（local `test/actions.test.ts`、Firebase `test/blueprint/actions.spec.ts`）。
  - `manual` は README にその名前がある。
  - `feature` が一つでもあれば、試験を走らせる（`tests-pass.sh actions` / `emulator-test.sh actions`）。
  - ファイルが無ければ何もしない。

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
