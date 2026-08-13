# AskUserQuestion を右ペインのボタンで答える (#1679)

`AskUserQuestion` は端末の TUI ダイアログでしか答えられない。GUI から答える経路を足す。**opt-in**。

## 方針: ダイアログを置き換えず、GUI から実ダイアログを叩く

「GUI に差し替える」のではなく、

1. **質問の中身**は `PreToolUse` hook の `tool_input` から取る
2. **答え**は生キー (`\x1b[B` / `\r`) を PTY に書いて、**端末に出ている実ダイアログを操作する**

端末のダイアログはそのまま出続けるので、PC で普通に答えることもできる。**先に答えた方が勝つ** —
両側が同じ一つのダイアログを叩いているだけなので、調停役がいらない。

この形を選んだ理由は、検討した他案がどれも余計な前提を持ち込むから:

- **hook をブロックして GUI の答えを待つ**（`permissionDecision` / `decision.updatedInput` で答えを注入）
  — 待っている間は端末にダイアログが出ないので、PC の人が答えられなくなる。それを避けるために
  「リモート閲覧者がいる時だけ待つ」を入れると presence の競合を持ち込む（質問の後に繋がる、
  席を立つ、ロック中の socket が生きている）。さらに `updatedInput` に `answers` を入れて
  ダイアログを短絡できるかは**未検証の賭け**になる。
- **MCP の presentForm に誘導する** — エージェント側の振る舞いが変わるので、他のクライアントから
  同じセッションを触ったときに挙動が食い違う (#781 のコメント参照)。

この案はどれも要らない。presence 判定なし、ブロックなし、画面パースなし、未検証の前提なし。

## 実測（tmux + 実 claude 2.1.231）

推測ではなく、以下は動かして確認した。

- `PreToolUse` / `PermissionRequest` の**両方**が `AskUserQuestion` で発火し、`tool_input` に
  `questions[].{question, header, options[].{label, description}, multiSelect}` が入る
- 生バイト `\x1b[B` でハイライトが動き、`\r` で確定する。Claude は選んだ値を受け取って続行する
- `PostToolUse` の `tool_input.answers` は `{"質問文": "ラベル"}`。複数選択はカンマ区切りの 1 文字列

### キー列の規則（4 パターン測って確定）

| 形 | 実測 |
|---|---|
| 単問・single | `down×idx` + `Enter` で確定。**確認画面は出ない** |
| 単問・multiSelect | `Enter` がトグル。`Submit` 行まで下って `Enter` → **確認画面が出る** |
| 複数問・全部 single | 各問 `Enter` で**自動的に次の問へ**。最後に **確認画面** |
| 複数問・multi 混在 | 同上。multiSelect の問だけ `Submit` 行を経由 |

- 端末の行は `tool_input` より多い: `options` の後ろに `N. Type something` が付き、multiSelect では
  さらに `Submit` 行。よって **`Submit` 行 = `options.length + 1`**
- 確認画面は「Ready to submit your answers?」で `1. Submit answers` が最初から選択済み → `Enter` 1 回
- **確認画面が出ないのは「単問かつ single」のときだけ**

## 実装

### `common/askQuestion.ts`（共有・純粋）

サーバは `tool_input` を読む側、UI は表示とキー列を作る側。両方が同じ形から決めるので `common/`。

- `parseAskQuestions(toolInput: unknown): AskQuestion[] | null` — 型ガード（`as` を使わない）
- `keysForAnswers(questions, picks): string[] | null` — 上の表そのもの。`picks[i]` は選んだ
  option の index 配列。single は 1 個ちょうど、multiSelect は 0 個以上。範囲外や個数違いは `null`
- `ASK_QUESTION_CHANNEL` と `AskQuestionEvent` — `common/fileWriteChannel.ts` と同じ形

### サーバ

- `server/routes/hook-routes.ts` — `handleToolHook` の `phase === "start"` で
  `toolName === "AskUserQuestion"` なら `deps.publishQuestion(...)`。設定が off なら何もしない
- `server/routes/app-routes.ts` — `publishFileWrite` と同じ形で配線
- `server/config/app-config.ts` — `questionPaneEnabled: boolean`（既定 `false`）

設定名は `enableGui…` ではなく `questionPaneEnabled`。この repo の既存の真偽値が
`pushEnabled` / `worklogEnabled` / `copyOnSelect` / `decisionDigest` と、`enable` 接頭辞を使わないため。

### UI

- `useTerminalConnections.ts` に `sendKeys(key, data)` — `insertText` と違って
  **bracketed paste で包まない**。包む版 (`pasteText`) はメニューに無視されることが #781 で実測済み
- `QuestionPane.vue` — 質問と選択肢をボタンで出し、押されたらキー列を送って閉じる
- `RightPane` に `"question"` を足し、質問が来たら**自動で開く**（エージェントが訊いている
  ときに開いていなければ意味がない）

## 範囲外

- スマホ (mulmoserver) 側の UI。サーバ側の publish は共通なので、あちらは UI だけで済む
- `Type something` / `Chat about this`（端末にはあるが `tool_input` には無い行）。GUI からは出さない

## 確認したいこと

- キー列を**一度に**書いて TUI が取りこぼさないか。取りこぼすなら間隔を空けて送る
- 端末側で先に答えられた後にキーが届くと、入力欄に数字が落ちる。送る直前に画面を見る必要がある
