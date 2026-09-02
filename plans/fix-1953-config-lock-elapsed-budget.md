# fix(test): config-lock の「待たされていない」判定を経過時間から retry の有無へ

Issue: #1953 / 失敗した run: https://github.com/receptron/mulmoterminal/actions/runs/33616594519/job/100203738814

## 何が起きたか

Windows (PR) の `test_windows` だけが落ちた。

```text
FAIL  test/server/config/config-lock.spec.ts > withConfigLock > creates the config directory rather than reading a missing one as contention
AssertionError: expected 1539 to be less than 1000
```

落ちた PR (#1949) は `package.json` / `yarn.lock` しか触っていない。つまり PR の内容ではなく、
テストの判定方法がランナーの負荷に依存している。

## なぜ経過時間では判定できないか

このテストが確かめたいのは「`~/.mulmoterminal` が無い初回書き込みを contention と誤読して
`LOCK_WAIT_MS` を待ち切っていないこと」。ところが assert しているのは経過時間で、その区間の
実測値はほぼ全部ファイルシステムである。

- `mkdtempSync` → `mkdirSync -p` → `openSync` (ENOENT) → `openSync` → `writeSync` → `closeSync`
  → `writeFileSync` → `readFileSync`
- スキャナの入った Windows ランナーでは、この一連が 1539ms かかりうる。製品コードは fast path を
  意図どおり通っている。

実 I/O に「必ずこの時間で終わる」値は無いので、閾値を伸ばしても先送りにしかならない (#816 と同じ)。

加えて 1000ms という予算は**緩すぎもする**: `LOCK_RETRY_MS` は 15ms なので、66 回リトライしてから
成功する退行を「1000ms 未満」として見逃す。速すぎる予算と遅すぎる予算を同時にやっている。

## 直し方

待ちの正体は `sleep()` = `setTimeout` なので、時計ではなく**リトライがスケジュールされたか**を見る。

```ts
const scheduled = vi.spyOn(globalThis, "setTimeout");
...
await withConfigLock(nested, () => writeFileSync(nested, '["made it"]'));
expect(JSON.parse(readFileSync(nested, "utf8"))).toEqual(["made it"]);
expect(scheduled).not.toHaveBeenCalled();
```

`vi.spyOn` は実装をそのまま残すので、実際のタイマー挙動は変わらない (フェイクタイマーだと、
退行時に promise が永久に settle せずハングし、vitest のタイムアウトという分かりにくい失敗になる)。
負荷では動かない判定になり、リトライ 1 回でも捕まえられる。

## 差分検証 (実行済み)

| 製品コードの変異 | 旧 assert (経過時間 < 1000ms) | 新 assert (setTimeout 未呼び出し) |
|---|---|---|
| ENOENT を `return false` (当時のバグそのもの) | 捕まえる (6s 待って ConfigLockTimeout) | 捕まえる (同上) |
| ENOENT で mkdir はするが `return false` (retry 1 回で成功) | **見逃す** (実測 23ms) | **捕まえる** (`Number of calls: 1`) |
| 変異なし | pass (12/12) | pass (12/12) |

変異は検証後に pristine copy から戻し、`git diff` が spec 1 ファイルだけであることを確認した。

## 触らないもの

- `server/config/config-lock.ts` は正常。変更しない。
- `test/helpers/waitHelpers.spec.ts:66` も経過時間を見ているが、60ms の deadline に対して 2000ms
  (33 倍) で、測っている `untilTrue` は I/O を含まないタイマー演算のみ。壊れていないので触らない。
  横断調査の全表は #1953 にある。
