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
| 1 | 読み込み量 | **論理行 250**（`\n` 区切り）で切る。**ターン境界で切り、途中では切らない**。**最新 1 ターンは超過しても必ず出す**（例外は `too-large` だけ） |
| 2 | 切り詰め | `tool_result` は 6 行。`text` は**行数では切らない**（バイト上限に当たったときだけ切って `clipped`）。`tool_use` はツール名 1 行 |
| 3 | 読み方 | 末尾 **4MB** の範囲読み。境界が 0 個なら **8→16→32MB** と広げ、32MB でも無ければ `too-large`。**`FileHandle` を渡し、`try`/`finally` で必ず閉じる**。前方に流しながら 250 行超で古いターンから破棄 |
| 4 | thinking | **落とす**（本文がディスクに無い） |
| 5 | sub agent | 本体 `<id>.jsonl` だけ。`Task` は 1 行＋結果 6 行。ドリルダウンは作らない |
| 6 | 出し分け | `TranscriptView` を **`ok` / `none` / `cleared` / `too-large` の判別可能ユニオン**で返す（`clearedTranscripts` を先に見る、下記） |
| 7 | 既定と記憶 | 既定は画面。localStorage **1 キー**。`ok` 以外のとき画面にフォールバック |
| 8 | 更新 | 既存の `REFRESH_INTERVAL_MS = 5000` を共有。新しい定数を作らない |

この表と本文が食い違うと**読者が最初に読むほうが古い**。本文を変えたら必ずここも直す。

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

## 計測は「観測」であって契約ではない

上の数字と形式の主張はすべて **2026-08-16 に、Claude Code
`2.1.226` / `2.1.228` / `2.1.231` / `2.1.233`（transcript の `version` フィールド実測）** に対して
取ったもの。claude の on-disk 形式は非公開で、`thinking` の本文が常に空であることも、
`tool_result` が 6 行で足りることも、sub agent の最終報告が必ず本体に入ることも、
**upstream が保証したものではない**。

`server/session/project-dir.ts` が既に「claude の on-disk 規約は upstream を写してテストで固定する」
方針を取っているので、同じ扱いにする:

- **バージョンを記録する。** 上の 4 つを spec のフィクスチャのコメントに残す
- **形式が変わったときに黙って壊れない側へ倒す。** `thinking` の本文が空でなくなったら、
  捨てるのではなく `text` と同じ扱いで出す（決定 4 は「本文が無いから出さない」であって
  「出したくない」ではない）。`tool_result` の `content` が未知の形なら
  `JSON.stringify` して同じ 6 行キャップに掛ける
- **未知の content ブロック種別は無視ではなく 1 行で出す**（`[unknown block: <type>]`）。
  無視すると**新しい形式が来たときにビューが静かに痩せる**ので、気づけるようにしておく

## 変更

### サーバ

**`server/session/transcript-view.ts`（新規・純関数）**

- `TranscriptTurn { at: string | null; rows: TranscriptRow[] }` — `at` は**境界レコードの
  `timestamp`**（ISO 文字列をそのまま）。文字列でなければ `null`。ターンの中の他のレコードの
  時刻は使わない（境界がそのターンの始まりだから）。`null` を許すのは、時刻が読めない 1 件で
  ターンごと落とすほうが害が大きいため — #1748 が `PromptEntry.at` で同じ判断をしている
  `TranscriptRow` は `{ kind: "user" | "assistant" | "tool" | "unknown"; text: string; clipped?: boolean }`
  — **`clipped`** は**この行の `text` を切った**（`tool_result` の 6 行キャップでも、
  バイトキャップでも立つ）。`TranscriptView.truncated`（**ターンを**捨てた）とは別物で、
  同じ語にすると phone がどちらの印を出すか決められない。
  **行が切れた**か**ターンが落ちた**かの区別であって、どの規則が切ったかの区別ではない
