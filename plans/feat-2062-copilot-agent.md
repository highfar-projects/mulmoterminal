# feat: GitHub Copilot CLI を6つ目の first-class agent として載せる

Issue: #2062 / 判定基準: `docs/agent-capability-matrix.md` (#2056) / 調査と実測: #2061

## なぜ載せられると判断したか（すべて実機で測った）

`copilot` 1.0.83 / macOS に対して測定。**claude と同型**で、codex/agy/muse が必要とする仕掛けが要らない。

| 測ったこと | 結果 |
|---|---|
| `--session-id <uuid>` | **新規セッションの UUID を設定する。** 渡した UUID で `~/.copilot/session-state/<uuid>/` が生成された → id は我々のもの。watcher も conversation map も不要 |
| hooks | `sessionStart` / `userPromptSubmitted` / `preToolUse` / `postToolUse` / `permissionRequest` / `agentStop` / `sessionEnd` が1ターンで発火 |
| hook payload | 全イベントが `sessionId` / `timestamp` / `cwd`。`agentStop` は `transcriptPath` + `stopReason`、`userPromptSubmitted` は `prompt`、`preToolUse` は `toolName` + `toolArgs`、`postToolUse` は + `toolResult` |
| `--additional-mcp-config <json>` | パースされ、`mt` サーバーが `{"tools":["*"],"type":"http","url":…}` として登録され、接続を試みた（ログで確認）→ **claude の `--mcp-config` と同じ形** |
| `--allow-all-tools` | あり（env `COPILOT_ALLOW_ALL`） |
| `~/.copilot/session-store.db` | `sessions(id, cwd, summary, updated_at)` / `turns(session_id, turn_index, user_message, assistant_response)` / `assistant_usage_events(session_id, model, input_tokens, output_tokens, cache_*_tokens)` |

### ドキュメントと食い違った3点（設計を決めた）

1. **hooks はユーザースコープからしか読まれない。** `$COPILOT_HOME/hooks/*.json` は発火。作業ディレクトリの `.github/hooks/*.json` も `.github/copilot/settings.json` の `hooks` ブロックも発火せず、`--log-level all` でも hooks サブシステムは両者について何も記録しない。
   → **claude のような per-spawn の `--settings` が無い。** グローバルに1枚書き、payload の `sessionId` で照合する。
2. **`type: "http"` のフックは発火しない。** `type: "command"` なら毎回発火する。→ curl でシェルアウトする。
3. **`permissionRequest` は「ブロックされた」信号ではない。** `--allow-all-tools` を付けて誰も聞かれていないターンでも `postToolUse` の 8ms 前に発火した。→ **tier 3a はこの PR に入れない**（別 issue）。

## このPRのスコープ

**入れる**: 起動 / resume / 状態表示と通知 / ツール履歴 / GUI MCP / 会話一覧。
**入れない**: tier 3a（入力待ち）、トークン・ctx バッジ、rate limit、draft injection、customAgents。
バッジは `assistant_usage_events` から取れることまで分かっているので、直後の follow-up にする。

## 設計

### 1. hooks はグローバル1枚（この agent だけの形）

`~/.copilot/hooks/mulmoterminal.json` を**起動時に書く**。claude のように spawn ごとではない。

```json
{ "version": 1, "hooks": { "<copilot event>": [{ "type": "command",
  "bash": "curl -s -X POST http://127.0.0.1:<port>/api/hook -H 'content-type: application/json' -H 'x-mt-agent: copilot' -H 'x-mt-hook: <event>' -d @- >/dev/null 2>&1",
  "powershell": "<同等>", "timeoutSec": 5 }] } }
```

