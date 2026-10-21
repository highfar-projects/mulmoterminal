# HTML の計画でユーザーが決め、結果を返す skill (#3162)

## 目的
計画を HTML のページで出し、ユーザーがモックや操作で選んだ結果を、次のメッセージとしてエージェントに返す流れを同梱 skill にする。

## 前提
返す経路は html-plugin 側（receptron/mulmoclaude#3581 / #3583）。ページが `mulmo-html-submit` を親へ送り、View が確認欄を出して、ユーザーが送信を押したときだけ `sendTextMessage` を呼ぶ。この PR はその公開版へ `@mulmoclaude/html-plugin` を上げ、skill を足す。

## 変更
- `server/skills/mulmoterminal-html-plan/SKILL.md` を追加し、`BUNDLED_SKILL_NAMES` に登録。設定を書く skill ではないので、`mulmoterminal-config` の経路表からは外す（spec の `notSettings`）。
- `@mulmoclaude/html-plugin` を公開版へ上げる。
- `CLAUDE.md` の skill 一覧、`docs/guide/{en,ja}/features.md` に追記。

## 決めたこと
- 文面は plannotator/effective-html の `html-plan` を取り込まず書き直した。考え方（決定済み / 仮定 / 未決を分ける、元の約束を膨らませない）は同じで、MulmoTerminal 固有の部分（サンドボックスの制約、送信ボタン、結果が届いてからの動き）を足した。
- skill に書いたページの制約（許可 CDN、`fetch` と `localStorage` が使えない）は、実際の CDN 一覧と、サンドボックスの iframe の中での試し測りで確かめた。
