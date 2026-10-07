# Release note draft: token rotation (#2919)

A draft written ahead of the release, from the user's own opening. At release it moves into
`docs/guide/{ja,en}/v<version>.md` under the three fixed headings, with the PR numbers filled in.
The parts marked (PR 2) / (PR 3) describe what those PRs add; drop or adjust whatever has not shipped.

## 日本語

### 新機能

**複数の Claude サブスクリプションを、セッションごとに自動で使い分ける（トークンローテーション）**

Claude Code をガンガン使っていると、1 日で 1 週間分の枠を使い切ってしまいますよね。
そんなときは複数のアカウントを用意して、日ごとにアカウントを切り替えて使うと思います。ただ、日によって
使う量も違うので、できれば全部のアカウントをうまくバランスさせて、毎日まんべんなく使いたいところです。
そうすれば、1 アカウントくらいは解約できるかもしれません。

MulmoTerminal は、そんなヘビーな Vibe coder のために、**新しいセッションを始めるたびに、いちばん余裕のある
アカウントを自動で選ぶ機能**を追加しました。

- 選び方は「週の枠のうち、リセットまでに使い切れずに消えてしまいそうな分」が多いアカウントから。リセット間近で
  余っている枠を先に使うので、全部のアカウントの週の枠がなるべく平らに減っていきます。
- 5 時間枠が上限近いアカウント、週の枠を使い切ったアカウントは自動で外れます。
- 会話はアカウントをまたいで続きます。`/login` で切り替えたときと同じで、会話の記録は一つの場所にあるので、
  どのアカウントでも再開できます。
- 上限に当たったセッションは、別のアカウントで自動で再開します。（PR 2）
- ヘッダーの使用量の表示に、アカウントごとの残りが並びます。どのメールアドレスのアカウントかも表示されます。（PR 3 で見た目を整える）
- トークンそのものは画面にも設定ファイルにも出ません。設定に書くのは「どこにしまったか」（macOS のキーチェーンの項目名など）だけです。

**試し方**

1. アカウントごとに、自分のターミナルで `claude setup-token` を実行します（ブラウザでログインします）。
2. 表示されたトークンをキーチェーンにしまいます:
   `security add-generic-password -a mulmoterminal -s mulmoterminal-token-a -w`
   （`-w` のあとに何も書かないと入力を求められるので、トークンがシェルの履歴に残りません）
3. `~/.mulmoterminal/config.json` に `tokenRotation` を足します（例は設定ガイド参照）。
4. 新しいセルを開くと、選ばれたアカウントで起動します。

MulmoTerminal の設定 skill（`mulmoterminal-model`）に「アカウントを回して」と頼めば、設定まで案内します。
複数のサブスクリプションを回して使うことが利用規約上問題ないかは、ご自身で確認してください。

### 画面の変化

- ヘッダーの使用量の表示に、ローテーションに登録したアカウントごとの 5 時間枠・週の枠が並びます。

### 見えない変化

- 設定しなければ、これまでと何も変わりません。

## English

### New features

**Use several Claude subscriptions evenly, chosen automatically per session (token rotation)**

Use Claude Code hard enough and a week's allowance can be gone in a day. The usual answer is several
accounts and switching between them day by day — but how much you use changes from day to day, so what
you really want is all of them used evenly, every day. Balance them well and you may find you can cancel one.

For heavy vibe coders, MulmoTerminal now **picks the subscription with the most room every time a new
session starts.**

- It ranks by how much of each weekly window would otherwise be lost at its reset, so room that is
  about to reset is used first and every account's week drains as evenly as possible.
- An account near its 5-hour limit, or out of its weekly allowance, is skipped.
- Conversations carry across accounts, just as with `/login`: everything stays in one place, so any
  session can be resumed on any account.
- A session that hits its limit resumes on another account by itself. (PR 2)
- The header's usage gauge shows what is left on each account, with the sign-in address it belongs to. (polished in PR 3)
- The token itself is never shown and never written to the config — an entry says only where it is kept.

**How to try it**

1. For each account, run `claude setup-token` in your own terminal (it signs in through the browser).
2. Store the token in the keychain:
   `security add-generic-password -a mulmoterminal -s mulmoterminal-token-a -w`
3. Add `tokenRotation` to `~/.mulmoterminal/config.json` (see the setup guide for an example).
4. Open a new cell: it starts on the account chosen for it.

Ask the `mulmoterminal-model` skill to "rotate my accounts" and it walks you through it. Whether
rotating several subscriptions suits Anthropic's terms is yours to check.

### What looks different

- The header's usage gauge lists the 5-hour and weekly windows of each rotation account.

### Under the hood

- Nothing changes unless you configure it.