- `renderRecord(record)` — 1 レコード → 行の配列。**content の並び順どおりに 1 ブロック 1 行**
  （まとめない・並べ替えない）。ブロック種別ごとの規則:

  | block | kind | text | 備考 |
  |---|---|---|---|
  | `text` | レコードが `user` なら `"user"`、`assistant` なら `"assistant"` | `part.text` を素通し（改行込み） | |
  | `tool_use` | `"tool"` | `part.name` | 引数は出さない |
  | `tool_result` | `"tool"` | 下記で 1 つの文字列にしてから**先頭 6 行** | 7 行目以降を捨てたら `clipped` |
  | `thinking` | — | — | 行を作らない |
  | それ以外 | `"unknown"` | `[unknown block: <part.type>]` | |

  `content` が**配列ではなく素の文字列**なら、`text` ブロック 1 つとして扱う（claude の通常の
  ユーザレコードはこの形）。

  `tool_result.content` は文字列とは限らない。**文字列ならそのまま、配列なら `text` を持つ要素の
  `text` を `\n` で継ぎ、それ以外は `JSON.stringify`。** そのうえで 6 行に切る。
  ここを決めないと**同じ transcript から違う wire が出る**

  **6 行の数え方**: `split("\n")` の先頭 6 要素。末尾の改行が作る空要素も 1 行として数える
  （数えないと「6 行に見えて 7 行ある」が起きる）。**`content` が素の空文字列**なら 1 行
  （空の行を出す。「ツールは走ったが何も返さなかった」は情報）。**配列で、要素が全部落ちて
  空になった**なら行を作らない（出すべき中身が 1 つも無い）。この 2 つは違う。
  **先頭**を残すのは、ツール出力は頭が要る側だから（ファイル読みの冒頭、grep の最初の一致）。

  **フィールドが壊れているときのフォールバック** — `TranscriptRow.text` は必ず `string` なので、
  どの経路でも文字列を返す:

  | 状況 | 結果 |
  |---|---|
  | `tool_use` の `part.name` が無い / 文字列でない | `kind: "unknown"`、`[unknown block: tool_use]` |
  | `text` の `part.text` が無い / 文字列でない | 行を作らない（空の行は情報が無い） |
  | `tool_result.content` の要素で `JSON.stringify` が `undefined` を返す | その要素を飛ばす |
  | 継いだ結果が空文字列 | 行を作らない |
  | レコードに `message` や `content` が無い | **行を作らず、ターンも切らない**。境界の判定は `userPromptText` が non-null であることなので、`content` の無いレコードは境界にならない
- **`kind: "unknown"` が下の「形式変更時のフォールバック」の受け皿**。未知の content ブロックは
  そこへ入れて `[unknown block: <type>]` を `text` にする。union に無いと**フォールバックが
  型で表せず、結局は無視することになる**。UI 側はこの kind を薄く描いて、
  出たと分かるようにする
- **行バジェットのほかにバイトキャップが要る。** 決定 2 は `text` を**行数では**切らないので、
  **1 レコードが数 MB になり得る**（実測 4.5MB、#1692）。250 行に収まっていても
  Firestore の command doc 上限 1MiB を超え、**応答ごと失敗する**。
  既存の画面パスは行キャップとバイトキャップの**両方**を持っている
  （`terminalScreen.ts` の `SCREEN_HISTORY_ROWS` と `SCREEN_MAX_BYTES = 256KB`）。
  同じ 256KB を使い、同じやり方で当てる — **新しい方から積んで、入らない最初のターンで止める**
  （`withinByteCap` と同形）。
  **最新 1 ターンだけで 256KB を超える場合**は、そのターンを落とさず**行の `text` を切って
  `clipped` を立てる**。決定 1 の「最新 1 ターンは必ず出す」が優先で、`too-large` にはしない
  （読めているのだから、大きさを理由に何も出さないのは間違い）。**満たすべき保証**（手順ではなく、テストで確かめられる形で書く）:

  - 応答は **256KB を超えない**。測るのは文字数ではなく **UTF-8 バイト** — 日本語で 3 倍ずれる
  - 切った結果が**不正な UTF-8 にならない**（多バイト文字の途中で割らない）
  - **最新 1 ターンは落とさない**。切るのは行の `text` であって、ターンではない
  - 切った行には `clipped` が立ち、**行ごと消えない**

  どの行から切るか、JSON のオーバーヘッドをどう見積もるかは**実装 PR がテストで決める**。
  上の 4 つは保証なのでここに残す。
