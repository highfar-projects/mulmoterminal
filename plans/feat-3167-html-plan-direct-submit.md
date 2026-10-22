# 計画ページを確認欄なしで返す (#3167)

## 目的
実際に使って「確認欄なしでそのまま送りたい」という要望が出た。html-plugin 5.2.0（receptron/mulmoclaude#3592）で入った直接送信を、計画の skill から使う。

## 変更
- `@mulmoclaude/html-plugin` を 5.2.0 に上げる。
- `mulmoterminal-html-plan`：計画ページを `html` ＋ `submit: "direct"` で出す。送信ボタンで、ページの URL の `#mulmo-submit-key` を `key` として添える。送るのはボタンからだけにする（読み込み時や変更のたびに送らない）。自分が書いていないページには印を付けない。`path` で出すと確認欄経由になる。
- ガイド（`docs/guide/{en,ja}/features.md`）：ボタンでそのまま届くこと、確認欄が出る場合、送れなかったときは内容が残ることを書く。

## 確かめたこと
- `rm -rf node_modules && yarn install --frozen-lockfile` のあとで `lint:ci` / `typecheck` / `build` が通る。presentHtml・ガイド・同梱 skill の spec が通る。lockfile の変化は html-plugin の入れ替えだけ。
- HOME を差し替えた検証用サーバー（このチェックアウト）で Shell のセルに MCP で `html` ＋ `submit: "direct"` のページを出し、鍵付きの送信は確認欄なしで端末に届き（`tmux capture-pane`）、鍵なしの送信は確認欄に回ることを確かめた。
