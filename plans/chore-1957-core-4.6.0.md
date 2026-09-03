# chore(#1957): `@mulmoclaude/core` を 4.6.0 に上げ、staged view の per-slug 判定を取り込む

## 何のための bump か

#1955 で `skillsStagingDir` が staging を返す **root** を直したが、core 側には
「その root の中の**どの slug** が staged か」を見ない問題が残っていた（#1957）。

`readSourceAwareFile` は `<staging>/<slug>` を無条件に base へ入れるので、staged な
ワークスペースに同居する **imported / direct commit のコレクション**でも、古い
`data/skills/<slug>/views/*.html` が commit 済みの view に勝っていた。

ホストの束縛は `skillsStagingDir: (workspaceRoot: string) => string | null` で slug を
受け取らないため、**このリポジトリからは表現できない**。core 側で直した
（receptron/mulmoclaude#3031 / PR #3032 → `@mulmoclaude/core@4.6.0`）。

core 4.6.0 は読みと削除が `stagedSkillDir(root, safeSlug)` を共有し、`<staging>/<slug>/schema.json`
の実在（`lstat`。symlink は証拠にせず、`ENOENT`/`ENOTDIR` 以外は再送出）を証拠にする。

## この PR がやること

1. `@mulmoclaude/core` を `^4.5.0` → `^4.6.0`（`yarn add`。lockfile も更新）
2. core 4.6.0 で**期待値が反転するテスト**を更新する
3. core 4.6.0 が正しく無視するようになった**薄い fixture** を、実際の authoring レイアウトに直す

## 2 — 反転するテスト

`test/server/backends/collectionStagingServerWorkspace.spec.ts` の

> `"prepends staging per root, not per slug — the same in either workspace (#1957)"`

は #1955 の時点の挙動（両 root で `STALE STAGED` が勝つ）を、**既知の制約として意図的に**
留めていたもの。core 4.6.0 でその制約が消えるので、アサーションを反転させる:

> `"prefers the committed view for a slug with no staged schema — in either workspace (#1957)"`

両 root で assert し続けるのは変えない —— ルールは core のものなので、`~/mulmoclaude` と
このサーバが serve するワークスペースが同じ答えを返すべき、という点は 4.6.0 でも同じ。

## 3 — 薄い fixture

`test/server/backends/collections.spec.ts` は staging に `views/*.html` を置きながら
`data/skills/<slug>/schema.json` を置いていなかった。実際の authoring レイアウトは
`putSchema` が schema.json を書くので、**fixture が実物より薄い**（＝ 4.6.0 が区別したい
2 つの形を区別していない）。`testcol` と `viewactcol` に staged schema.json を足して実物に
合わせる。fixture を緩めたのではなく、実物に寄せている。

mulmoclaude 側でも同じ性質の fixture 2 系統を同時に直している（PR #3032）。

## 検証

依存を動かす PR なので、**ground truth は committed lockfile からのクリーン解決**であって
手元の warm な `node_modules` ではない。ローカルのゲートは通したうえで、クリーン install の
検証は CI に委ねる（`uptime` が 13.9 と高く、ここでフル再インストールを足すと今動いている
作業の方が代償を払うため）。CI は `actions/setup-node` のキャッシュから
`yarn install --frozen-lockfile` 相当を回すので、そこが検証になる。

## これで閉じるもの

#1957。
