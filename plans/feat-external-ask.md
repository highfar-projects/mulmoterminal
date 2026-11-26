# 外のプロセスからセッションに依頼を送り、返事を受け取る口（fork のみ）

2026-11-26。edgar（同じ PC で常駐する Go 製の秘書ボット、highfar-projects/edgar）が、竹内さんの承認を経た依頼を担当クローンのセッションに送り、その返事を自分の画面に戻すための口。

## なぜ新しい口か

既存の口は、どれも「外の、名前のあるプログラム」を相手にしていない。

- `POST /api/terminal/:id/reply`（ボードの返信欄、#3185）は、どのセッションにも打ち込める。ただし、呼び出し元を確かめない。Origin が無いローカルの呼び出しも、localhost のどのポートのページも通る。見るのは質問ダイアログだけで、承認待ちの確認（permission prompt）は見ない。その上に Enter が乗ると、確認への答えになってしまう。
- MCP の `sendToSession` / `waitForSessionReply`（#3404）は、呼び出したエージェントが自分で起こしたセッションにしか届かない。返事は「最後に終わった 1 回」だけを見る。送った内容はメモリにしか無く、再起動で消える。
- セッションの一覧を返す HTTP の口が無い。`/api/activity` と `/api/sessions/live` は、渡した ID について答えるだけ。

既存の口は変えていない。

## 決めたこと

| 点 | 決定 | 理由 |
|---|---|---|
| 長い依頼文 | 改行を空白にした 1 段落で、`SEND_MAX_CHARS`（3960 字）まで | 既存の送信部品（`sendToSession` / `sanitizeTerminalInput`）をそのまま使える。ファイル経由にすると、作業フォルダの外を読む許可確認でセッションが止まりうる |
| 作業中のセッションへの送信 | `busy` で断る。edgar が後で送り直す | 作業中に打ち込むと今の回に混ざり、返事の切れ目が無くなる |
| 宛先の制限 | 作業フォルダの許可リスト（その下も含む）。機能は初期状態で off | セッション ID は開き直すと変わるが、フォルダは変わらない |
| 置き場所 | fork のみ。新しいファイルにまとめ、`app-routes.ts` には import 1 行と呼び出し 1 行だけ | upstream 同期でのぶつかりを最小にする。MulmoClaude に相当する機能は無い |
| 設定の置き場所 | `config.json` のキーではなく、専用の `~/.mulmoterminal/external-ask.json` | 同じ理由。`app-config.ts` に足したキーは、upstream 同期のたびにぶつかる |

## 口の仕様

すべてに共通する決まり:

- `Authorization: Bearer <~/.mulmoterminal/external-ask-token の中身>` が必要。
- `Origin` ヘッダーが付いた要求は断る。ブラウザのページからは使えない。
- アプリ全体にかかる Host の確認と same-origin の確認（`request-gates.ts`）は、これまでどおり先に効く。
- エラーの形は `{ "error": "<コード>", "message": "<英語の説明>" }`。日本語の表示は、edgar がコードから作る。

### `GET /api/external/sessions` — 宛先の一覧

このプロセスに生きている端末があるセッションを返す。

```json
{ "sessions": [ { "id": "…", "agent": "claude", "cwd": "D:\\…\\clone-a", "branch": "main",
  "memo": "見積もり担当", "title": "…", "working": false, "waiting": false,
  "questionOpen": false, "permissionPending": false, "allowed": true, "replyReadable": true } ] }
```

### `POST /api/external/sessions/:sessionId/asks` — 依頼を送る

- 要求: `{ "text": "...", "expectCwd": "D:\\…\\clone-a" }`
- 送る文字列: 末尾に ` [<label> <askId>]` を付けて打ち込む。`askId` は 12 桁の 16 進数。
- 成功: `202 { "askId", "session", "cwd", "sentText" }`。`202` は「Enter まで送った」の意味。
- 判定の順: token → 有効か → 本文 → セッションが生きているか → `expectCwd` と一致するか → 許可リスト → 返事を読めるエージェントか → 承認待ち / 質問ダイアログ → 作業中か。
- 承認待ちと質問ダイアログは、貼り付けの前と Enter の前にも、もう一度確かめる。

### `GET /api/external/sessions/:sessionId/asks/:askId?waitSeconds=N` — 返事を待つ

- 長めのポーリング。`waitSeconds` は既定 30、最大 120、0 で即答。サーバーは 3 秒ごとに読む。
- `200 { "status": "answered", "reply": "..." }`
- `200 { "status": "pending", "seen": true|false, "working": bool }`
  - `seen` は「タグ付きの依頼文がもうログにあるか」。

### エラー

