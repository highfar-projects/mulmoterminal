# fix: 「ツリーを読み直す」で読み込み済みのフォルダも読み直す

Issue: #3215

## 問題

Files ペインの「ツリーを読み直す」は `FilesPane.vue` の `reloadTree()` で、ツリーについては `tree.loadRoot()` を呼ぶだけだった。`loadRoot()` はルート直下だけを読み直し、`adoptListing()` が読み込み済み（`loaded`）のフォルダの `children` を前のツリーから引き継ぐ。この引き継ぎは #2148 で「キャッシュから描いたツリーが往復ひとつ後に畳まれない」ために入ったもので、そこでは正しいが、ボタンの経路も同じ関数を通るため、展開済み（または一度開いて畳んだ）フォルダに外から足したファイルはボタンを押しても出ない。`toggleDir()` は `loaded` なら読み直さないので、畳んで開き直しても同じ。

## 方針

issue の案 A。

- `useFilesTree` に `refreshAll()` を足す。ルートを `loadRoot()` で読み直したあと、読み込み済みのフォルダを親から順に再帰的に `refreshDir()` で読み直す。開いているかどうかは問わない（畳んであるだけのフォルダは、次に開いたとき古いままになるため）。一度も開いていないフォルダは読まない（開いたときに読む）。
- 親を先に読み直してから子を探す。ディスクから消えたフォルダは親の一覧から落ちるので、問い合わせない。
- 同じフォルダの読みが二つ同時に飛ぶことがある（ボタンの読みと、ペイン内の作成・改名が呼ぶ `refresh(dirRel)`）。古い方の返事が後から届いて新しい一覧を上書きしないよう、`refreshDir` はフォルダごとに読みの回数を数え、最後に頼んだ読みの返事だけを、頼んだときのルート世代の中で、その時点でその path を持つ node に載せる（Codex の round 1 の指摘）。
- ルートが読めなかったときは、そこで止めてツリーを残す（`loadRoot()` の既存の振る舞い）。途中でペインのルートが変わった（`reset()`）ときも止める。読み直しは一つずつ順に行う（読み込み済みのフォルダは数個程度で、同時に投げる理由がない）。
- `reloadTree()` は `tree.refreshAll()` を呼ぶ。`start()` と `refresh("")` は `loadRoot()` のまま。`adoptListing()` の引き継ぎもそのまま（キャッシュから描いた直後の往復では今までどおり必要）。
- `toggleDir()` は変えない。開き直すたびに読む案は、クリックごとに往復が一つ増える上、ボタンで全体が最新になれば要らない。issue の「あわせて決める」はこの判断で閉じる。

## 変更

- `src/composables/useFilesTree.ts`: `refreshAll()`、`refreshLoadedUnder()`、`refreshDir()` の読みの所有権、`toggleDir()` を module 階層へ（行数の上限のため、中身はそのまま）
- `src/components/FilesPane.vue`: `reloadTree()` の呼び先
- `test/src/composables/useFilesTree.spec.ts`: `refreshAll` の契約（開いている・畳んである・入れ子・一度も開いていない・消えた・ルートが読めない・一つのフォルダだけ読めない・途中でルートが変わる）
- `test/src/components/filesPaneReloadTree.spec.ts`: ボタンから `refreshAll` に届くこと（ペインを mount して行を開き、外で足したファイルがボタンで出る）

## 検証

- 上の spec が通り、`reloadTree()` を `loadRoot()` に戻すとペインの spec が赤になること。`refreshAll()` から畳んだフォルダや入れ子の読み直しを外すと composable の spec が赤になること。
- issue の再現手順は、ペインを mount した spec で踏む（`plans` の行を押して開く → 一覧に一つ足す → ボタン → 出る）。stub は `fetch` だけで、行とボタンは本物の部品。実ブラウザでは踏んでいない: サーバー側の一覧 API は触っておらず、ブラウザが変える要素（イベント配送）はこの変更の対象外なので、別サーバーを立てる費用に見合わないと判断した。
- `yarn format` → `yarn lint` → `yarn typecheck` → `yarn build` → `yarn test`。
