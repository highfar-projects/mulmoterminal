# feat: 拡大中のセルに「自分が出した命令」の履歴を出す右パネル

issue: #1748

## きっかけ

セルを並べて走らせていると、**自分がどのセルに何を頼んだのかが分からなくなる**（オーナー、2026-08-16）。

思い出す手掛かりは 3 つあるが、どれも 1 件ぶんしか答えない。

- セルヘッダのタスク行 = `lastPrompts`（`server/session/registry.ts:80`）— **最新 1 件だけ**
- Activity タイムライン（`src/components/TimelineOverlay.vue` / `GET /api/transcript/timeline`）—
  **エージェントが動かしたツール**の履歴であって、こちらが出した命令ではない
- ロスターの返信行 — **エージェントが言ったこと**

「自分が出した命令」を並べて見る場所がどこにも無い。

## 決まったこと（オーナー確認済み）

| | 決定 |
|---|---|
| スコープ | **拡大中のセル 1 本**（グローバル横断ではない） |
| 置き場所 | **右パネルのみ**（ツールバーの全画面オーバーレイは作らない） |
| 行の操作 | **読むだけ**（ジャンプ・コピー・再送はやらない） |
| 対象エージェント | **claude と codex** |
| データ源 | **claude = `~/.claude/history.jsonl`、codex = rollout の `user_message`** |

## データ源をなぜ transcript にしないか（実測）

この issue を書いたセッション自身（`02652163-…`）で計測した。

| | `~/.claude/history.jsonl` | transcript の `type:"user"` |
|---|---|---|
| 通常の 1 通目 | 11:31:02.**300** | 11:31:02.**318**（+18ms） |
| **ターン実行中に割り込んだ 2 通目** | 記録あり（11:31:25.403） | **`type:"user"` として存在しない**（`queue-operation` / `attachment` になる） |
| skill 本体として注入されたテキスト | 入らない | **`type:"user"` として入る**（`userPromptText()` の注入判定にも掛からない） |

つまり **「transcript だと遅れる」は実質問題にならない（18ms）。効くのは中身のほう。**
transcript は ①**作業中に横から出した指示**を丸ごと落とし、②ハーネスが差し込んだ本文を拾う。
①はこの機能が一番拾いたいものなので、transcript は目的に対して不適。

`~/.claude/history.jsonl` は Claude Code が「プロンプト欄に人間がタイプしたもの」だけを
1 行 1 件で追記しているファイル。この開発機で **2025-10-02 以降 31,510 件 / 8.1MB**。

```json
{"display":"…本文…","pastedContents":{},"timestamp":1786847885862,
 "project":"/Users/…/repo","sessionId":"f3704ca3-…"}
```

`sessionId` は claude のセッション id ＝ このリポジトリがセルに持っている id
（`projectSessionsDir(cwd)/<id>.jsonl` の id）なので、そのまま絞り込める。既存セッションの
過去分も初回から読める。

### 非公開ファイルに依存するリスクの扱い

`history.jsonl` は Claude Code の非公開ファイルで、形式が変わりうる。
このリポジトリは `server/session/project-dir.ts` で既に claude の on-disk 規約を
「upstream を写してテストで固定する」方針を取っているので、同じ扱いにする。

- 行ごとに寛容にパース（`display` が文字列でない行、`sessionId` が無い行は捨てる）
- そのセッションの行が **1 件も取れなかったら transcript 由来にフォールバック**して、
  形式変更で機能が黙って空になるのを防ぐ
- 純関数を `test/` で両方向（正常・異常）固定する

## 変更

### サーバ

**`server/session/prompt-history.ts`（新規・純関数）**

- `PromptEntry { at: number | null; text: string }` — `at` は epoch ms。
  時刻が読めない行を捨てると「命令が消える」ので、時刻のほうを null にする
- `claudeHistoryPrompt(record)` — history.jsonl の 1 レコード → `{sessionId, at, text}` or null
- `claudePromptsFor(records, sessionId, limit)` — 絞り込み → 新しい方から `limit` 件
- `codexPrompts(records, limit)` — rollout の `payload.type === "user_message"` → 同じ形
- 本文は `PROMPT_TEXT_CAP = 1000` 文字で打ち切り（`…` を付ける）。
  ヘッダ用の `LAST_PROMPT_CAP = 200` とは別物 — あれは 1 行に収める用、こちらは読み返す用

相槌（`ok` / `はい`）は**落とさない**。`merge` `続けて` は実際の指示で、`isTrivialPrompt()` は
それらを trivial 扱いにするため、使うと肝心の命令が消える。

**`server/session/project-dir.ts`** に `claudeHistoryFile()` を足す。
「claude が書いたものを見つけるために claude の規約を写す」ファイルなので、ここが持ち場。

**`server/session/session-reads.ts`** に `sessionPrompts(cwd, id, agent)`。
`sessionLastTurn` と同じ形でエージェント分岐し、読みは既存の
`readTailRecords`（`server/infra/jsonl-file.ts`）に乗る — history.jsonl は 8MB あるので
毎回全部読まない。既定の 4MB tail で直近 15,000 件ぶんに届く。

**`server/routes/session-routes.ts`** に `GET /api/transcript/prompts?session=&cwd=&agent=`。
検証は `toolTimeline` / `lastTurn` と同じ（`SESSION_ID_RE` と `workspaceForRoute`）。

### UI

**`src/components/PromptsPane.vue`（新規）** — 新しい順に `時刻 + 本文`。
本文は 3 行でクランプし、`title` に全文。空なら「まだ命令がありません」。

更新は `sessions` チャネルの活動 push で読み直す（同一セッションのみ、デバウンス）。
ペインは開けっ放しにできるので、送った命令がそのまま積み上がって見える。

**配線**（`src/components/cellChromeBinding.ts` が警告している通り、1 箇所でも抜けるとボタンが死ぬ）:

- `src/components/gridCell.ts` — `RightPane` に `"prompts"`、`GridCellEmits` に `"toggle-prompts"`
- `src/components/cellChromeBinding.ts` — `CellChromeEvent` と `toggleForwards`
- `src/components/CellShell.vue` / `CellChromeButtons.vue` — emit 宣言とボタン（アイコン `forum`）
- `src/components/TerminalGrid.vue` — `gridCellEvents` と、パネルの描画

`tools` と同じく**拡大中は常に出す**（セッションの有無で出し分けない）。ToolsPane も同じで、
空表示のほうが「なぜ無いのか」を説明できる。

## テスト

- `test/server/session/prompt-history.spec.ts` — 純関数を両方向で。
  正常 / `display` が文字列でない / `sessionId` 欠落 / 空配列 / 打ち切り / 件数 / codex 形式 /
  壊れたレコード
- `test/src/components/` の chrome 配線 spec は型で固定されているので、union を足せば追随する

## やらないこと

- グローバル横断の一覧（今回のスコープ外。#1748 に選択肢として残してある）
- 行クリックでのジャンプ / 再送
- ツールバーからの全画面表示
