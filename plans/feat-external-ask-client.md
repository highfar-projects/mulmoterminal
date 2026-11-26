# edgar から MulmoTerminal の外部依頼の口を使うための仕様

edgar（Go）側を実装する人に向けた仕様。MulmoTerminal 側の設計と理由は
[`feat-external-ask.md`](feat-external-ask.md) にある。ここには、呼び出し側が守ることと、受け取る形だけを書く。

2026-11-26 時点のもの。本番の MulmoTerminal（fork main `ec4520568` 以降）で、curl を使って通しの動作を確かめた。
edgar のセッションに送った依頼に、約 8 秒で返事が返った。

## 前提

| 項目 | 値 |
|---|---|
| 接続先 | `http://127.0.0.1:34567`（ランチャーの `$Port`）。Host は `127.0.0.1` か `localhost` にする。それ以外の Host は断られる |
| トークン | `~/.mulmoterminal/external-ask-token` の中身（64 桁の 16 進数）。前後の空白を除いて使う |
| 設定 | `~/.mulmoterminal/external-ask.json`（`enabled` / `allowDirs` / `label`）。MulmoTerminal は依頼のたびに読み直す |
| 送信の記録 | MulmoTerminal が、送るたびに `~/.mulmoterminal/external-asks.jsonl` へ 1 行書く |

すべての要求に共通する決まり:

- `Authorization: Bearer <token>` を付ける。
- **`Origin` ヘッダーを付けない。** 付いていると 403 で断られる。Go の `net/http` は自分では付けないので、明示的に足さなければよい。
- 本文は UTF-8 の JSON にし、`Content-Type: application/json` を付ける。
- エラーは `{"error": "<コード>", "message": "<英語の説明>"}` で返る。竹内さんに見せる日本語は、edgar がコードから作る。
  - 例外: JSON として読めない本文を送ると、Express の既定の **HTML** の 400 が返る。本文が JSON でなければ、「要求の形が壊れている」として扱う。

## 流れ

```
1. GET  /api/external/sessions                       宛先の候補を取る
2. 竹内さんが宛先と文面を承認する                     （edgar 側）
3. POST /api/external/sessions/{id}/asks             送る → askId を受け取る
4. GET  /api/external/sessions/{id}/asks/{askId}     answered になるまで待つ
```

## 1. 宛先の一覧

`GET /api/external/sessions`

```json
{
  "sessions": [
    {
      "id": "a1f5c329-3d58-4d2e-8ea2-b88681ffa611",
      "agent": "claude",
      "cwd": "D:\\Users\\MTakeuchi\\workspaces\\edgar",
      "branch": "main",
      "peerName": "edgar-a1",
      "memo": null,
      "title": "エドガー Bot の記憶機能と常駐の整備",
      "working": false,
      "waiting": false,
      "questionOpen": false,
      "permissionPending": false,
      "allowed": true,
      "replyReadable": true
    }
  ]
}
```

