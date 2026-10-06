# スマホのターミナル画面から共有ファイルを開く（ホスト側）

Issue: #2915（表示側は receptron/mulmoserver#345）。#2911 の続き。

## 変更

- `SessionScreenMeta` に `mobileFilesProject?: string`。`getTerminalScreen` の応答に乗る。
- 値はそのセッションの cwd を含む **最も深い** プロジェクト（workspace と登録ディレクトリ）の不透明な id で、
  そのプロジェクト自身が `mobileFiles` を宣言しているときだけ。親が宣言していても子にはフォールバックしない
  （子のセッションから親のファイルが開くのは利用者の予想と違う）。
- 判定は純粋関数 `mobileFilesProjectFor`（`server/backends/remoteHost/mobileFileProject.ts`）。
  設定の読み込み失敗はこのリンクだけを失い、画面の他のメタは失わない。
- パスは送らない。`listMobileFileProjects` と同じ id。