- **バジェットは行を数える。`TranscriptRow` の**個数**ではない。** `text` は素通しなので
  改行を含む — 1 行として数えると**巨大な assistant 本文 1 ブロックがバジェットを素通りする**。
  数えるのは `row.text.split("\n").length`（`tool_result` はキャップ後の行数、`tool_use` は 1）。
  決定 1 が「論理行 250」と言っているのはこの意味
- `foldTranscriptView(scan, record)` — **`record.isSidechain === true` のレコードは
  行も作らず、ターンも切らず、そこで捨てる**（境界の述語だけで弾くと、sidechain の
  assistant レコードが直前のターンの行として紛れ込む）。残りをターン境界で区切り、
  論理行 250 を超えたら**古いターンごと**捨てる。ただし**残り 1 ターンなら捨てない**
- **最初の境界より前に来たレコードは捨てる。** 窓は必ずターンの途中から始まるので、先頭には
  必ず「前のターンの尻尾」が付く。これを合成ターンに入れると**話者の分からない断片**が頭に出るし、
  250 行バジェットに数えると**捨てられない断片が最新ターンを押し出す**。捨てるのが唯一
  一貫する選択で、決定 1 の単位が「ターン」である以上、ターンでないものは単位に乗らない
  （どれを選ぶかで出力が変わるので、明示して spec で固定する）
- `sessionTimeline` の `foldTimeline`（`session-reads.ts:195`）と同じ形。窓が行数でターン単位という
  点だけが違う

ターン境界は **`type:"user"` かつ `record.isSidechain !== true` かつ
`userPromptText(record.message.content)` が non-null なレコード**。

sidechain の判定は**レコードの `isSidechain` フィールドそのもの**（真偽値）。他の手掛かりで
推測しない。実測では本体 `<id>.jsonl` に `isSidechain: true` のレコードは 1 件も無く
（直近 120 本 / 最大 150 本を走査）、sub agent は `<sessionId>/subagents/agent-*.jsonl` に
分かれている。つまりこの判定は**現状ほぼ発火しない**が、上流が本体に混ぜ始めたときの
防波堤として要る — だから spec で `isSidechain: true` のレコードが落ちることを固定する。

述語を自分で書き直さないこと。`userPromptText`（`server/session/transcript.ts:29`）は
**`content` が素の文字列の場合と配列の場合の両方**を扱う（`Array.isArray ? map(...).join(" ") : content`）。
「content に `text` ブロックを持つもの」と読める書き方をすると**素の文字列のプロンプトが
境界にならず**、複数のやり取りが 1 ターンに融合して 250 行の追い出しが効かなくなる。
実際 claude の通常のユーザレコードは素の文字列で来る（`test/server/session/transcript.spec.ts` の
フィクスチャがそう組んでいる）。

`promptId` は使わない — 実測で 114 レコードが `promptId` 無しの `NONE` に落ちた。

なお `userPromptText` は `isInjectedPrompt` を通すが、**skill が注入した本文はこれに掛からない**
（#1748 の実測）。下の「既知の欠落」はそれを承知のうえで受け入れている。

**`server/session/transcript-view-read.ts`（新規）** に `sessionTranscriptView(cwd, id)`。

`session-reads.ts` には置かない。必要なのは `projectSessionsDir(cwd)` とファイル読みだけで、分けるのに設計上の代償が無い。

読みは `forEachJsonlRecordIn(handle, { from: Math.max(0, size - 4MB) })`。
`readTailRecords` は同期（`readSync`）で 4MB に 24ms かかり、WebSocket でターミナルを流している
同じプロセスを止めるので使わない。`transcript-fold` も使わない — 初回のコールドリードが全長で、
実測 107MB の live セッションが実在する。

