# #1737 — supertest を捨てて、ソケットを一本も張らない

## 何が問題か

`request(app)` は書くたびに **ephemeral port に listener を張る**（`.listen(0)` と同じこと）。
`grep listen(` では 0 件なので、#1729 の調査では見えていなかった。負荷が高いと
`socket hang up` / `other side closed` で落ちる。

## 見つけた範囲は 19 本ではなく 23 本だった

issue は `test/` を数えて 19 本。実際には:

- `test/` 配下 **21 本**（#1737 の 19 本＋その後に増えた 2 本。うち 1 本は
  `machine-load-route.spec.ts` で、#1791 で私が足したもの）
- **`server/` 配下にも 2 本**（`mulmoscript.spec.ts` / `remoteHost/routes.spec.ts`）。
  colocated spec なので `test/` の grep には出ない

`remoteHost/routes.spec.ts` は「listener を 1 個に減らす」対策を既に自分でコメントしていた
（13 → 1）。寄せると **0** になる。

## 直し方 — assert を 1 行も書き換えない

issue は「`appRequest` は fetch 互換の `Response` を返し、supertest は `.expect()` チェーンを
持つので機械的ではない」と言っている。**前半が本当の障壁だった**（`.expect()` を使っていたのは
23 本中 1 本だけ）。`res.body` / `res.status` を読む assert が 200 個以上あり、それを
`await res.json()` に書き換えるのは**トランスポートを証明するために表明を書き換える**ことになる。

なので `test/helpers/routeCall.ts` を足した。**supertest と同じ形**（`{ status, body, text,
headers }`）を返し、中身は `appRequest`（light-my-request の in-memory 注入）。呼び出し方だけが
変わり、assert は変わらない。

`body` は `Record<string, unknown>`。`unknown` にすると 200 個の assert 全部にガードが要るが、
`/api/*` は全部 JSON オブジェクトを返す。フィールドは `unknown` のままなので形は主張していない。
配列を返す body は `{}` にして `text` に残す（名前で読んで `undefined` になるのを防ぐ）。

## 変換の副産物

- `res.body.toString()` で**バイナリ**を読んでいた 3 箇所は `res.text` に（dir-icon ×2、
  mulmoscript ×1）。supertest の Buffer を暗黙に使っていた。
- `res.body.path` などを `path.join` / `fs` に渡していた箇所は**ガードを足した**（`as` は使わない）。
- `remoteHost/routes.spec.ts` から `app.listen(0)` と `beforeAll` / `afterAll` が消えた。

## 検証

- `supertest` を package.json から削除し、**`rm -rf node_modules && yarn install --frozen-lockfile`**
  でクリーン検証（CLAUDE.md の「warm な node_modules は嘘をつく」）。
- lint / typecheck / build / test **10,692 passed**。
