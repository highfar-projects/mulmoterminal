# 共有アプリ: 本人がレコードを消せるようにする（`selfDelete`）

**状態**: 実装済み（2026-08-13）。3 リポジトリとも PR 済み — 宣言と射影が
receptron/sharedapp#2（0.2.0 として公開済み）、ルールとホストが receptron/mulmoserver#181、
テンプレートとスキルがこのリポジトリ。**残るのは mulmoserver のルールの手動 deploy**で、
それまで宣言は書けても効かない。

実装で設計から変わったのは 1 点だけ: ページが取り下げを実行するには**鏡のコレクション名**が
要る（ルールが「鏡を開け直さない削除」を拒否するため）ので、participant 層の射影に
`withdrawMirror` を足し、閉じた語彙に 3 つ目の `withdraw` を入れた。`to` を持たない ask は
これが初めてで、`to` を載せて来たメッセージは intent として読まない。

## 何が困っているか

枠つきの予約（美容室 `templates/salon.md`、会議室 `templates/meeting-room.md`）では、二重
予約を**ドキュメント id の衝突**で防いでいる。予約の id が枠の id なので、2 人目の create は
「既に在るドキュメントの create」になって拒否される。原則 4 のとおりで、ここは正しい。

問題はキャンセルのほう。本人にできるのは `selfTransitions` による**状態遷移だけ**なので、
`status: "cancelled"` にしてもドキュメントは残り、**id は占有されたまま**になる。取り消した
枠を他の人が取り直せない。

枠を空ける仕組み自体は既にある。`firestore.rules` の `deleteWith()` は削除に
`mirrorReleased()` を要求していて、予約の削除と枠の `state: "open"` への差し戻しが**同じ
バッチでしか通らない**。使えるのが `isWriter`（owner / editor）と担当の `assignee` だけで、
**公開申込みの本人にその枝が無い**。

```
function deleteWith(r, c, s, aid, itemId) {
  return !flagOn(c, "immutable")
      && mirrorReleased(s, aid, itemId)      // 枠の開放はここで担保済み
      && (isWriter(r) || (isAssigned(r, c) && assignedBefore(c)));
}                                            // ← 本人の枝が無い
```

## 決めたこと

**`public.submit.<cid>.selfDelete` を足す。** 値は「どの状態から本人が削除してよいか」の
状態名の配列。

```json
"submit": { "bookings": { "selfDelete": ["booked"] } }
```

ルール側は `deleteWith` に 1 本足すだけになる。

```
|| (verified() && ownRow(a, s, cid, itemId)
    && s.get("selfDelete", []).hasAny([curStatus(c)]))
```

新しい概念は要らない。`ownRow()`（`emailField` と署名済みアドレスの一致）も
`mirrorReleased()` も既にあり、`resource.data` はドキュメントアクセス呼び出しではないので
本人確認のコストはゼロ。

### なぜこの形か（他の案を採らなかった理由）

| 案 | 変更量 | 履歴 | キャンセル通知 | 式の予算 |
|---|---|---|---|---|
| **A. `selfDelete`（採用）** | 小 | 消える | 出せない | delete パス — ほぼ影響なし |
| B. reclaim（`cancelled` の行を次の人の update で上書き） | 中 | 残る | 出る | **create / update パス — 全アプリが払う** |
| C. ロックとレコードの分離（予約は auto id、排他は枠の条件付き更新） | 大 | 全部残る | 出る | 中。**原則 4 の書き換えになる** |

B が魅力的に見えるのは履歴と通知が残るからだが、判定が `items` の update という**いちばん
熱いパス**に乗る。1000 式は 1 リクエスト（バッチ全体）にかかるので、これは共有アプリ全部が
払う変更になる。加えて「前の予約者のフィールドが残骸として残らないよう `createFields` 全部の
提出を必須にする」という穴が新しく生まれる（緩めると他人の個人情報が新しい行に残る）。

C は技術的には成立すると思われるが、「一意性はドキュメント id に置く」（原則 4 / D 決定）の
書き換えであって、実装ではなく決定の話。採るなら原則側から。

**A の代償は 2 つあり、両方ともスキルが利用者に伝えるべきもの。**

- **記録が消える。** 誰がいつ予約して直前に消したかが残らない（無断キャンセルの常習が
  見えない）。ハードデリートなので tombstone も無く、復旧は PITR だけ