- **イベント名はヘッダで運ぶ。** payload は `hookName` を常には持たない（`permissionRequest` は持つが `agentStop` は持たない）ので、登録側が知っている名前を渡す。
- **セッション id は payload の `sessionId`。** グローバルなので `x-mt-session` は使えないが、`--session-id` で我々が採番しているので payload の id がそのまま我々の id になる。
- サーバー側は `x-mt-agent: copilot` を見て、copilot のイベント名と欄名を claude のものへ写像してから既存の fan-out に流す。写像は純関数（`server/agents/copilot-hook.ts`）。

| copilot | claude | 効果 |
|---|---|---|
| `userPromptSubmitted` | `UserPromptSubmit` | working=true、ヘッダのプロンプト |
| `agentStop` | `Stop` | working=false、注目フラグ、通知音、push |
| `sessionStart` | `SessionStart` | ヘッダのリセット |
| `preToolUse` / `postToolUse` / `postToolUseFailure` | 同名 | ツール履歴と work phase |
| `notification` | `Notification` | （まだ発火を観測していない。写像だけ置く） |

**既知の限界**: グローバルなので、ユーザーが素の端末で起動した copilot からもフックが飛ぶ。未知の `sessionId` はサーバーが無視するだけ。また **2つのインスタンスが別ポートで動くと、後から書いた方が勝つ**。どちらも PR に明記する。フックは静かに失敗させる（`>/dev/null 2>&1`、`timeoutSec: 5`）。

**`COPILOT_HOME` を使ってセッション単位に寄せないこと** — config ディレクトリごと移動するので `session-state/` も動き、会話一覧が壊れる（codex の `CODEX_HOME` と同じ罠）。

### 2. argv

```
copilot --session-id <uuid>            # 新規も再接続も同じフラグ。id は我々のもの
  --allow-all-tools                    # セルは modal に答えられない
  --additional-mcp-config <json>       # GUI MCP（workspace セル）
  [--model <COPILOT_MODEL>]
  [--interactive <seed>]               # collection action / background chat
```

- `-p/--prompt` は**使わない**: プロンプトを実行して**終了する**のでセルが死ぬ。
- `--resume` も**使わない**: あれは対話的なピッカーで、プロンプトと併用すると
  `--session-id` を指すエラーになる。どちらも spec で固定してある。

### 3. 触るファイル

`docs/agent-capability-matrix.md` の「What adding one touches」に従う。

- **agent 固有**: `server/agents/copilot.ts` / `copilot-args.ts` / `copilot-hook.ts`（写像、純） / `copilot-hooks-file.ts`（フック JSON の生成と設置） / `copilot-sessions.ts`（`session-store.db` から会話一覧） / `server/session/spawn-copilot.ts`
- **型付きリスト**: `server/agents/types.ts`(`AgentKind`) / `registry.ts` / `common/sessionAgent.ts` / `launchAgent.ts` / `agentSessionList.ts` / `guiMcpAgents.ts`(**`FULL_GUI_MCP_AGENTS` に入れる**) / `server/session/spawners.ts` / `spawn-deps.ts`
- **共有配線**: `server/routes/terminal-ws-path.ts` / `routeParams.ts` / `ws-routes.ts` / `app-routes.ts` / `plugin-routes.ts` / `session-routes.ts` / `hook-routes.ts` / `server/index.ts` / `server/session/survivor-agent-guard.ts`(証拠 = `session-state/<id>/` の存在) / `background-chat.ts`
- **UI**: `src/components/agentPicker.ts` / `wsUrl.ts` / `gridTabs.ts` / `GridView.vue` / `AgentMark.vue` / `modelBadge.ts`
- **ドキュメント**: README（agent 節 / env 表 / picker 列挙）、`docs/agent-capability-matrix.md` に6列目

## 検証

- `yarn format` / `lint` / `typecheck` / `build` / `test`
- 新規 spec: argv ビルダー、hook 写像（copilot の実ペイロードを固定値として入れる）、フック JSON の生成
- **実機**: セルで copilot を起動 → プロンプト → ドットが working になる → 完了で通知音 → リロードで resume → GUI パネルのツールが動く。スクリーンショットを PR に添える
