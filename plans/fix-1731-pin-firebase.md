# fix: firebase を 12.16.0 にピン留めする (#1731)

## 背景 — 参照実装からの伝播漏れ

`package.json` の `dependencies` が `"firebase": "^12.17.1"` で、入るのは
**firebase 12.17.1 = `@firebase/auth` 1.13.4**。これは既知のリグレッション版で、
参照実装の mulmoclaude では既にピン留めで回避済み（mulmoclaude #2835 / #2912）。

| | firebase | `@firebase/auth` |
| --- | --- | --- |
| mulmoclaude main | `12.16.0`（キャレット無し） | 1.13.3 |
| mulmoterminal main（本 PR 前） | **`^12.17.1`** | **1.13.4** |

CLAUDE.md の「MulmoClaude is the reference host」に該当する。同じ SDK を同じ形で呼んでいて
（`RemoteHostControl.vue:141` ↔ `useRemoteHost.ts:151`）、あちらで直った不具合がこちらに来ていなかった。

## 何が壊れるか

1.13.4 が `IndexedDBLocalPersistence` に `visibilitychange` リスナを足し、
`document.visibilityState === 'hidden'` をページ teardown と同じ扱いにした。サインインの
ポップアップが元ウィンドウを背面に回した状態で認証情報を永続化しようとすると `_openDb()` が throw する。

```
signInWithPopup → PopupOperation → _signIn → _signInWithCredential
  → auth._updateCurrentUser → directlySetCurrentUser
  → assertedPersistence.setCurrentUser → IndexedDBLocalPersistence._set
  → _withRetries → _openDb → throw new Error('Database is closing/hidden')
```

`_withRetries()` は `isHiding` のときリトライせず rethrow するので回復経路が無い。
**読み取り（`_poll()`）は `isHiding` を見て `[]` を返して握りつぶすのに、書き込みだけ例外を上げる**
という非対称が芯。

上流 [firebase-js-sdk#10264](https://github.com/firebase/firebase-js-sdk/issues/10264)。
修正 [#10300](https://github.com/firebase/firebase-js-sdk/pull/10300) は 2026-08-13 マージ済みだが
**npm に出ていない**（`@firebase/auth` の latest は 1.13.4 のまま）。**上げても直らないので待てない。**

## 直し方

`"firebase": "12.16.0"` — **キャレット無し**。`^12.16.0` だと 12.17.x に浮いて 1.13.4 に戻る。
12.16.0 は `@firebase/auth` 1.13.3 を同梱する最新の 12.x。

mulmoclaude は monorepo で 2 箇所必要だったが、こちらは `package.json` 1 つだけ。
`firebase` は `dependencies` にあり、ブラウザ束（`src/config/firebase.ts`）と server 実行時
（`server/backends/remoteHost/*` が `firebase/firestore` / `firebase/storage` を import）の
両方で使われるので、npm 利用者にもそのまま届く。

## #1661 との関係 — 別問題

#1661（Chrome で Connect が Offline のまま）の報告には
「`accounts:signInWithIdp` → 200 OK」かつ「`firebaseLocalStorageDb` が空のまま」とあり、
**これはこのリグレッションの症状そのもの**。

ただし #1661 のもう一方の証拠 `auth/popup-blocked` は別経路で、`window.open()` が null を
返した時点のエラー（`_assert(newWin, auth, "popup-blocked")`）なので永続化まで到達していない。
**別問題として扱い、こちらは独立に直す。** ピン留め後に #1661 の報告者へ再確認すれば、
残る症状が `popup-blocked` だけに絞れる。

## 検証

依存を動かす変更なので、warm な `node_modules` では確かめない（そこは「ローカル緑・CI 赤」の温床）。

1. `rm -rf node_modules && yarn install --frozen-lockfile` → 成功。
   解決結果 firebase **12.16.0** / `@firebase/auth` **1.13.3**
2. lint / typecheck / build / test → すべて緑（710 files, 10217 tests）
3. lockfile 差分は 224 行の入れ替え。`@firebase` 系以外で動いたのは `re2js` の 1 件だけで、
   削除ではなく `@firebase/firestore` 12.16.0 の要求範囲に合わせた `^2.8.3` → `^0.4.2`（0.4.3 が入る）
4. **出荷される束から回帰コードが消えたことを直接確認**

   | マーカー | `dist/assets/*.js` |
   | --- | --- |
   | `Database is closing/hidden` | **0** |
   | `isHiding` | **0** |
   | `signInWithPopup` / `popup-blocked` | 1（firebase auth 自体は入っている） |

   ビルドが通ること自体も検証の一部で、`firebase/app` `firebase/auth` `firebase/firestore`
   `firebase/storage` の subpath export がバージョン間で変わっていないことを示す。

## 戻すとき

上流 1.13.5 以降が npm に出たら、`^` を戻すか新しい版にピンを移す。
**その判断は mulmoclaude と揃えること** — 片方だけ動かすと、また今回のような伝播漏れになる。