- **キャンセル通知メールは原理的に出せない。** メールの規則は `get(src)` と `getAfter(src)`
  の両方で「その遷移が本当に起きた」を確かめる作りで、消えるドキュメントには `getAfter` が
  無い

履歴か通知が要るアプリは、`selfDelete` を宣言せず「キャンセルは受付経由」のままにする。
これは**宣言で選べる**のが正しい設計で、プラットフォームがどちらかに倒すべきではない。

## Firebase から見て何が起きるか

本人のブラウザが本人のトークンで 1 つの `writeBatch` を投げる。

```js
const batch = writeBatch(db);
batch.delete(doc(db, `apps/${aid}/collections/bookings/items/${slotId}`));
batch.update(doc(db, `apps/${aid}/collections/slots/items/${slotId}`), { state: "open" });
await batch.commit();
```

バッチの各ドキュメントで別々にルールが評価され、全部通らないと 1 つも書かれない。両者は
`getAfter()`（`get()` ではない — このバッチが**コミットされた後**の姿を問う）で互いを縛る。

| 対象 | 規則 | 中身 |
|---|---|---|
| `bookings/items/{slot}` の delete | `deleteWith` → `mirrorReleased` | `getAfter(slots/{slot}).state == "open"` |
| `slots/items/{slot}` の update | `mirrorRepair` | `state == (existsAfter(bookings/{slot}) ? "taken" : "open")` |

予約だけ消す・枠だけ開ける、はどちらも拒否される。**「予約は消えたのに枠が埋まったまま」は
存在しえない**ので、補償処理を誰も書かなくてよい。

同じドキュメントへの並行書き込みは直列化され、負けた側は新しい確定状態で評価されて
`PERMISSION_DENIED` になる（静かな上書きにはならない）。クライアント側はレイテンシ補償で
**一瞬だけ枠が空いて見える**ので、`commit()` の解決を待って描画すること。

## 実装（この順に）

1. **`../mulmoserver/firestore.rules`** — `deleteWith` に本人の枝。権威はここで、**手動
   deploy・CI 無し**。ここが deploy されるまで他は何も効かない。エミュレータのテストを
   同じ PR で足す: 本人が消せる / 他人の行は消せない / 宣言に無い状態からは消せない /
   枠だけ・予約だけの片側書き込みが落ちる
2. **`@receptron/sharedapp`** — `selfDelete` のパースと publish/deploy の検査。`emailField`
   が無い、`transitions` に無い状態名を挙げている、`mirror` があるのに枠が `mirrorOf` で
   結ばれていない、を refuse する
3. **MulmoTerminal** — `server/backends/sharedApp/exclusivity.ts` の `EXCLUSIVITY_KEYS` に
   加えるかの判断。**加えない**と考えている: `selfDelete` を後から外しても「消せたものが
   消せなくなる」だけで、live なレコードの整合性は壊れない（`idFrom` などと違う）。PR の
   本文でその根拠を明示すること
4. **スキルとテンプレート** — `templates/meeting-room.md` の「キャンセルすると何が起きるか」
   と `templates/salon.md` の `selfTransitions` の節を、宣言できるようになった形に更新。
   `test/server/backends/skillTemplates.spec.ts` は実物のゲートを通すので、2 が入るまで
   テンプレートに `selfDelete` を書いてはいけない

## 未解決

- **`selfDelete` の粒度**。状態名の配列で足りるか、`window`（「開始 24 時間前まで」）が要るか。
  ルールに日付の計算は無いので、要るなら枠側の `closesAt` のような**保存済みの数値**と
  比べる形にしかならない。初版は状態名だけで出す
- **削除と同時にアーカイブへ 1 件書く**案（履歴を残す）。同じバッチに 3 つ目の操作が増え、
  その追加ドキュメントの検証も要る。アクセス呼び出しと式の予算が増えて A の「安い」利点が
  薄れるので、履歴が要るなら B を選ぶほうが筋が良い

## 参照

- `docs/shared-app-principles.md` — 原則 3（数えられない）、原則 4（一意性は id）
- `plans/feat-shared-app-platform.md` — D1–D10
- `../mulmoserver/firestore.rules` — `deleteWith` / `mirrorClaimed` / `mirrorReleased` /
  `mirrorRepair` / `ownRow`