| フィールド | 意味 |
|---|---|
| `id` | セッション ID（UUID）。送るときと返事を待つときに使う |
| `agent` | `claude` / `codex` / `shell` など |
| `cwd` | 作業フォルダ。Windows では `\` 区切り。送るときに `expectCwd` としてそのまま返す |
| `branch` | git のブランチ。git でなければ `null` |
| `peerName` | セルのチップに出る名前（例: `cameramonitoringservice-ec`）。竹内さんが画面で見ている名前と同じ。claude 以外のエージェントと、名前が見つからないセッションでは `null`。Claude Code の側で名前が変わることがあるので、宛先を選ぶ手がかりとしてだけ使う |
| `memo` / `title` | 竹内さんが付けたメモと、会話の題。メモが無ければ `null`、題が無ければ空文字 |
| `working` | 作業中。送ると `busy` で断られる |
| `waiting` | 竹内さんの入力を待っている |
| `questionOpen` / `permissionPending` | 質問ダイアログが開いている / 承認待ち。送ると断られる |
| `allowed` | `allowDirs` の中にある。`false` なら送れない |
| `replyReadable` | 返事を読めるエージェントか。`false`（shell / muse）なら送れない |

**送れる候補** は `allowed && replyReadable && !working && !questionOpen && !permissionPending` を満たすもの。
宛先を選ぶ手がかりは `peerName` / `cwd` / `branch` / `memo` / `title`。
竹内さんが「cameramonitoringservice-ec に頼んで」のように名前で言ったときは、`peerName` と照らし合わせる。
ただし送るときは、名前ではなく `id` と `expectCwd` を使う。
一覧に出るのは、MulmoTerminal で端末が開いているセッションだけ。

## 2. 依頼を送る

`POST /api/external/sessions/{id}/asks`

```json
{ "text": "見積もりの前提を3行で教えてください。", "expectCwd": "D:\\Users\\MTakeuchi\\workspaces\\edgar" }
```

- `text`: 打ち込む文。
  - **1 段落にまとめる。** 改行や連続する空白は 1 つの空白に、制御文字は空白に置き換えられる。
  - 置き換えたあとで 3960 字以内。
- `expectCwd`: 一覧で見た `cwd`。宛先のセッションが別のフォルダに移っていたり、別のセッションに替わっていたりしたら送らずに断るために使う。
  - 大文字と小文字、`\` と `/`、末尾の区切りの違いは同じ場所として扱われる。

成功すると **202** が返る。

```json
{
  "askId": "dc8c3b1d075b",
  "session": "a1f5c329-3d58-4d2e-8ea2-b88681ffa611",
  "cwd": "D:\\Users\\MTakeuchi\\workspaces\\edgar",
  "sentText": "見積もりの前提を3行で教えてください。 [edgar dc8c3b1d075b]"
}
```

- 202 は「Enter まで送った」という意味。
- `sentText` は実際に打ち込んだ文で、末尾の ` [<label> <askId>]` が目印になる。
- `askId`（12 桁の 16 進数）は保存しておく。MulmoTerminal は送った依頼の状態を何も持たないので、edgar が再起動したあとも、`id` と `askId` があれば返事を取れる。

**同じ依頼を自動で再送しない。** 202 以外が返ったときに何も打ち込まれていないかどうかは、エラーコードごとに下の表で決まる。

## 3. 返事を待つ

`GET /api/external/sessions/{id}/asks/{askId}?waitSeconds=N`

- 長めのポーリング。
  - サーバーは 3 秒ごとに会話ログを読み、返事が出た時点か、`N` 秒たった時点で答える。
  - `N` は既定 30、最大 120。0 なら、待たずにいまの状態を返す。
- HTTP クライアントのタイムアウトは `N + 15` 秒程度にする。
- 待っている途中で接続を切ってもかまわない。サーバーは読むのをやめるだけ。

返事が出ていれば、次の形で返る。

```json
{ "status": "answered", "reply": "2" }
```

- `reply` は、その依頼で始まった回の最後のアシスタントの文。
- 長さは制限していないので、edgar 側で必要なら切り詰める。

まだのときは、次の形で返る。

```json
{ "status": "pending", "seen": true, "working": true }
```

- `seen`: 目印の付いた依頼文が、もう会話ログに書かれているか。
- `working`: セッションが作業中か。
- 何度でも同じ GET を繰り返してよい。返事が出たあとも、同じ `answered` が返る。

edgar 側の目安:

| 状態 | 扱い |
|---|---|
| `pending` で `seen: true` | 処理中。待ち続ける |
| `pending` で `seen: false` が 1〜2 分以上続く | 依頼文が送信されないまま入力欄に残っている可能性がある。竹内さんに知らせる |
| `pending` が長く続く | 待つ上限（例: 30 分）を edgar 側で決め、超えたら竹内さんに知らせて打ち切る |

竹内さんが後から同じセッションに話しかけていても、目印で探すので返事を取り違えない。
ただし探すのはログの末尾から 4 ページまで。その後に会話がとても長く続くと、`seen: false` のまま見つからなくなる。

## エラーコード

| HTTP | error | 出る場所 | 打ち込まれたか | edgar の扱い |
|---|---|---|---|---|
| 400 | `invalid-request` | 送信 / 待機 | いいえ | edgar のバグ。ID の形、`text` が空、`expectCwd` が絶対パスでない |
| 401 | `unauthorized` | すべて | いいえ | トークンファイルを読み直して 1 回だけ再試行する。だめなら竹内さんに知らせる |
| 403 | `disabled` | すべて | いいえ | 機能が off。設定で `enabled: true` にするよう知らせる |
| 403 | `origin-not-allowed` | すべて | いいえ | edgar のバグ（Origin を付けている） |
| 403 | `target-not-allowed` | 送信 | いいえ | `allowDirs` の外 |
| 404 | `no-session` | 送信 / 待機 | いいえ | セッションが開いていない。一覧を取り直す |
| 409 | `target-changed` | 送信 | いいえ | 宛先の作業フォルダが変わった。一覧を取り直し、竹内さんに承認し直してもらう |
| 409 | `busy` | 送信 | いいえ | 作業中。しばらく後に、承認済みの同じ文で送り直してよい |
| 409 | `permission-pending` / `question-open` | 送信 | いいえ | 竹内さんの操作待ち。知らせて、後で送り直す |
| 409 | `typed-not-submitted` | 送信 | **入力欄に残っている** | Enter を押す前にダイアログが開いた。`askId` も返る。**再送しない。** 竹内さんに知らせる。竹内さんが Enter を押せば、その `askId` で返事を待てる |
| 413 | `text-too-long` | 送信 | いいえ | 3960 字以内に縮める |
| 422 | `unsupported-agent` | 送信 / 待機 | いいえ | shell / muse などで、返事を読めない |
| 410 | `session-ended` | 待機 | 送信済み | 返事の前にセッションが終わった。打ち切る |
| 410 | `conversation-cleared` | 待機 | 送信済み | 会話が `/clear` された。打ち切る |
| 502 | `send-failed` | 送信 | 不明 | 一部が打ち込まれた可能性がある。再送せず、竹内さんに知らせる |
| 500 | `read-failed` | 待機 | 送信済み | 一時的な失敗。少し待って GET を繰り返す |
| 接続できない | — | すべて | — | MulmoTerminal が止まっている、または再起動中。送信の場合は、打ち込まれていない |

## 例（Go の骨組み）

```go
type askResp struct {
    AskID    string `json:"askId"`
    Session  string `json:"session"`
    Cwd      string `json:"cwd"`
    SentText string `json:"sentText"`
}
type waitResp struct {
    Status  string `json:"status"` // "answered" | "pending"
    Reply   string `json:"reply"`
    Seen    bool   `json:"seen"`
    Working bool   `json:"working"`
}
type apiErr struct {
    Error   string `json:"error"`
    Message string `json:"message"`
    AskID   string `json:"askId,omitempty"` // typed-not-submitted のときだけ
}

