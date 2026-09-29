# feat: the new-build form offers the folders it already knows (#2457)

## 問題

新規ビルドの「プロジェクトのフォルダ」はフルパスを手で打つしかなく、自分の文書で始める人の最初のつまずきになる。

## 方針

- `GET /api/blueprints/known-folders` が `{ folders }` を返す。中身はこれまでのビルドのフォルダ（新しい順）と、保存済みのフォルダ（`cwdPresets`）。
  - 並べ方と重複の除き方は純粋関数 `folderCandidates`（`server/blueprint/newFolder.ts`）。絶対パスだけを `path.resolve` でそろえて一度ずつ。ビルドのフォルダは `RECENT_FOLDERS_MAX` までにして、ビルドが多くても保存済みのフォルダが押し出されないようにする。
  - いまフォルダであるものだけ（`presenceOf`）を、上限 `KNOWN_FOLDERS_MAX` まで返す。
  - 候補はビルドの記録と設定からだけ作る。リクエストで任意のパスを尋ねることはできない。
- フォームの入力欄に `<datalist>` で候補を出す。手で打つこともそのままできる。候補があるときだけ、空欄に「前に使ったフォルダから選ぶ」と出す。
- 読めなかったときは候補なし。入力欄はそのまま使える。

## 範囲外

- ファイルシステムを自由にたどるフォルダ選択。