**パスではなく `FileHandle` を渡すこと。** `forEachJsonlRecordIn` は #1750 で
`JsonlSource = string | FileHandle` を取るようになり、その理由がここに直撃する
（`server/infra/jsonl-file.ts` のコメント）:

> A path is re-resolved on every read, so two reads of one path can land on two different files —
> and a reader that folds a range and then checks something else about "the file" has no way to
> say the two saw the same one. **A handle IS the file.**

この読みは `stat` でサイズを取り、範囲を読み、境界が 0 個なら広げて**もう一度読む**ので、
同じパスを 2〜3 回開き直す。その間に `/clear` が新しいファイルを作ったり `--resume` が
差し替えたりすると、**サイズは A のもの・レコードは B のもの**という混ざった結果になる。
1 つの handle を開いて全部そこから読み、`fstat` でサイズを取れば、読んだもの全部が同じ実体を指す。

**handle は `sessionTranscriptView` が所有し、`try` / `finally` で必ず閉じる。**
このビューは 5 秒ゲートでポーリングされるので、閉じ忘れは 1 回の漏れでは終わらず
**fd を溜め続けて最後に `EMFILE` でサーバごと落ちる**。開く側が閉じる側であること、
どの経路（`too-large` で諦めた場合、`cleared` で早期に返る場合、例外）でも閉じることを
spec で固定する。

#### 窓より大きい 1 レコードで「最新 1 ターン」が消える（要対処）

`forEachJsonlRecordIn` は `from > 0` かつ `atLineStart` 未指定なら**先頭の欠けた行を捨てる**
（`server/infra/jsonl-file.ts:104`）。半分の行は JSON ではないので正しい既定だが、
**単一レコードが窓より大きいと窓はその内側から始まり、そのレコードごと落ちる**。
最新レコードがそれなら、決定 1 の「最新 1 ターンは超過しても必ず出す」が破れて**ビューが空になる**。

仮定ではない。#1692 が同じ機械の transcript で **1 行 4,761,619 文字**（4.5MB、3 行）を報告している。
巨大な `tool_result` がそうなる。

対処 — **窓に「ターン境界が 1 つ以上」入るまで後ろへ広げる**:

- `from` を倍にして読み直す（4MB → 8MB → 16MB …）。**ターン境界（`userPromptText` が non-null な
  `type:"user"` レコード）が 1 つでも入ったら止める**
- **上限は 32MB**。`4 → 8 → 16 → 32MB` と倍にして、32MB を読んでも境界が無ければ
  そこで止め、空ではなく `too-large` を返す。空と区別がつかない失敗にしない。
  **32MB の根拠**: 実測された最大の単一レコードは 4,761,619 文字（#1692、約 4.5MB）で、
  32MB はその 7 倍。読みのコストは実測 24ms/4MB から外挿して約 190ms だが、
  これが起きるのは境界が 1 つも無い病的な場合だけ
- **これが決定 1 の「最新 1 ターンは必ず出す」の唯一の例外**、と言い切る。上限が有限である以上
  保証は無条件ではあり得ないので、無条件だと書いたまま `too-large` を返すのは矛盾になる
  。**例外はこの 1 つだけ**で、それ以外の経路で最新ターンが欠けたら defect
- 決定 2 の 6 行キャップは**描画**の話なので、ここでは効かない。JSON を解析するには行が丸ごと要る

**条件は「0 レコード」ではなく「境界が 0 個」。** 0 レコードで判定すると、
`[窓より大きい tool_result][小さい assistant レコード]` の並びで**レコードは 1 つ取れてしまうので
広げず、最新ターンが欠けたまま出る**。守りたいのは決定 1 の
「最新 1 ターンは必ず出す」なので、条件はその保証をそのまま述べる形にする —
悪い形を数え上げるのではなく、**満たすべきものを条件にする**。

