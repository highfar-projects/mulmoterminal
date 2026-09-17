# #2116 — PTY が終わったあとの `not-supported`

## 症状

grok / muse / antigravity のセッションを、その PTY が終わったあとに会話ペインで開くと、
「このエージェントの会話はまだ読めない」ではなく「**まだ何も書かれていない**」と出る。

## 経路（読んで確かめた）

1. `sessionTranscriptPage` は、**どの reader も持っていなかったとき**にだけ agent を聞く。
   `none`（何も書かれていない）と `not-supported`（このエージェントはまだ読めない）の**文言を
   選ぶためだけ**で、reader の選択には一切使わない。
2. その resolver は `server/index.ts` の
   `agentOfSession = (id) => ptys.get(id)?.agent ?? agentFromPaneCommand(tmuxPaneCommand(id))`。
3. PTY が消え、tmux ペインも無くなると `tmuxPaneCommand` が null → `agentFromPaneCommand(null)` は
   null → `agentOfSession` は null → `unread` が false → **`none`**。

スマホ側も同じ resolver を渡しているので同じ挙動（#1822 で `not-supported` を足したときから）。

## 直し方: プロセスではなく**ストア**に聞く

この reader の設計はもともと「**agent は聞かない。ファイルの存在を聞く**」で、それは
restart をまたいだ claude セルが `shell` と報告されるからだった。今回もその原則をそのまま使う。

reader を**持たない**エージェントにだけ、「この id を持っているか」を聞く:

| agent | 聞き先 | 代償 |
|---|---|---|
| antigravity | `antigravityConversations`（`antigravity-conversations.jsonl` から hydrate 済みの Map） | Map 参照 |
| muse | `museConversations`（同上） | Map 参照 |
| grok | `grokConversationExists(root, cwd, id)` — grok は id がそのまま会話 id なのでログが無い | ディレクトリ 1 回 |

**聞くのは「どの reader も外した」かつ「resolver が null を返した」ときだけ**。生きている
shell セルは resolver が `shell` と答えるので、ここには来ない。

## 崩れない形にする

`UNREAD_SOURCES` は「`hasReader` が false を返すエージェント**ちょうど**」でなければならない。
#1822 でどれかに reader が付いたら、この一覧から外し忘れると「読めるのに読めないと言う」になる。
spec で 2 つの一覧の整合を固定する（型ではなく実行時の集合として突き合わせる）。

## テスト

- agy / muse / grok が持っている id を、**resolver が null を返す状態**で開くと `not-supported`
- 誰も持っていない id は `none`
- resolver が `shell` を返すときは `none`（今までどおり、ストアには聞かない）
- `UNREAD_SOURCES` と `hasReader` の集合が一致する
