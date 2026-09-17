# #2112 会話ログを整形して読む右ペイン（上スクロールでセッション先頭まで）

ブラウザで会話を追う手段が、いまはターミナルのスクロールバックしか無い。claude セルは
alt screen なので tmux に履歴が残らず、読むものは ANSI 付きの生の画面になる。スマホには
専用の会話ビューがあるが（#1275 → #1751）、ブラウザには無い。

## すでに在るもの

畳む処理（JSONL → ターン）は `server/session/transcript-view.ts` に在り、reader は
`transcript-view-read.ts` が claude / codex / cursor / copilot の4つを持つ。出口が
remoteHost の socket（`server/index.ts` の `captureTerminalTranscript`）だけで、HTTP ルートも
ブラウザ側の描画も無い。**畳む処理は作らない。繋ぐのと、遡れるようにするのが本題。**

## 足りないのはページング

`readWindow`（`transcript-view-read.ts`）は末尾から `DEFAULT_TRANSCRIPT_WINDOW.tailBytes` を読む
片道で、`TRANSCRIPT_LINE_BUDGET` を超えたぶんは `evictOldestTurns` が古い方から捨てる。
#1751 が「ページングはやらない」と明示的に決めた箇所。

### カーソルは「**画面に出た**一番古いターンの開始バイト」でなければならない

窓 `[from, before)` を畳むと、budget 超過ぶんは**古い方から**捨てられる。捨てられたターンは
`from` と「残った一番古いターン」の間に居るので、次のカーソルを `from` にすると**その間が飛ぶ**。

`forEachJsonlRecordIn`（`server/infra/jsonl-file.ts`）は内部で行頭オフセットを数えていて最後の値
しか返さないので、`onRecord` に行頭オフセットを渡す（第2引数。既存の呼び出しは無変更）。

**どのレコードがターンを開いたか**は、fold の外から数では判らない — 同じ1レコードで「1つ開き、
1つ捨てられる」と `turns.length` が動かない。**末尾ターンの同一性**で見る: eviction は先頭からしか
shift しないので、`scan.turns.at(-1)` が別オブジェクトに変わったときだけ「開いた」。
これを `trackTurnStarts`（`transcript-view.ts`、ジェネリック）に閉じ込め、ファイル系と copilot の
両方が同じ1つの実装に乗る。

### 読み口は1本にする

`sessionTranscriptView` を `sessionTranscriptPage(cwd, id, before)` の薄い wrapper にする。
スマホは `before: null` で呼んでカーソルを捨てるだけ。**2本目の reader を作らない**のが要点で、
畳む規則・budget・バイト上限・`/clear` の扱いが2箇所に分かれるのを防ぐ。

| 対象 | カーソル | ページの読み方 |
|---|---|---|
| claude / codex / cursor | 行頭バイトオフセット | 窓 `[max(0, end-tail), end)`。境界が無ければ既存の規則で窓を倍に広げる |
| copilot | `turn_index` | `WHERE turn_index < ?`（`listCopilotTurns` に `before` を足す） |

wire 上は不透明な文字列 `"<kind>:<n>"`。クライアントは受け取ったものをそのまま返す。
kind が選ばれた source と食い違うカーソルは 400。

`older` は「画面に出た一番古いターンの開始位置」。手前に何も無ければ `null` = 先頭に到達。
ファイル系で手前にターンが無いことは有り得るので、その場合は**空ページ＋`older: null`** が
返って止まる。

### 実装中に見つかった落とし穴: 前から削る規則は **2 つ**ある

「budget が古い方から捨てる」だけでは足りなかった。`transcriptViewOf` の `withinByteCap` が
**fold のあとでさらに前から捨てる**（`TRANSCRIPT_MAX_BYTES` に収まるぶんだけ残す）ので、scan の
最古を指すカーソルは**バイト上限で落ちたターンを丸ごと飛ばす**。しかも歩き切れば先頭にはきちんと
到達するので、どこにも「落ちた」とは出ない。