広げるのは境界が 0 個のときだけなので、通常の読みは 4MB のまま（実測で必要量は max 1457KB）。

**`server/backends/remoteHost/handlers/terminalSession.ts`** に `getTerminalTranscript`。

**`getTerminalScreen` と同じ検証では足りない。** あのファイルのハンドラは `sessionId` を
**「空でない文字列」しか見ていない**（`terminalSession.ts:57-58`）。`getTerminalScreen` が
それで無事なのは id を `tmuxSessionName(id)` に渡すだけで**パスにしない**からで、
このハンドラは**あのファイルで初めて id をファイルパスにする**。素通しだと
`../../` を含む id で `projectSessionsDir(cwd)` の外に出られる（リモートから読める
ホストのファイルを読み出す経路になる）。

- **`SESSION_ID_RE`（`server/config/env.ts:76`）で弾く。** HTTP ルート側は既にこれを使っている
  （`session-routes.ts`）。UUID の形なので `/` も `.` も通らない
- **さらにパスの内包も確認する。** `path.resolve` した結果が `projectSessionsDir(cwd)` の下に
  あることを見る。正規表現だけで十分だが、**後で誰かが正規表現を緩めたときに残るのはこちら**
MulmoClaude に対応物は無い（`terminalSession.ts` の冒頭が
「that host has no PTY table to look at」と書いているとおり）ので、命名はこちらの自由。

**cwd はハンドラで解決しない。** `sessionTranscriptView(cwd, id)` は cwd を要るが、ハンドラが
受け取るのは `sessionId` だけ。既存の `captureTerminalScreen` が同じ形で、dep の型は
`(sessionId: string) => Promise<SessionScreen>`（`handlers/deps.ts:27`）、cwd の解決は
`server/index.ts` 側の実装が `ptys.get(id)?.cwd ?? sessionCwd(id) ?? ""`（`server/index.ts:682`）で
やっている。**同じ形にする** — dep を `captureTerminalTranscript: (sessionId: string) =>
Promise<TranscriptView>` にして、cwd はその実装が同じ 1 行で解決する。ホストの作業ディレクトリを
使うと**別プロジェクトのセッションで違う transcript を読む**。

**ただし cwd が `""` のときはパスを組む前に `none` を返す。** `cwdOfSession` は分からなければ
`""` を返し、`projectSessionsDir("")` は**プロセスの作業ディレクトリ**に解決してしまう。
つまり古い / 知らないセッション id を渡されると、**ホストの作業ディレクトリ側にある同名の
transcript を読む**。空の cwd は「このセッションのことを知らない」であって
「ここを見ろ」ではないので、そこで止める。

### wire の形（これを決めずに phone は書けない）

`TranscriptView` は**判別可能なユニオン**にする。「読めるか」を真偽値 1 つにすると、
「まだ無い」「`/clear` で終わった」「大きすぎる」が phone から区別できず、3 つとも同じ
空表示になる。

```ts
type TranscriptView =
  | { status: "ok"; turns: TranscriptTurn[]; truncated: boolean }
  | { status: "none" }      // transcript がまだ無い（新しいセッション、claude 以外）
  | { status: "cleared" }   // /clear で終わった会話。凍結されている
  | { status: "too-large" }; // 上限まで広げても境界が見つからなかった
```

- `truncated` は **返したターンが transcript の全部ではない**かどうか。真になるのは 3 通り —
  250 行バジェットで古いターンを捨てた / 256KB バイトキャップで捨てた /
  **窓がファイル先頭から始まっていない**（`from > 0`）。3 つ目が要るのは、
  4〜32MB の tail が古い完結ターンを丸ごと落としていても行バジェットは発火しないので、
  **切れた履歴が「これで全部」として出てしまう**から。phone は「これより前は出せない」と
  1 行出す。無いと**完全な履歴と切られた履歴が見分けられない**（#1749 が `PROMPT_SCAN_LIMIT` で
  同じ問題を踏んでいる — 窓ちょうどの件数と、それを超えて切った件数が区別できなかった）
