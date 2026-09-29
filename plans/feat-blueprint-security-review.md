# feat(blueprint): web 系の設計図の最後にセキュリティ診断の工程を入れる (#2478)

## 問題

`local` 土台で作ったアプリを Claude Code でレビューすると、Host ヘッダーを確かめていない（DNS リバインディングで API を読み書きできる）と指摘された。web 系の土台には、セキュリティを確かめる工程が無い。「必ず詰める点」は仕様書に貼られるだけで、最後に照合されない。

## 方針

- `local` と `firebase` の土台に工程 `security` を足す。
  - 下敷き
    - OWASP Top 10:2025（A01〜A10）
    - anthropics/claude-code-security-review の分析手順: 文脈 → 観点ごとの監査 → 修正、重大度の定義、確信度 70% 未満は報告しない、DoS やレート制限は除外
  - エージェントの自己申告では閉じない。判定スクリプトが、動くもの・出荷されるものを確かめる。
- `local`（`checks/security.sh`）
  - 本番ビルドを起動し、攻撃と同じ形のリクエストを送る。
    - 知らない `Host` → 400/403/421
    - 自分の名前 → 200
    - 別オリジンからの POST → 403
    - `/` に nosniff・CSP・frame-ancestors（または X-Frame-Options）があり、`X-Powered-By` が無い
    - 壊れた JSON にスタックトレースやパーサの文言を返さない
  - あわせて、`test/security.test.ts` と `yarn test`、`yarn audit` の要約に high / critical が無いこと。要約が無ければ落とす（通信できない監査を通さない）。
  - サーバー起動の部分は `smoke.sh` から `serve.sh` に切り出し、両方が使う。
- `firebase`（`checks/security.sh`）
  - `firestore.rules` が deny-all で終わる。
  - `firebase.json` の Hosting ヘッダー（nosniff・CSP・frame-ancestors か X-Frame-Options）。
  - 秘密鍵がプロジェクトに無い。
  - `yarn audit`（ルートと `functions/`。`functions/` には `yarn.lock` を要求）。
  - `emulator-test.sh security`。
  - 報告のあとに開発用へ公開し直していること（`build-id` が報告より新しい）と、`deploy-check.sh dev`（画面が描かれる）。
- 報告 `.blueprint/security-review.md` の判定（`security-report.sh`、両方の土台に同じ中身で置く）
  - A01〜A10 の見出しがある。
  - `- HIGH|MEDIUM open|accepted` の行が無い。
- 工程の位置
  - `local`: 起動確認 → （product の）必須の機能の試験 → 診断 → 引き継ぎ。そのため、product の local の `acceptance` を `insertAfter: run-check` にした（以前は引き継ぎの後ろ）。
  - `firebase`: 保護（と internal の本番の認証）→ 診断 → 本番に公開。
- `local` のチェックリストに Host の許可リストとセキュリティヘッダーを足す。

## 確かめたこと

`local` で作り終えたアプリの写しに判定を当てた。

- そのままでは、Host の判定で落ちる（利用者の指摘と同じ）。
- 対策すると通る。
- 対策を一つずつ外すと、それぞれ狙った判定で落ちる。
- `smoke.sh` の切り出しは、新旧を同じアプリに当て、正常と壊した 3 通りで結果が一致した。

## 範囲外

- エージェントが実際にこのスキルで診断して直すところは、ビルドを一本通さないと確かめられない。
- 完了後の案内（#2479）、コレクションのアプリ化（#2480）。
