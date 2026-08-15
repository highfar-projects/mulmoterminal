# fix: windows-daily の SharedAppPreview が落ちる — 待ちのフェーズが 1 つ足りない (#1719)

## 症状

`windows-daily` が main で赤。落ちるのは 1 件だけ。

```
FAIL test/src/components/SharedAppPreview.spec.ts > SharedAppPreview > hands a page only ITS OWN records
AssertionError: expected undefined to deeply equal { notes: [ { id: '1' } ] }
```

値が違うのではなく、`mc-public-view:state` のメッセージが **1 件もチャンネルを渡ってきていない**。
ubuntu / macOS / ローカルは緑で、**Windows だけ**。

## 真因

`connect(wrapper)` の呼び出しは 9 箇所あり、**8 箇所は直後に `await settle()` を置いていて、
落ちている 1 箇所だけが置いていない。**

| 行 | `await settle()` |
| --- | --- |
| 361, 377, 398, 418, 470, 498, 514, 525 | ある |
| **581** | **無い**（落ちている 583 行の直前） |

`connect()` の最後の待ちは `flushPromises()` だけ。`@vue/test-utils` の実装は

```js
const scheduler = typeof setImmediate === "function" ? setImmediate : setTimeout;
function flushPromises() { return new Promise((resolve) => { scheduler(resolve, 0); }); }
```

つまり **`setImmediate` 1 回 = check フェーズだけ**。対して `settle()` は

```ts
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await flushPromises(); };
```

で **timers フェーズ + check フェーズの両方**を回す。

**MessagePort の配送はマイクロタスクではない。** 片方のフェーズしか回さない待ち方では、
配送がどちらのフェーズに載るかと負荷次第で、間に合ったり間に合わなかったりする。速いランナーでは
間に合っていて、遅い Windows ランナーでは間に合っていない。

製品コードは正しい。テスト側の待ちの不足。

## 直し方

581 行の直後に `await settle()` を足す。兄弟 8 箇所と同じ形になる。

## 「`settle()` も時間頼みでは」への答え

当たらない。`settle()` は「N ミリ秒待つ」ではなく**タスクキューを 1 巡させる**ためのもので、
同じ Windows ランナー上で 8 箇所が安定して緑。足りていないのは**フェーズ**であって時間ではない。

将来同じクラスが再発したら、そのときは「条件が満たされるまで `settle()` を繰り返す」形にする。
今それを入れないのは、1 箇所のために 9 箇所と違う待ち方を持ち込む方が読みにくいから。

## 検証

macOS では修正前も緑なので、**ローカルでは修正の効果を確認できない**。

`gh workflow run windows-daily.yaml --ref fix/1719-preview-settle` で実機を回して、
`SharedAppPreview.spec.ts` が緑になることを確認する（`windows-daily` は `pull_request` では走らない）。
