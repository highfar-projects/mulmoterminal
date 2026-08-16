# feat: Claude の transcript をスマホの専用ビューで読めるようにする

issue: #1751（先行: #1275, #1272 / #1274）

## きっかけ

スマホの remote terminal は Claude セルの**現在の 1 画面しか見えない**。会話を遡る手段が無い。

#1272 / #1274 で tmux のスクロールバックを 300 行に広げた（`SCREEN_HISTORY_ROWS`）が、
**claude セルには効かない**。稼働中の tmux セッション 12 本で再計測した:

```
2.1.233  alt=1 hist=0  w=131 h=41   ← claude cell
2.1.233  alt=1 hist=0  w=120 h=30
zsh      alt=0 hist=0  w=133 h=32   ← shell cell
（claude cell は 11/12 すべて alt=1、hist は 0 か 2）
```

`capture-pane -S -300` は実在する履歴にクランプされるので、claude セルでは pane_height
（30〜41 行）しか返らない。スマホ側は `TerminalScreenPreview.vue:28` が `whitespace-pre` +
`overflow-auto` + `max-h-64` なので、120〜133 桁を横スクロールしながらその 1 画面だけを見ている。

#1275 が「読む先を transcript に替える」issue で COMPLETED で閉じられているが、
**mulmoserver 側に transcript ビューは存在しない**（`src/` に該当ファイル 0 件）。

## 決まったこと（オーナー確認済み、2026-08-16）

| # | 項目 | 決定 |
|---|---|---|
| 1 | 読み込み量 | **論理行 250**（`\n` 区切り）で切る。**ターン境界で切り、途中では切らない**。**最新 1 ターンは超過しても必ず出す** |
| 2 | 切り詰め | `tool_result` は 6 行。`text` は切らない。`tool_use` はツール名 1 行 |
| 3 | 読み方 | `forEachJsonlRecordIn(file, { from: size - 4MB })`。前方に流しながら 250 行超で古いターンから破棄 |
| 4 | thinking | **落とす**（本文がディスクに無い） |
| 5 | sub agent | 本体 `<id>.jsonl` だけ。`Task` は 1 行＋結果 6 行。ドリルダウンは作らない |
| 6 | 出し分け | transcript が**読めるか**を返り値の 1 フィールドで（`clearedTranscripts` を先に見る、下記） |
| 7 | 既定と記憶 | 既定は画面。localStorage **1 キー**。transcript が無いセッションでは画面にフォールバック |
| 8 | 更新 | 既存の `REFRESH_INTERVAL_MS = 5000` を共有。新しい定数を作らない |

## なぜその数字なのか（すべて実測）

```
1 ターンの実表示行数   median   77 行 / p90  310 行 / max 1747 行   （50桁折り返し、427ターン）
論理行 → 表示行の膨張  median 1.39x / p90 4.00x                     （502ターン）
250 行に必要な tail    median  609KB / max 1457KB                  → 4MB で 2.8 倍の余裕
4MB tail の読み        24.3ms（107MB のファイルで）                 対 画面の tmux capture 39.3ms
切り詰め無し           350 行バジェットに 1 ターンしか入らない
sub agent 1 体         284〜20,614 行                              → バジェットに対して展開不能
transcript 追記間隔    2〜17 秒                                    → 5 秒ゲートは下限として妥当
sidechain の発生率     直近 120 本で 0 本 / 300 本サンプルで 2 本（0.7%）
```

**行の単位に注意。** 目標は「今の画面の 10 倍」＝実表示 350 行。ホストは折り返し幅を知らないので
論理行しか数えられず、膨張率が median 1.39x ある。だから**ホスト側のバジェットは 250** で、
実表示が中央値 348 行になる。スマホから桁数を送らせて厳密にする案は採らない — 実際の折り返しは
CSS がやるもので、桁数を送っても近似にしかならない。

### thinking の本文はディスクに無い

transcript 12 本すべてで、`thinking` パートは存在するがテキストは **0 文字**だった。

```
keys: ['signature', 'thinking', 'type']
  thinking:  len=0      ← 空
  signature: len=2284   ← API 再送用の暗号化トークン
```

出すものが無いので、トグルも設けない。「考え中」の 1 行マーカーも出さない —
レコードは思考が**完了した**ときに落ちるので待っている間は見えず、その 2 秒後には `tool_use`
が来る（実測）。

### sub agent は本体に入っていない