本物の transcript を端から歩いて初めて出た（ある 8.9MB のファイルで 31 ターン中 8 つが到達不能）。
カーソルは **view が実際に返したターンの最古**から取る。ファイル系と copilot で規則が分かれない
よう、`pageOf` 1 箇所で決める。

## クライアント

- `RIGHT_PANES` に `"transcript"` を足す（`src/components/gridCell.ts`）。localStorage の復元も
  この配列から導出されているので、足すだけで復元まで届く
- `TranscriptPane.vue` — Tools / Prompts と同じ枠・同じ `expanded` 契約。アイコンは **`chat`**
  （当初は `forum` を予定していたが、同じヘッダの round-table メニューが既に使っていて #2004 の
  衝突そのものだった。ヘッダの「全ボタンのグリフが一意」spec が止めた）
- **上スクロールでの位置補正が機能の本体**。prepend の前後で `scrollHeight` の差を
  `scrollTop` に足す。これが無いと引っ張るたびに読んでいた場所を見失い、機能として使えない
- **ライブ追従はしない**。開いた時点のスナップショット＋手動の再読み込み

### 描画

`user` は打った文字そのものなので整形せず折り返すだけ。`tool` は等幅＋`clipped` の印。

**`assistant` は Markdown をレンダリングする**（見出し・リスト・表・コードブロック）。初版は
「本文とフェンスに分けるだけ・インライン装飾は文字のまま」で出したが、実機で表が生のパイプで
出るのを見てユーザーが md viewer を要求した。`MarkdownProse.vue` に閉じ込め、**受け取るのは
markdown だけ・HTML は受け取らない**形にして、marked → DOMPurify を通す。`v-html` はグローバル
規則の明示的な例外で、`WikiProse.vue` が LLM 生成テキストに対して既に取っている形に合わせた。

`common/codeBlocks.ts` の `markdownSegments` は、その初版のために足したもの。ペインは使わなく
なったが、`fencedBlocks` が同じ走査を別に持っていたのを**1 本に寄せた**ぶんは残っている
（挙動保存の主張なので、差分ハーネスで確かめた）。

## 触るファイル

| ファイル | 何を |
|---|---|
| `common/transcriptView.ts` | 新規。`TranscriptRow` / `TranscriptTurn` / `TranscriptView` / `TranscriptPage` を server から移す（両側が判断する wire 型） |
| `common/codeBlocks.ts` | `markdownSegments` を足し、`fencedBlocks` を載せ替え |
| `server/infra/jsonl-file.ts` | `onRecord` に行頭オフセット |
| `server/session/transcript-view.ts` | `trackTurnStarts` |
| `server/session/transcript-view-read.ts` | `sessionTranscriptPage` / `readPage` / カーソル |
| `server/session/transcript-view-copilot.ts` | 行単位の fold を出す |
| `server/agents/copilot-sessions.ts` | `listCopilotTurns` に `before` |
| `server/routes/session-routes.ts` | `GET /api/transcript/view` |
| `src/components/gridCell.ts` / `CellChromeButtons.vue` / `cellChromeBinding.ts` / `CellShell.vue` / `TerminalGrid.vue` | ペインの配線 |
| `src/components/TranscriptPane.vue` | 新規 |

## テスト

- `forEachJsonlRecordIn` が渡すオフセットが行頭であること（マルチバイト行を含む）
- 2ページが**隙間なく重複なく**繋がること — 1ファイルを全ページ読み切ったターン列が、
  同じファイルを budget 無しで畳んだターン列と一致する
- eviction が起きた窓で、カーソルが `from` ではなく「残った一番古いターン」を指すこと
- **バイト上限**でターンが落ちた窓でも、カーソルがその落ちたぶんを飛ばさないこと（上の落とし穴）
- 先頭到達で `older: null`
- 不正なカーソルが 400
- copilot の `before` ページング
- `markdownSegments` の差分ハーネス（生成入力・旧実装と全結果比較）
- `TranscriptPane` の prepend でスクロール位置が保たれること

## やらないこと

- 過去セッションへの連結・切替（#2112 の決定2）
- ライブ追従
- reader の無いエージェント（#1822 の決定待ち）
- 検索 / エクスポート / インライン Markdown
