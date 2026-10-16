# refactor: code scanning の duplicate-code アラート 3 件を共有化で解消する (#3069)

`duplication-scan`（jscpd 5.0.12）の open アラートは 3 件。SARIF は片側の位置しか持たないので、
対は CI と同じ引数でのローカル実行で特定する（`plans/refactor-jscpd-duplicates-1678.md` と同じ手順）。

| alert | 片側 | 対 |
| --- | --- | --- |
| 227 | `src/components/cpuHeat/HeatKettle.vue` | `src/components/cpuHeat/HeatSumoWrestler.vue` |
| 228 | `server/agents/rate-limit/rate-limit-service.ts` | `server/agents/token/token-rotation-service.ts` |
| 230 | `server/backends/files/fileChange.ts` | `server/backends/plugins/mulmoscriptWatch.ts` |

## 227 — 体のグラデーション

両者とも `cx="40%" cy="35%" r="75%"` の `radialGradient` に `palette.bodyStops` の 3 色を置いている。
`HeatBodyGradient.vue`（`id` と `stops` を受ける）に切り出す。中心位置の違う `HeatBomb` /
`HeatBalloon` は対象外（警告に出ておらず、props を増やすと範囲が広がる）。

検証: 旧ファイルを一時的に並べ、テーマ × 段階 × 動き（やかん）、テーマ × 構え × fierce（力士）で
描画 HTML を比較して一致。グラデーション値を変えると比較が赤になることも確認。

## 228 — 型の書き写し

`RateLimitService` が `TokenRotationRuntime` の 5 メンバーを書き写していた。
`RateLimitRouteDeps & Omit<TokenRotationRuntime, "meters">` で導出する。型のみの変更。

## 230 — 購読に合わせた監視の開始・停止

`onSubscriptionChange` で start/stop し、返す関数で購読解除と `stopAll` をする 9 行が両方にある。
`fileChange.ts`（`SubscriptionSource` の定義元で、`mulmoscriptWatch.ts` は既にここから import している）に
`watchWhileSubscribed()` として置く。

既存 spec は停止側（`stopListening` / `stopAll`）を消しても緑だったので、
`test/server/backends/files/fileChange.spec.ts` にこの関数の spec を足す。4 つの判断それぞれを壊すと赤になる。
