# server/index.ts を分割する (#2168)

## いま何が問題か

`server/index.ts` は `max-lines`（600行、コメント・空行を除く）ちょうど。余白ゼロなので、
機能追加のたびに「その PR と関係のない整理」を混ぜないとコード行を1行も足せない。
import を1行ずつ3回に分けている痕跡（`config-routes.js` を3回 import している）がその実物。

## 分割を難しくしていると思われていたもの

issue は `ptys` / `activity` がファイル中に散っていることを障害として挙げている。
実際には**障害ではない**。両方 `server/session/registry.ts` の export であり、
`registry.ts` のヘッダが明言しているとおり「boot モジュールを import せずに import できる」ために
そこに置かれている。したがって新しいモジュールは registry から直接読めばよく、
引数で渡し回す必要も再 export も要らない。

**実際に注入が要るのは index.ts が組み立てるものだけ**:
`spawnClaudePty` / `toolStores` / `pubsub`（HTTP サーバより後にしか存在しない）/ `reap` /
`OUTPUT_BUFFER_LIMIT`。この5つが境界を決める。

## 切り出す単位

boot の**順序は一切変えない**。index.ts に残るのは「順番に何が起きるか」だけで、
各ブロックは1行の呼び出しになる。

| 新ファイル | 中身 | 注入が要るもの |
|---|---|---|
| `server/agents/rate-limit-service.ts` | store / codex 読み取り / claude プローブ一式 | なし（env と AGENT_BINS から直接） |
| `server/infra/legacy-cleanup.ts` | 旧プローブ transcript・旧 sandbox の一度きりの掃除 | なし |
| `server/session/session-lookup.ts` | `agentOfSession` / `cwdOfSession` | なし（registry + tmux） |
| `server/backends/remoteHost/workByCwd.ts` | ディレクトリ単位の作業サマリ解決 | なし（git モジュール） |
| `server/backends/remoteHost/hostSessionList.ts` | 電話に返すセッション一覧 + dir icon | なし |
| `server/backends/remoteHost/hostScreens.ts` | 画面 meta / 画面キャプチャ | `outputBufferLimit` |
| `server/backends/remoteHost/hostBindings.ts` | spawn 系 + launchTerminal + `initRemoteHostBackend` | spawn / toolStores / pubsub |
| `server/backends/feeds-worker.ts` | feeds の AgentWorkerRunner | spawn / retain |
| `server/backends/boot-backends.ts` | pubsub 確定後の backend 初期化列（順序そのもの） | pubsub / spawn / retain |
| `server/session/scheduled-sessions-boot.ts` | 在庫レジストリ + sweep + `spawnScheduledChat` | reap / spawn |
| `server/session/decision-digest-schedule.ts` | decision digest の起動時 + 定期実行 | なし |
| `server/infra/on-listening.ts` | `server.listen` コールバック本体 | server / loopback / origin |

## 検証

- boot ファイルなので「テストが緑」は何も証明しない（CLAUDE.md: *A wide blast radius is
  verified by RUNNING THE APP*）。**実際にサーバを起動して**、listen のログ列が移動前と
  一致すること、`/api/*` が答えること、ターミナルが繋がることを見る。
- 移動前の boot ログを取り、移動後と diff する（外部 ground truth）。
- 併せて `yarn lint` / `yarn typecheck` / `yarn test`。

## やらないこと

- `ptys` / `activity` のアクセサ化。registry が「map を直接 export する」と決めた理由
  （約150箇所の読み書きを getter で包むのは守るべき invariant のない churn）は今も有効。
- boot の順序変更。今回は純粋に「どのファイルに置くか」だけの変更にする。
