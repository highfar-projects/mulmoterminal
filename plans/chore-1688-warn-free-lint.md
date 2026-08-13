# chore #1688 — warn を 0 種にし、spec の max-nested-callbacks を復活させる

## 出発点

#1682 で警告を 0 件にし、5 ルールを error に上げた。そのあと「本当に全ファイルに効いているのか」を
全 1534 ファイルで実効 severity を解決して測ったところ、まだ緩かった。

| ルール | error | off |
|---|---|---|
| `max-params` / `complexity` / `max-depth` | 1534 | 0 |
| `max-lines` | 1525 | 9（明示リスト） |
| `max-lines-per-function` | 832 | **702**（spec/test 全部） |
| `max-nested-callbacks` | 832 | **702**（同上） |

lint 対象から漏れているファイルは 0 件。ただし **33 ルールが warn のまま**残っていた
（`vue/*` 21、`security/*` 10、`@typescript-eslint/*` 2）。いずれも findings 0 件。

warn のまま置くと何が起きるかは #1682 で実証済み。`max-params` は「解消したら error に上げる」と
書かれた対象が既に解消されていたのに誰も上げず、その陰で 2 ファイルが新たに違反していた。**コード
より先に理由書きが腐る。**

## やったこと

### 1. プラグインが warn で配るルールを一律 error に

ルール名を 33 個並べるのではなく、severity 1 を 2 に持ち上げる `enforced()` 変換として書いた。
並べたリストは更新されずに腐るが、変換ならプラグイン更新で新しく warn 級のルールが増えたときも、
警告ではなく error として届く。severity だけを持ち上げるので**プラグイン自身のオプションは保持**され、
プラグインが `off` にしたルールは off のまま（走らせないという別の判断だから）。

この config 自身が warn にしていた 2 つ（`@typescript-eslint/no-floating-promises` /
`no-misused-promises`、2 ブロック × 2 ルール）も error にした。こちらには理由が書かれていた —
ブロック冒頭に「#1231 と同じ理由で warn。件数を見せつつ CI を赤くせず、本物を 1 件ずつ読む」と
ある。**その読みは終わっており**、件数はゼロのまま。移行の理由が満了したのに severity が
戻されていなかった、という形。冒頭の記述も現状に合わせて書き直した。

### 2. spec の `max-nested-callbacks` を復活

「suite は 1 つの大きな入れ子コールバックだから」という一文で `max-lines-per-function` と一緒に
off にされていたが、**測られていなかった**。suite は `describe > it > callback` で 3、上限は 4。
702 spec で有効化した結果、違反は **3 件 / 2 ファイル**だけだった。

- `chromeFromColor.spec.ts` — 3 重 forEach の掃引。走査対象をモジュール先頭の名前付き定数
  （`SWEEP_BACKGROUNDS`）に巻き上げ、輝度計算も関数に出した。**掃引する 4096 色は並びまで同一**
  であることを旧コードと突き合わせて確認済み。
- `pluginRuntime.spec.ts` — 決して解決しない fetch スタブ。モジュール先頭の
  `neverSettlingFetch` に巻き上げた。

### 3. `max-lines-per-function` が spec で off である理由を config に書いた

これは不可避。外側の `describe(…)` のコールバックがファイル全体を保持するので、この規則は
ファイルの長さを測っていることになり、ファイル長より短い上限は通らない。**数字を上げても解決しない
（大きさではなく形の問題）。** spec を押さえるのは per-FILE の `max-lines` で、そちらは #1682 で
error になっている。

## 結果（実測）

- **severity=warn のルール: 0 種**（33 → 0）
- `max-nested-callbacks`: 702 ファイルで off → **1535 ファイル全部で error**
- `yarn lint` は 0 errors / 0 warnings のまま
- ラチェットの確認: `v-html` を書いた `.vue` と 5 段ネストの spec が、それぞれ
  `vue/no-v-html` と `max-nested-callbacks` の error で落ちることを確認

`vue/no-v-html` が error になったことで、CLAUDE.md の「NEVER use v-html (security risk)」が
**機械的に強制**されるようになった。

## 残る off（すべて明示リスト、数えられる）

| ルール | off | 理由 |
|---|---|---|
| `max-lines` | 9 ファイル | .vue 2 + spec 7。負債リストで、減らせば消せる |
| `max-lines-per-function` | spec 全部 | 上記 3 のとおり構造的に不可能 |
| `sonarjs/deprecation` | 3 ファイル | 非推奨 API がそのファイルの主題（#1682） |
| `security/*` 3 種、`sonarjs/*` 3 種 | 全体 | 既存の判断、それぞれ理由付き |
