# Release note draft: token rotation (#2919)

Written ahead of the release, from the user's own opening. At release it moves into
`docs/guide/{ja,en}/v<version>.md` under the three fixed headings, with the PR numbers (#2920, #2921 and
the UI PR) filled in. The living reference is `docs/guide/{en,ja}/token-rotation.md`; link to it from
each section rather than repeating it.

## 日本語

### 新機能

**複数の Claude の契約を、セッションごとに自動で使い分ける（トークンのローテーション、ベータ）**

Claude Code をガンガン使っていると、1 日で 1 週間分の枠を使い切ってしまいますよね。
そんなときは複数のアカウントを用意して、日ごとにアカウントを切り替えて使うと思います。ただ、日によって
使う量も違うので、できれば全部のアカウントをうまくバランスさせて、毎日まんべんなく使いたいところです。
そうすれば、1 アカウントくらいは解約できるかもしれません。

MulmoTerminal は、そんなヘビーな Vibe coder のために、**新しいセッションを始めるたびにいちばん余裕のある契約を
自動で選び、上限が近づいたセッションは会話を保ったまま別の契約へ移す機能** を追加しました。

- **選び方**: 週の枠のうち「リセットまでに使わないと消えてしまう分」が多い契約から使います。リセット間近で余っている
  枠を先に使うので、全部の契約の週の枠がなるべく平らに減っていきます。5 時間枠が 90% 以上、週の枠が 98% 以上の契約は選びません。
- **98% で切り替え**: 使っている契約の 5 時間枠か週の枠が 98% に達すると、ターンが終わったところで別の契約に移ります。
  作業の途中では切り替えません。
- **上限に当たっても続く**: 使用量の値は数分遅れることがあるので、98% の前に上限に当たることもあります。そのときも
  Claude Code が上限を知らせた時点ですぐ別の契約に移り、同じ会話を続けます。上限で止まった質問は自動では送り直さないので、
  もう一度送ってください。
- **会話は契約をまたいで続きます**: `/login` で切り替えたときと同じで、会話の記録は一か所にあり、どの契約でも再開できます。
- **トークンは見えません**: トークンは画面にも設定ファイルにも出ません。設定に書くのは「どこにしまったか」
  （macOS のキーチェーンの項目名など）と、目印のメールアドレスだけです。

**試し方**

1. 契約ごとに、自分のターミナルで `claude setup-token` を実行します（ブラウザでその契約にログインします）。
2. 表示されたトークンをキーチェーンにしまいます:
   `security add-generic-password -a mulmoterminal -s mulmoterminal-token-personal -w`
   （`-w` のあとに何も書かないと入力を求められるので、トークンがシェルの履歴に残りません）
3. `~/.mulmoterminal/config.json` に `tokenRotation` を足します（例は設定ガイド参照）。
4. 設定画面の「設定ファイルを読み直す」を押します。再起動は要りません。
5. 新しいセルを開くと、選ばれた契約で起動します。

`mulmoterminal-model` skill に「契約を回して」と頼めば、設定まで案内します。

**知っておくと迷わないこと**

- **契約が替わるのは、プロセスが起動するときです。** 新しいセル、セルを閉じて会話を開き直す、再起動ボタン、上限での移動の
  どれかです。いま開いているセルはそのままの契約で動き続けます。切り替えたいセルは、一度閉じて開き直してください
  （会話は続きます）。ブラウザの再読み込みだけでは替わりません。
- **全部の契約をトークンで登録したら、`includeDefaultLogin` は `false` に。** `true` だと `/login` しているアカウントも
  候補に入りますが、それは登録したトークンのどれかと必ず同じなので、同じ枠を 2 回数えることになります。しかも `/login`
  し直すたびに、どれと重なるかが変わります。
- **Claude Code の `/status` に出るアカウント名は、気にしなくて大丈夫です。** Claude Code 自身は `/login` のアカウントを
  表示し続けることがありますが、使用量はセルの見出しに出ている契約から引かれます。`/status` に
  `Auth token: CLAUDE_CODE_OAUTH_TOKEN` と出ていれば、ローテーションのトークンで動いています。
- **枠を使い切った契約は自動で外れます。** リセットまで選ばれず、使用量の表示には「上限に達している」と出ます。設定に残して
  おけば、リセット後にまた使われます。
