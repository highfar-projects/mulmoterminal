# fix: polishing after writing checks the house guide, since chaff has nothing left to find (#2509)

## 問題

「文書を書く」は部分ごとに chaff で確かめるので、書き終えた文書の chaff の指摘は 0 件になる。引き継ぎで「文書を整える」を「chaff が指摘した所だけ」で始めると直す所が無い。2026-09-29 に `bp-ex-shanai` で実際に回すと、エージェントが範囲を聞き直し、答えの記録とも食い違ってもう一度聞いた。

## 方針

- `write` → `polish` の引き継ぎで、決まった答え `scope: 手引き（STYLE.md）の決まりにも合わせる` を入れる。
- `polish` の「どこまで直しますか」は、「このフォルダの規約」を選んだときだけ聞く（`showIf`）。chaff の既定には手引きが無いので、その選択肢に意味が無い。
  - 聞かなかったときは chaff の指摘だけを直す。survey と polish の SKILL にそう書いた。
  - 引き継ぎで規約が chaff の既定なら、決まった答えの scope は聞かれず、サーバーが落とす。
- 例（社内のお知らせを整える、chaff の既定）の答えから、聞かれなくなる scope を外した。
- ガイド（ja / en）の「次にできること」の段落に、書いたあとの引き継ぎで何が入るかを書いた。