func (c *MT) do(ctx context.Context, method, path string, body any, out any) (int, *apiErr, error) {
    var r io.Reader
    if body != nil {
        b, _ := json.Marshal(body)
        r = bytes.NewReader(b)
    }
    req, _ := http.NewRequestWithContext(ctx, method, "http://127.0.0.1:34567"+path, r)
    req.Header.Set("Authorization", "Bearer "+c.token) // token は strings.TrimSpace 済み
    if body != nil {
        req.Header.Set("Content-Type", "application/json")
    }
    // Origin は付けない
    res, err := c.http.Do(req)
    if err != nil {
        return 0, nil, err
    }
    defer res.Body.Close()
    data, _ := io.ReadAll(res.Body)
    if res.StatusCode >= 400 {
        var e apiErr
        if json.Unmarshal(data, &e) != nil || e.Error == "" {
            e = apiErr{Error: "bad-response", Message: string(data)}
        }
        return res.StatusCode, &e, nil
    }
    return res.StatusCode, nil, json.Unmarshal(data, out)
}

// 送信: POST /api/external/sessions/{id}/asks  {"text": text, "expectCwd": cwd}  → 202 askResp
// 待機: GET  /api/external/sessions/{id}/asks/{askId}?waitSeconds=60  を answered になるまで繰り返す
//      （クライアントのタイムアウトは 75 秒程度）
```