- **回るのはふつうの Claude のセルだけです。** プロバイダ、カスタムエージェント、複数の契約（accounts）のセルは対象外です。
- 複数の契約を回して使うことが Anthropic の利用規約に照らして問題ないかは、ご自身で確認してください。

### 画面の変化

- **セルの見出し** に、そのセルが動いている契約の名前が出ます（複数の契約と同じ印）。
- **ツールバーの使用量** に契約ごとの表示が並び、マウスを載せると名前とメールアドレスが出ます。
- **「その他の機能」→「トークンの使用量」** で、全部の契約の 5 時間枠・週の枠の残りとリセットまでの時間を一覧で見られます
  （トークンのローテーションを設定しているときだけ出ます）。
- 契約を移ったとき、セルに 1 行だけ「どの契約からどの契約へ移ったか」が出ます。

### 見えない変化

- 設定しなければ、これまでと何も変わりません。
- 上限などで止まったターンでも、セルの「作業中」の点が消えるようになりました（以前は点いたままでした）。

## English

### New features

**Several Claude subscriptions, used evenly, picked automatically per session (token rotation, beta)**

Use Claude Code hard enough and a week's allowance can be gone in a day. The usual answer is several accounts
and switching between them day by day — but how much you use changes from day to day, so what you really want
is all of them used evenly, every day. Balance them well and you may find you can cancel one.

For heavy vibe coders, MulmoTerminal now **picks the subscription with the most room every time a session
starts, and moves a session that is running low to another one without losing the conversation.**

- **How it picks**: by how much of each weekly window would otherwise be lost at its reset — room about to
  reset is used first, so every subscription's week drains as evenly as possible. A subscription whose 5-hour
  window is at 90% or more, or whose week is at 98% or more, is skipped.
- **Switches at 98%**: when the subscription a session runs on reaches 98% in either window, the session moves
  at the end of its turn — never in the middle of one.
- **Carries on past a limit**: the usage figures can be a few minutes old, so a session can hit the limit
  before 98% is seen. It then moves the moment Claude Code reports the limit and carries on with the same
  conversation. The message that hit the limit is not re-sent — send it again.
- **Conversations carry across subscriptions**, as with `/login`: everything stays in one place, so any session
  resumes on any subscription.
- **Tokens stay hidden**: never shown, never written to the config. An entry says only where the token is kept
  (a keychain item) and, as a label for you, the sign-in address.

**How to try it**

1. For each subscription, run `claude setup-token` in your own terminal (it signs in through the browser).
2. Store the token in the keychain:
   `security add-generic-password -a mulmoterminal -s mulmoterminal-token-personal -w`
3. Add `tokenRotation` to `~/.mulmoterminal/config.json` (see the setup guide for an example).
4. Settings → "Reload config file". No restart needed.
5. Open a new cell: it starts on the subscription chosen for it.

Ask the `mulmoterminal-model` skill to "rotate my subscriptions" and it walks you through it.

**Good to know**

- **The subscription changes when a process starts**: a new cell, closing and reopening a conversation, the
  restart button, or a move at the limit. Cells already open keep theirs; close and reopen one to switch it
  (the conversation carries on). Reloading the browser does not.
- **Once every subscription is a token, set `includeDefaultLogin` to `false`.** With `true` the account you are
  signed into with `/login` is one more candidate — but it is always one of your tokens, so it is counted
  twice, and which one changes whenever you `/login` again.
- **Ignore the account name in Claude Code's `/status`.** Claude Code may keep naming your `/login` account;
  the usage is counted against the subscription in the cell's header. `Auth token: CLAUDE_CODE_OAUTH_TOKEN` in
  `/status` means the cell runs on a rotation token.
- **A subscription that is out of its allowance drops out by itself** until it resets, and its usage entry
  says it is at its limit. Leave it in the config and it is used again after the reset.
- **Only plain Claude cells rotate.** Provider, custom-agent and account cells are left as they are.
- Whether rotating several subscriptions suits Anthropic's terms is yours to check.

### What looks different

- **The cell's header** names the subscription it runs on (the same mark accounts use).
- **The toolbar's usage gauge** gets one entry per subscription; hover it for the name and address.
- **"More features" → "Token usage"** lists every subscription's 5-hour and weekly room and when each
  resets (only while token rotation is on).
- When a session moves, the cell shows one line saying which subscription it moved from and to.

### Under the hood

- Nothing changes unless you configure it.
- A turn that ends on an error (a usage limit, for one) now clears the cell's working dot, which used to stay lit.