**どの状況がどの `status` になるか**（決めないと、同じ「見えない」が 3 通りの原因で起きる）:

| 状況 | status |
|---|---|
| `clearedTranscripts` にマークがある | `cleared` |
| ファイルが無い（`ENOENT`） | `none` |
| ファイルはあるが 0 バイト | `none` |
| レコードはあるが**ターン境界が 1 つも無く**、32MB まで広げても見つからない | `too-large` |
| ファイル全体が 32MB 未満で、読み切っても境界が無い | `none`（大きさの問題ではないので `too-large` にしない） |
| 壊れた行しか無い | `none`（`forEachJsonlRecordIn` が壊れた行を飛ばすので、レコード 0 件に等しい） |
| 読めない（`EACCES` など `ENOENT` 以外の I/O エラー） | `none`。**理由をサーバログに出す** — phone には出し分ける手立てが無く、黙って消えるのが一番困る |
| 境界があり、行が 1 つ以上できた | `ok` |

`none` に寄せているのは、phone の答えが**どれも「画面へフォールバック」で同じ**だから。
分けるのは `cleared`（終わった会話だと言える）と `too-large`（大きさが理由だと言える）だけで、
それ以外を細かくしても phone にできることは増えない。

- `status` を持たない旧ホストは phone 側で `"none"` として扱う（mulmoserver の後方互換の慣習）
- **mulmoserver 側のコマンド定義もこの PR の範囲**。`getTerminalScreen` の隣に足す
- **`docs/remote-host-protocol.md` を同じ変更で更新する。** あの文書は冒頭（`:8`）で
  「every command the host answers, the shapes it …」を**契約**だと宣言していて、
  `getTerminalScreen` は `:38` の表に行を持っている。ここに載らないコマンドは、
  ホストと phone のどちらが古いときに何が起きるかがどこにも書かれていないことになる

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
- **素の `.has()` で見ること。読むたびに `stat` して `markStillHolds` を自前で呼ばない。**
  既存の読み手は全員素の `.has()` を使っている（`session-routes.ts:129` / `session-title.ts:71` /
  `lifecycle.ts:210` / `task-push.ts:69`）。ここだけ per-read の判定を入れると、
  **transcript ビューだけが「clear されたか」について cockpit・サマリ・push と食い違う**
- `markStillHolds` が hydration 経路（`cleared-transcripts.ts:105`）にしかないのは漏れではなく設計。
  モジュール冒頭が理由を書いている — 「a server killed before reap would leave a mark that silences
  a resumed session's summary for good」。**起動時のバックストップ**であって毎読み込みの判定ではない
- **マークはセッションが生きているあいだ残る。それが正しい** — その間ずっと `<ourId>.jsonl` は
  終わった会話を持っているから。`/clear` 後も claude は走り続けるが、**新しい id で別ファイルに書く**

マークが捨てられるのは reap（`lifecycle.ts:161-163`）で、reap に届く経路は 2 つ:

- grace window を過ぎた detached セッション（`lifecycle.ts:115`）
- pty が死に、**かつ** tmux セッションも無い場合（`pty-exit.ts:26`）

**tmux が生きたまま pty だけ死んだ場合は reap されない**（`ptyExitDisposition` が `"keep"` を返し、
`ptys.delete` だけして reap を呼ばない）。この repo のセルは全部 tmux backed なので、これが既定の経路。

`--resume` が `<ourId>.jsonl` に追記するにはそのセッションが一度居なくなる必要があり、
それは reap を意味する。**その順序を破る経路は探して見つからなかったが、無いことを証明はしていない。**
仮にあっても素の `.has()` は既存 4 読み手と同じ挙動なので、transcript ビューだけがズレることは無い。
これは repo 全体の性質で、#1751 に別件として記録した。

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
- `tool_result` の 6 行切り詰めと `clipped`（`TranscriptView.truncated` と混同していないこと）
- `thinking` が落ちる / `signature` だけのレコード
- **`isSidechain: true` のレコードが落ちる** — 境界としても行としても現れないこと
- 壊れた JSON 行 / `message` が無い / `content` が文字列 / 空配列
- `promptId` を持たないレコードでもターンが切れる
- **`content` が素の文字列のユーザレコードが境界になる**（`{type:"text"}` 配列だけでなく）