| HTTP | error | いつ |
|---|---|---|
| 400 | `invalid-request` | ID の形が違う、`text` が空、`expectCwd` が絶対パスでない |
| 401 | `unauthorized` | token が無い、または違う |
| 403 | `disabled` | 機能が off |
| 403 | `origin-not-allowed` | Origin が付いている |
| 403 | `target-not-allowed` | 許可リストの外 |
| 404 | `no-session` | 生きている端末が無い / 知らないセッション |
| 409 | `target-changed` | 今の作業フォルダが `expectCwd` と違う |
| 409 | `permission-pending` / `question-open` | 承認待ち / 質問ダイアログが開いている。何も送っていない |
| 409 | `busy` | エージェントが作業中 |
| 409 | `typed-not-submitted` | Enter の前にダイアログが開いた。文は入力欄に残っている。`askId` も返す |
| 413 | `text-too-long` | 3960 字を超えた |
| 410 | `session-ended` | 待っている間にセッションが終わった |
| 410 | `conversation-cleared` | 会話が `/clear` されて読めない |
| 422 | `unsupported-agent` | shell や muse など、返事を読めないエージェント |
| 502 | `send-failed` | 打ち込みそのものに失敗した |
| 500 | `read-failed` | 返事の読み取りに失敗した |

## 返事の見つけ方

サーバーは状態を持たない。タグがログ（transcript）に残っているので、再起動の後でも同じ問い合わせで返事を取れる。

1. 最後に終わった回（`sessionLastTurn`）の依頼文にタグがあれば、その回の最終回答を返す。
2. 無ければ、`sessionTranscriptPage` で最大 4 ページさかのぼり、タグ付きの回を探す。
   - その回が終わっていれば（`completedCount` より前なら）、その回の最後のアシスタント文を返す。
   - 竹内さんが同じセッションで後から話しかけていても、返事を取り違えない。
3. 見つからなければ `pending`。

照合の部品は既存の `relay-range.ts`（`relayTurnOf` / `completedCount`）を使った。

## 出どころの記録

- 画面と transcript: 依頼文の末尾に `[edgar <askId>]` が残る（`label` で名前を変えられる）。
- サーバー: 送るたびに `~/.mulmoterminal/external-asks.jsonl` に 1 行書く（日時、label、askId、セッション、作業フォルダ、文字数）。

## 設定

`~/.mulmoterminal/external-ask.json`:

```json
{ "enabled": true, "allowDirs": ["D:/Users/MTakeuchi/Documents/clients"], "label": "edgar" }
```

- 要求のたびに読み直すので、再起動は要らない。
- 読めない、または壊れているときは off になる（ログに警告を出す）。
- token は、機能が on の状態で起動したとき、または on になってから最初の要求のときに作られる。

## ファイル

- `server/routes/externalAsk.ts` — 判定だけ（設定、許可リスト、token、要求、待ち時間、返事の判定）
- `server/routes/external-ask-routes.ts` — 3 本のルート
- `server/routes/external-ask-wiring.ts` — このホストの実データへの接続
- `server/config/external-ask-files.ts` — 設定・token・送信記録のファイル
- `server/session/transcript/external-ask-read.ts` — さかのぼり読み
- `test/server/routes/externalAsk.spec.ts`、`test/server/routes/external-ask-routes.spec.ts`
- `scripts/external-ask.mjs` — 手で試すための小さなクライアント。`--list` で宛先の一覧、`<session-id> <expected-cwd> "<text>"` で依頼を送って返事を表示する。待つのは `--max-wait` 秒（既定 540）までで、終わらなければ終了コード 2 と askId を出し、`<session-id> --wait <askId>` で待ち直せる。Git Bash から POSIX のパスを渡すときは `MSYS_NO_PATHCONV=1` が要る

## 確かめたこと

- spec 37 件が通る。lint と、サーバー側の型検査が通る。
- 一時 HOME で起動した実サーバーで、次の応答を確認した: off の `403 disabled`、token 無しで `401`（このとき token が作られる）、token 違いで `401`、正しい token で一覧 `200`、Origin 付きで `403 origin-not-allowed`、Host 違いで `403`（既存の Host の確認）、存在しないセッションで `404`、`expectCwd` が無いと `400`。

## まだ確かめていないこと / 残り

- 実際の claude セッションに送って返事を受け取る、通しの確認。一時 HOME のサーバーには claude のログイン情報が無いため、本番の MulmoTerminal に入れてから確かめる。
- claude 以外のエージェントで、さかのぼり読みが効くか。最後の回だけの読み取りは、claude 以外でも効く。
- `POST /api/terminal/:id/reply` が承認待ちを見ていない点は、別の小さな直しとして出す（今回は既存の口に触れていない）。
- `mulmoterminal-config` スキルからこの設定ファイルを案内するかは未定。fork のみの機能なので、今はこの plan が説明の置き場所。
