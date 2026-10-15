# docs/feat: avatar（AvatarScript）の入れ方の案内と init の確認 (#3042)

## 何をするか

- ガイドの MulmoCast のページ（`docs/guide/{en,ja}/mulmocast.md`）に「しゃべるアバター」の節を足す。書き方
  （`speechParams.speakers.<名前>.avatar` と `avatarParams`）、入れ方、確かめ方、動画の作り方。
- `npx mulmoterminal@latest init` に avatar の行を出す（`bin/avatar-check.js`）。

## 決めたこと

| 論点 | 決定 |
| --- | --- |
| 入れる場所 | ホームディレクトリ（`cd ~ && npm install avatarscript onnxruntime-node`）。Remotion と同じ理由: `npx` は版ごとに新しいフォルダになるので、`~/node_modules` なら見つかり続ける。ホームの下の clone からも見つかる |
| グローバルに入れた場合 | ふつうホームの外にあるので、その隣にグローバルで入れる（`npm install -g …`）。init の確認は mulmocast の場所から探すので、どちらでも正しく答える |
| 部品の一覧 | mulmocast は avatar 用の一覧を書き出していないので、mulmocast の案内文に合わせてこちらで持つ（`AVATAR_PACKAGES`） |
| 確認の 1 行 | Remotion と同じ形。組み立てる部分を `optionalPackagesLine` に括り出し、両方から使う（Remotion の出力は既存のテストで固定） |

## 確かめ方

- `test/bin/avatar-check.spec.ts`: ホームに入れた場合・グローバルに並べた場合に見つかる、片方だけなら足りない方を出す、
  mulmocast が無ければ出さない
- `test/bin/remotion-check.spec.ts`（既存）がそのまま通ること
