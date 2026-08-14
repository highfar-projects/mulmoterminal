# push 通知の本文が、ユーザー自身のプロンプトになる (#1696)

**状態**: 実装対象。原因はフックの実ペイロードを取って確定させた。

---

## 症状

スマホの push 通知の本文が、直前に自分が入力したプロンプトそのものになる。`finished` でも
`waiting` でも起きる、と外部から報告された (#1696)。

## 本文はどう決まっているか

```
server/session/taskPushRules.ts
  buildPushDetail = reply || lastPrompt || aiTitle || ""

server/session/activity-hook.ts
  finished: detail || "タスクが完了しました"
  waiting:  message || detail || "入力待ちです"
```

`reply` が取れず `message` も空なら、**必ず** `lastPrompt` = ユーザー自身のプロンプトが本文に
なる。これは push 機能の初版からある設計で、#1666 とは無関係。

## 実ペイロードで分かったこと (claude 2.1.232)

使い捨ての claude セッションを立て、フックの POST 先を専用リスナーに向けて生のまま記録した。

**Stop** は応答そのものを持っている。

```json
{ "hook_event_name": "Stop", "last_assistant_message": "ok",
  "session_id": "…", "cwd": "…", "permission_mode": "default", "stop_hook_active": false }
```

**Notification** は `message` を持っている(許可ダイアログ / AskUserQuestion とも同じ)。

```json
{ "hook_event_name": "Notification", "message": "Claude needs your permission",
  "notification_type": "permission_prompt" }
```

そして `last_assistant_message` は、この repo のどこからも読まれていなかった
(`server/` `common/` `src/` `test/` で参照 0)。**手渡されている答えを捨てて、transcript を
自力で tail 読みしている**、というのが現状。

## reply が取れない割合(手元の実測)

| 測り方 | 取れない割合 |
|---|---|
| ファイル末尾 (600 本) | 7.0% |
| ターン境界ごと・tail 読み (1088 境界) | 6.5% |
| ターン境界ごと・全文読み (540 境界) | 13.5% |

取れなかった 73 件のうち 42 件は、プロンプトの後に assistant の散文が 1 つも無いターン
(ESC 中断・ツール呼び出しだけで終了)。**読みの失敗ではなく、応答が存在しない**。

報告者の「ほぼ毎回」はこの数字では説明できない。ただし **`/clear` したセッションは別**で、
そちらは毎回になる（下記）。

## `/clear` の後は、毎回プロンプトになる

`notifyTaskFinished` は `clearedTranscripts.has(id)` のとき transcript を読まない (#1085 —
`/clear` 後の `${id}.jsonl` は、ユーザーが終わらせた会話で凍結されているため)。そしてこの印は
**そのファイルが伸びるまで消えない**。`/clear` すると claude は別ファイルに書くので、印は
実質ずっと残る。つまり **一度 `/clear` したセッションは、以後すべての `finished` push が
`lastPrompt` に落ちる**。

`last_assistant_message` はライブのイベントが持つ値なので、凍結された transcript とは無関係に
正しい。この経路はそこも直る。

## 変更

1. **`finished` の本文は Stop の `last_assistant_message` から取る。**
   `hookFields()` に 1 フィールド足し、`notifyTaskFinished` まで運ぶ。取れないとき(古い
   Claude Code / codex)は今までどおり transcript 読みにフォールバック。
   - フック由来の値は `cwd` も `clearedTranscripts` も**問わない**。ファイルではなく
     イベントが持っている値なので、凍結の理屈が当てはまらない。
2. **`lastPrompt` をフォールバックの連鎖から外す。**
   `buildPushDetail` は `reply || aiTitle || ""` になる。頻度に関係なく症状が消える。

## 変えないこと

- transcript 読み (`claudeCurrentTurnReply`) は残す。古い Claude Code には
  `last_assistant_message` が無く、codex はそもそもフックを持たない。
- `waiting` の `message` 優先はそのまま。実測で `message` は来ている。
- `aiTitle` は残す。「そのセッションが何の話か」は、プロンプトの読み返しとは違って通知として
  意味がある。

## 未確認

- 報告者の claude 2.1.223 に `last_assistant_message` があるか。無ければフォールバック側で
  従来どおり動く。
- `idle_prompt` の Notification は 150 秒放置しても発火せず、ペイロードを捕まえられていない。
  この型が `message` を持つかは不明。
