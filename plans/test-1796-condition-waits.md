# #1796 — 時間の予算ではなく、事象を待つ

## 何が壊れているか（実測）

`test_windows` が実行ごとに違う spec で落ちる。`SharedAppPreview.spec.ts` の
「answers a member page's intent」で**余裕を測った**:

```
port.postMessage({ type: "…:intent", … });
await settle();                      // ← setTimeout(0) 1 回 + flushPromises
answers.find(m => m.type === "…:submitResult")
```

`settle()` を外して「答えが届くまでに要るホップ数」を数えると、3 回とも:

```
HOPS[member-intent] = 1
```

**必要が 1、用意が 1。余裕はゼロ。** 親の連鎖に `await` が 1 つ増えるか、ランナーがポートの配送を
1 ターン遅らせれば、assert はまだ答えの入っていない配列を読む。これが「同じテストだけが
2 つの別ブランチで落ち、同じファイルの他のテストは通る」ことの説明になる。

`transcript-sidecar.spec.ts` は種類が違う。**実時間 250ms** (`for(i<50) await sleep(5)`) を
予算にしていて、書き込みがそれを超えれば `readdirSync` が ENOENT になる。

## 直し方

**肯定的な assert は、事象そのものを待つ。**

| ファイル | 今 | 直したあと |
|---|---|---|
| `transcript-sidecar.spec.ts` | 250ms の実時間 | **書き込みそのものを await する** |
| `SharedAppPreview.spec.ts` | 1 ホップ固定 | 条件が成立するまでホップ（上限つき） |
| `decision-scan-fold.spec.ts` | 300ms の実時間 | sidecar が現れるまで待つ |
| `session-summary-fold.spec.ts` | 300ms の実時間 | 同上 |
| `session-meta-sidecar.spec.ts` | 300ms の実時間 | 同上（否定の 1 箇所だけ予算のまま） |

同じ形を横断で探して見つけた 3 本も入れた。観測された失敗ではないが、**直している defect そのものが
3 箇所残る**のは症状と規則を取り違えることになるため。

### `transcript-sidecar` — 予算を消す

`write()` は意図的に fire-and-forget で、その設計は変えない。変えるのは**捨てている promise を
返す**ことだけ:

```ts
write(...): void   →   write(...): Promise<void>
```

本番の呼び出し側は 1 箇所（`transcript-fold.ts:69`）で、`void` を前置して意図を明示する
（`no-floating-promises` は on）。task は内部で全部 catch するので、await しても throw しない。

これで spec は「250ms 待つ」ではなく「書き込みが終わるのを待つ」になる。**推測が消えて、
正確になる**。

### `SharedAppPreview` — 条件を待つ

`until(done, what)` を足し、答えを待つ assert をそれ経由にする。ハッピーパスのコストは
変わらない（最初の判定はホップ前に走る）。上限に達したら「親が何をしなかったか」を言って落ちる。

当初はここで「`settle()` 自体は残す（何も名指しできない用）が、ホップ数を 1 → 4 にする」と
書いていた。**レビュー中にそれは全部無くなった** — 下の「結果」を参照。

## やらないこと

- `worktrees.spec.ts` / `worktree-routes.spec.ts` / `headlessPreview.spec.ts` は別の失敗
  （git / ブラウザの実行時間）で、この PR では触らない。#1796 に残す。
- #1737（supertest 19 本）は別クラス・別 PR。

## 結果 — 時間の予算はゼロになった

計画では「名指しできない待ちには `settle()` を残す」「否定の assert は予算のままでよい」と
していた。**どちらも実装では成り立たなかった**:

- **`settle()` は 9 箇所すべて消えた。** 5 箇所は `press()`（控えが描画されるまで待つ）を入れた
  時点で不要になり、3 箇所は名指しできる条件があり、最後の 1 箇所は「否定だから安全」が誤り
  だった — 「前のアプリの記録が消えている」は**切替がまだ起きていなくても真**なので、予算では
  間違った理由で通る。切替の完了を待つように変えた。
- **否定の assert の予算も消えた。** 「小さすぎるファイルには書かない」は、コードを追うと
  そもそも待つものが無い（fold は解決前に `write()` を呼び、`write()` は閾値未満なら
  ディスクに触れる前に返る）。予算は不要というより**誤解を招く**もので、次の読者に
  「ここは待つ必要がある」と教えてしまう。

最終的に、touched な spec の待機は **39 個すべてが名前付き**:
`until` 11 / `press` 11 / `untilBlock` 7 / `untilText` 6 / `untilTrue` 4。

## 検証（実施済み）

**差分実験**: ポートの配送を N ターン遅らせて（`onmessage` を `setTimeout` で包む）、
旧 spec と修正後 spec を同じ条件で走らせた。これが CI の「ランナーが 1 ターン遅らせる」の再現。

| 配送の遅れ | 旧 spec | 修正後 |
|---|---|---|
| +1 ターン | **3 failed** / 40 passed | 43 passed |
| +6 ターン | **9 failed** / 34 passed | 43 passed |
| +12 ターン | **9 failed** / 34 passed | 43 passed |

旧 spec は 1 ターンで崩れ、修正後は 12 ターンでも崩れない。

**ホップ数の実測**（修正前、3 回とも同じ）:

```
HOPS[member-intent] = 1     ← 必要 1、settle() が用意していたのも 1
```

フルスイート **10,692 passed**。lint / typecheck も green。
