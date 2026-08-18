# #1786 — usage ゲージの横にマシンの load average を出す

## 何を作るか

グリッドヘッダの usage ゲージ（`claude 5h 42% 7d 13%`）の右に、サーバーを動かしている
マシンの負荷を **コア数で正規化した %** で 1 トークン足す。

```
claude 5h 42%  7d 13%  │  load 334%
                          ^ hover: Load average 66.84 / 59.88 / 55.24 — 20 cores (3.3x)
```

issue #1786 で確定した決定:

| # | 決定 |
|---|---|
| C | コア数で正規化した %（`load 334%`）。3 値・コア数・倍率は hover の title |
| B | 新規 `GET /api/load` を 10 秒ポーリング。gauge と同じ mount / unmount |
| D | `>= 100%` で `text-amber`、`>= 200%` で `text-err-text` |
| E | グリッドヘッダのみ（`onGridRoute`） |
| 設定 | `showLoadAverage`（既定 true）で消せる |

## 出せないときは「何も描かない」

`os.loadavg()` は **Windows では常に `[0, 0, 0]`**（Node の documented な挙動）。
0% と描くと「アイドル」を意味してしまう — 見えていないだけなのに。`rateLimitGauge.ts` の
最上位ルール（持っていないデータを 0 と描かない）と同じ扱いで、**行ごと出さない**。

判定は **`process.platform === "win32"` で行い、値が 0 かどうかでは行わない**。本当に暇な
mac / Linux は 0.00 を返すので、値で判定すると「正しく 0%」を「不明」に落としてしまう。

## ファイル

| ファイル | 役割 |
|---|---|
| `common/machineLoad.ts` | wire 型 `MachineLoad`、純関数 `machineLoadFrom()`（os を触らない）、クライアント側の `parseMachineLoad()` |
| `server/infra/machine-load.ts` | `node:os` を触る唯一の場所。`machineLoadFrom(os.loadavg(), os.cpus().length, process.platform)` の 1 行 |
| `server/routes/load-routes.ts` | `GET /api/load` → `{ load: MachineLoad \| null }` |
| `server/routes/app-routes.ts` | mount（rate-limit の隣） |
| `src/composables/machineLoadGauge.ts` | 表示ルールの純関数: %、tone（muted / amber / err）、hover の文言 |
| `src/composables/useMachineLoad.ts` | 10 秒ポーリング。参照カウントで多重ポーリングを避ける |
| `src/components/MachineLoadGauge.vue` | 1 span |
| `src/components/AppToolbar.vue` | `<MachineLoadGauge v-if="onGridRoute && showLoadAverage" />` |
| `server/config/app-config.ts` ほか | `showLoadAverage`（既定 true）の sanitize / 既定値 / `/api/config` 露出 |
| `src/composables/showLoadAverage.ts` | `createGlobalFlag("showLoadAverage", true)` |
| Settings | appearance グループに `gridHeader` タブを 1 枚（チェックボックス 1 個） |

## GET にする理由

`os.loadavg()` は副作用も課金も無い純粋な読み取りなので safe method で正しい。
隣の `/api/rate-limits/refresh` が POST なのは probe が Claude のクエリを消費するからで
（`same-origin-guard.ts`）、その理由はこちらには当たらない。

## 検証

- 純関数 2 本（`machineLoadFrom` / `machineLoadReadout`）を spec で両方向（正常・異常）から。
- ルートは supertest で `{ load: … }` と Windows での `{ load: null }`。
- **実機**: `yarn dev` を上げてグリッドヘッダに実際の数字が出ることを `uptime` と突き合わせる
  （build が通ることは動いた証拠にならない）。しきい値の色は cores を偽装した spec 側で見る。
