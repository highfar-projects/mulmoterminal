# fix: the new-build form's default base does not depend on the filesystem's order (#2567)

## 問題

土台と種類の並びは `readdir` の順のままだった。Cloudflare の土台（#2556）が入ったことで、macOS ではファイル名の順で `cloudflare` が先頭になった。その結果、新規ビルドのフォームが「文書のフォルダ」ではなく Cloudflare を選んだ状態で開くようになった。Linux では `readdir` の順は決まっていない。

## 方針

- manifest に任意の `order`（小さいほど先）を足す。
- `inPackOrder`（`common/blueprint/manifest.ts`）は、`order` のあるものを小さい順に先に、ほかはスラッグ順（コード単位、ロケールに依らない）に並べる。
- `listPacks` はこの順で返す。フォームは一覧の最初の土台で開くので、既定が決まる。例の一覧の土台の順も同じになる。
- 既定の土台は、ユーザーの判断で以前の「文書のフォルダ」に戻す。`docs` だけに `order: 1` を付ける。Cloudflare のパック（別の作業コピーが作業中）には触らない。

## 実機

テスト用サーバーで、`/api/blueprints/packs` が `docs` から始まり、残りはスラッグ順になった。フォームは「文書のフォルダ」を選んだ状態で開き、文書の六つの種類が並んだ。

## レビューで足したもの

- インストールしたパック（マーケット）が `order` を付けて既定の土台を奪えないように、`order` を数えるのは同梱のパック（`source: "builtin"`）だけにした。インストールしたパックは、`order` があってもスラッグ順に並ぶ。