「境界がファイル先頭に無い」と「窓の中に境界が 1 つも無い」は別物で、
前者だけでは下 2 つが素通りする:

- **空ファイル / 4MB より小さいファイル**（`from` が 0 になり `dropLeading` が効かない経路）
- **選んだ窓の中にターン境界が 1 つも無い**
- **単一レコードが窓より大きい** → 窓を広げる経路と、上限に達したときの
  「大きすぎて表示できない」応答（空と区別できること）
- **`[窓より大きい tool_result][小さい assistant レコード]`** — レコードは取れるが境界が無いので
  広げること。「0 レコードなら広げる」に退化していたら落ちるケース
- **未知の content ブロック**が `kind: "unknown"` の行として出る（無視されない）
- **content が素の文字列のレコードが `text` ブロック 1 つとして描かれる**
- **`tool_result.content` が配列のとき** `text` を `\n` で継ぎ、それ以外は `JSON.stringify` される
- **混在した `text` / `tool_use` ブロック**が content の並び順どおりに別々の行になる
- **改行を含む 1 つの `text` がバジェットに正しく数えられる** — 行数であって行オブジェクト数
  ではないこと。巨大な本文 1 ブロックが 250 行を素通りしたら落ちる
- **`too-large` の経路で handle が閉じられる**。`cleared` の早期 return と例外の経路も同じ
- **`status` の対応表が全行そのとおりであること** — 特に「32MB 未満で境界なし」が `none`、
  「32MB まで広げても境界なし」が `too-large` に分かれること
- **`at` が境界レコードの `timestamp`** で、文字列でなければ `null`
- **`tool_result` の 6 行が先頭 6 行**で、7 行目以降を捨てたときだけ `clipped` が立つ。
  末尾の改行が作る空要素も 1 行として数える
- **壊れたフィールドのフォールバック** — 表のとおり全経路で `text: string` を満たすこと
- **`message` / `content` の無いレコード**が行も作らずターンも切らない
- **256KB のバイトキャップ**で古いターンが落ち、`truncated` が立つ
- **最新 1 ターンだけで 256KB を超える**とき、そのターンは落ちず行の `text` が切られて
  `clipped` が立つ（`too-large` にはならない）
- **窓がファイル先頭から始まっていない**とき、行バジェットが発火していなくても `truncated` が立つ
- **cwd が `""` のセッション**が `none` を返す。`projectSessionsDir("")` を呼ばないこと
- **`SESSION_ID_RE` に合わない `sessionId` が弾かれる** — `../` を含むもの、空、UUID でないもの。
  さらに解決後のパスが `projectSessionsDir(cwd)` の下にあること
- **`isSidechain: true` の assistant レコードが、直前のターンの行として紛れ込まない**
- **バイトキャップで切った行が UTF-8 として壊れていない**（日本語を含む行で確かめる）

**この一覧は実装 PR で増える。** 上は計画が主張した規則に 1 対 1 で対応する分で、
壊れた入力の網羅はフィクスチャと型の仕事にする — 散文で数え上げても、実装で増えた分岐は拾えない。
- **読んでいる最中の追記** — 末尾が途中まで書かれた JSON 行で終わる場合

- **最初の境界より前のレコードが捨てられ、250 行バジェットに数えられない**
- **窓に境界が入っているとき、最新ターンが「完全に」返る。** 停止条件は「境界が 1 つ以上」だが、
  保証は「最新 1 ターンが必ず出る」。この 2 つが等しいのは、**最後の境界より後ろには境界が無い**から
  — 窓に境界が 1 つでもあれば最後の境界も窓に入り、その後ろは全部窓の中にある。逆に最後の境界が
  窓の外なら境界は 0 個になり広げる。**この関係はテストで固定する**（古い境界＋途中から始まる
  最新ターン、という並びで確かめる）。停止条件と保証がずれていないことは読んで分かる話ではない