```
<project>/<sessionId>.jsonl                       ← 本体。sidechain を 1 件も含まない
<project>/<sessionId>/subagents/agent-<id>.jsonl  ← 1 体 1 ファイル
<project>/<sessionId>/subagents/agent-<id>.meta.json
    {"agentType":"Explore","description":"…","toolUseId":"toolu_01GrPF…","spawnDepth":1}
```

決定 3（本体の末尾 4MB だけ読む）を守るかぎり sidechain は追加コスト 0 で除外される。
展開しなくても `Task` の `tool_result` が本体にあり、**それが sub agent の最終報告そのもの**
（実測 6,737 文字）なので、決定 2 の 6 行キャップで冒頭は出る。別ファイルにあるのは**過程**だけ。
`meta.json` の `toolUseId` が本体の `Task` tool_use の `id` と一致するので、後から掘る道は閉じない。

## 変更

### サーバ

**`server/session/transcript-view.ts`（新規・純関数）**

- `TranscriptTurn { at: string | null; rows: TranscriptRow[] }`、
  `TranscriptRow` は `{ kind: "user" | "assistant" | "tool"; text: string; truncated?: boolean }`
- `renderRecord(record)` — 1 レコード → 行。`text` は素通し、`tool_use` はツール名 1 行、
  `tool_result` は 6 行で切って `truncated` を立てる、`thinking` は捨てる
- `foldTranscriptView(scan, record)` — ターン境界で区切り、論理行 250 を超えたら**古いターンごと**
  捨てる。ただし**残り 1 ターンなら捨てない**
- `sessionTimeline` の `foldTimeline`（`session-reads.ts:195`）と同じ形。窓が行数でターン単位という
  点だけが違う

ターン境界は **`type:"user"` かつ非 sidechain かつ content に `text` を持つレコード**。
`promptId` は使わない — 実測で 114 レコードが `promptId` 無しの `NONE` に落ちた。

**`server/session/transcript-view-read.ts`（新規）** に `sessionTranscriptView(cwd, id)`。

`session-reads.ts` には**置かない**。`sessionTimeline` / `sessionLastTurn` の隣が素直に見えるが、
PR #1749 が同じファイルに +80 行を入れて open のままで、CLAUDE.md の「One file per agent —
NEVER two agents in one file, whatever the line distance between them」に当たる。
このファイルが要るのは `projectSessionsDir(cwd)` とファイル読みだけで、どちらも
`session-reads.ts` に依存しないので、分けるのに設計上の代償が無い。

読みは `forEachJsonlRecordIn(file, { from: Math.max(0, size - 4MB) })`。
`readTailRecords` は同期（`readSync`）で 4MB に 24ms かかり、WebSocket でターミナルを流している
同じプロセスを止めるので使わない。`transcript-fold` も使わない — 初回のコールドリードが全長で、
実測 107MB の live セッションが実在する。

**`server/backends/remoteHost/handlers/terminalSession.ts`** に `getTerminalTranscript`。
`getTerminalScreen` と同じ検証。MulmoClaude に対応物は無い（`terminalSession.ts` の冒頭が
「that host has no PTY table to look at」と書いているとおり）ので、命名はこちらの自由。

### スマホ（mulmoserver）

- `useTerminalTranscript.ts` — `useTerminalScreen` と同じ形（`callHost` + `refreshGate` 共有）
- `TerminalTranscriptView.vue` — ターンごとにブロック。`text` は折り返す（`whitespace-pre-wrap`）。
  `tool` 行は 1 行、切り詰めた `tool_result` は末尾に印
- 切り替えは詳細ページのタブ。既定は画面、localStorage 1 キー（`mulmoserver:terminalView`）

## `/clear` を踏まないこと（最重要）

**決定 6 を素朴に `stat(<id>.jsonl)` で実装すると壊れる。**
`server/session/cleared-transcripts.ts` の冒頭:

> `/clear` makes claude mint a NEW session id and a new transcript, while hooks keep reporting
> under ours, so from that moment `${id}.jsonl` holds the conversation the user just ended.
> Reading it is what put the pre-clear summary and reply back in the cockpit (#1085),
> **so every reader of that file asks this set first.**

`/clear` 後も `<id>.jsonl` は**存在する**。中身が終わった会話に変わるだけ。だから存在チェックだけ
だと、ビューは有効になり**終わった会話を出す**。#1749 iter-1 が同じ罠を踏んでいる。

- 読む前に `clearedTranscripts.has(id)` を見る。マークがあれば transcript は「無い」と答える
- マークは**サイズで自然に失効する**（`--resume` が追記してファイルがマーク時のサイズを超えたら、
  マークはもう何も説明していない）。その判定はモジュールが持っているので自前で書かない

**`/compact` は id を振り直さない。** #1749 iter-4〜5 がこの開発機の全 transcript で実測し、
compact したもの 95 本 / compact 後に命令があるもの 61 本の**すべてで session id は同一**だった。
`activity-hook.ts` の古いコメントが逆を書いていたが、それは訂正済み。したがって compact をまたいでも
`<id>.jsonl` のパスは有効で、追加の対応は要らない。

## 既知の欠落（承知のうえで初期は受け入れる）

#1748 の plans が同じセッションで取った実測により、transcript の `type:"user"` は
**人間が打ったものの集合と一致しない**:

| | `~/.claude/history.jsonl` | transcript の `type:"user"` |
|---|---|---|
| 通常のプロンプト | 11:31:02.300 | 11:31:02.318（+18ms） |
| **ターン実行中に割り込んだ命令** | 記録あり | **存在しない**（`queue-operation` / `attachment`） |
| skill が注入したテキスト | 入らない | **`type:"user"` として入る** |

このビューは**割り込んだ命令を表示せず、誰も打っていない skill 注入をターンとして描く**。
初期はこれを受け入れる — transcript は「モデルが見た会話」であり、それをそのまま出すのは一貫している。
「自分が何を頼んだか」は #1748 の `PromptsPane` が担う（そちらはデスクトップのみ）。

`history.jsonl` とのマージで正確にする道はあるが、#1748 の reader と重なるので初期はやらない。

## テスト

`test/server/session/transcript-view.spec.ts` — 純関数を両方向で。

- 正常な 1 ターン / 複数ターン / ターン境界がファイル先頭に無い場合
- 250 行超で古いターンが落ちる / **1 ターンしか無ければ落とさない**
- `tool_result` の 6 行切り詰めと `truncated`
- `thinking` が落ちる / `signature` だけのレコード
- sidechain レコードが混ざっても無視される
- 壊れた JSON 行 / `message` が無い / `content` が文字列 / 空配列
- `promptId` を持たないレコードでもターンが切れる

`test/server/backends/remoteHost/` にハンドラの spec。`clearedTranscripts` にマークがあるとき
「transcript は無い」と答えることを固定する — ここが抜けると #1085 の違反が黙って通る。

## やらないこと

- **ページング** — `uuid` / `parentUuid` でカーソルは作れるが、最新 250 行で打ち切る
- **sub agent のドリルダウン** — `toolUseId` で結合できるが作らない
- **claude 以外** — codex は rollout、grok / muse は未パース（`session-reads.ts:268`）
- **compaction の `summary` レコード** — 素通し
- **デスクトップ側のビュー** — スマホだけ

## 先行作業との衝突

**PR #1749（`origin/feat/1748-prompt-history-pane`、open）が
`server/session/session-reads.ts` に +80 行入れている。**
この計画は `session-reads.ts` を**一切触らない**ことでこれを回避する（上記）。

着手前に `gh pr list --state open` と
`git log origin/main --oneline -20 -- <触るファイル>` の両方で確認する
（1 時間前にマージされた PR は open 一覧にも作業ツリーにも現れない）。

**着手前に `uptime` を見ること。** この計画を書いた時点でこの機械は 20 コアに対して
load average 33〜43（1.7〜2.1 倍）だった。CLAUDE.md の「The machine is loaded」は
新しい作業を止める条件であって、遅らせる条件ではない。

## ついでに見つかった別件（この issue では直さない）

- `server/backends/remoteHost/terminalScreen.ts:65` の「A tmux-only session is always null」が
  `server/index.ts:646` の実装と合っていない。`agentOfSession` は
  `ptys.get(id)?.agent ?? agentFromPaneCommand(tmuxPaneCommand(id))` で、tmux にセッションがあれば
  null にならない。しかも `pane_current_command` は claude の場合**バージョン文字列**（`2.1.233`）
  なので表に無く `?? "shell"` に落ちる。つまり**再起動を跨いだ claude セッションは
  `agent: "shell"` と報告される**。決定 6 で agent 種別を使わない理由がこれ
- `SCREEN_HISTORY_ROWS = 300`（mulmoserver#139）が claude セルに効いていない