ハンドラの spec（`test/server/backends/remoteHost/`）:

- `clearedTranscripts` にマークがあるとき **`status: "cleared"`** を返す —
  ここが抜けると #1085 の違反が黙って通る
- **`/clear` されたセッションが `cleared` を返し、他の読み手（cockpit / サマリ / push）と
  同じ判断になること** — 実装の形ではなく観測できる挙動を固定する
- **4 つの `status` が区別されること** — `ok` / `none` / `cleared` / `too-large`。
  真偽値 1 つに退化していたら落ちる
- **cwd の解決がホストの作業ディレクトリではなくセッションのものであること**

phone 側の spec（mulmoserver、`test/<area>/test_*.ts`。コンポーネントは
`test/components/` の「ソースを読んで regex で固定する」形に合わせる）:

- 既定が画面で、localStorage が空でも transcript にならない
- localStorage の**キーが 1 つ**で、セッション id を含まない
- `status` が `ok` 以外のとき画面へフォールバックする（4 つとも）
- 更新が既存の `REFRESH_INTERVAL_MS` を共有している（独自の定数を持たない）
- `kind: "unknown"` の行が**描画される**（無視されない）
- **`TranscriptView.truncated`** のとき「これより前は出せない」を出す（履歴の頭）
- **`TranscriptRow.clipped`** のとき、その行の末尾に「切り詰めた」印を出す（行ごと）
- この 2 つが**取り違えられていない**こと

`test/server/backends/remoteHost/` にハンドラの spec。`clearedTranscripts` にマークがあるとき
「transcript は無い」と答えることを固定する — ここが抜けると #1085 の違反が黙って通る。

## やらないこと

- **ページング** — `uuid` / `parentUuid` でカーソルは作れるが、最新 250 行で打ち切る
- **sub agent のドリルダウン** — `toolUseId` で結合できるが作らない
- **claude 以外** — codex は rollout、grok / muse は未パース（`session-reads.ts:268`）
- **compaction の `summary` レコード** — 素通し
- **デスクトップ側のビュー** — スマホだけ

## 先行作業との衝突

**PR #1749 は 2026-08-16 にマージ済み**（`2ff3b626`）。`server/session/prompt-history.ts` と
`src/components/PromptsPane.vue` が main に入っているので、下記「既知の欠落」が言及している
PromptsPane は**もう存在する**。この計画は `session-reads.ts` を触らないので衝突は無い。

着手前の衝突確認と負荷確認は CLAUDE.md の規則どおり。

## ついでに見つかった別件（この計画では直さない）

3 件とも #1751 に詳細を書いた。ここでは計画に効くものだけ:

- **`pane_current_command` は claude の場合バージョン文字列**（`2.1.233`）なので
  `agentFromPaneCommand` の表に無く `?? "shell"` に落ちる。つまり再起動を跨いだ claude
  セッションは `agent: "shell"` と報告される。**決定 6 で agent 種別を使わない理由がこれ**
- `SCREEN_HISTORY_ROWS = 300`（mulmoserver#139）が claude セルに効いていない
- **remote-host のコマンドハンドラは `sessionId` を「空でない文字列」としか見ていない**
  （`terminalSession.ts:57-58`）。HTTP ルート側は `SESSION_ID_RE` を使っているのに、
  こちらは使っていない。既存のハンドラは id を tmux に渡すだけなので今は無害だが、
  **パスやコマンドに使うハンドラが 1 つ増えるたびに穴になる**。#1751 に記録した
- `clearedTranscripts` のマークは tmux が生きたまま pty だけ死んだ場合に捨てられない
  （`pty-exit.ts:26`）。repo 全体の性質で、既存 4 読み手が同じ性質を共有している
