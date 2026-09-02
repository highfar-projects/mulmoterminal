# fix(#1925): staged なカスタムビューを、このサーバ自身のワークスペースでも読む

## 症状

grid セルの Canvas でコレクションのカスタムビューを開くと `HTTP 404`。同じワークスペース・同じ
`schema.json`・同じレコードを、単体の MulmoClaude で開くと描画される。

`detail` は 200 で `"source":"project"` を返すのに、`view-file` だけが 404 という署名。

## 原因

`readCustomViewHtml` → `readSourceAwareFile`（`@mulmoclaude/core`）は、project スコープの
コレクションについて staging を先に、`skillDir` を後に読む:

```js
const staging = collection.source === "project" ? stagingSkillDir(workspaceRoot, safeSlug) : null;
const bases = staging === null ? [collection.skillDir] : [staging, collection.skillDir];
```

staged authoring では `views/*.html` は **staging(`data/skills/<slug>/`) にしか無い**
（`.claude/skills/<slug>/` へは SKILL.md / schema.json / templates だけがミラーされる）。
だからホストの `skillsStagingDir` が `null` を返すと、base から staging が丸ごと落ちて 404 になる。

2 つのホストの束縛が非対称だった:

| | `skillsStagingDir` |
|---|---|
| MulmoClaude (`server/workspace/collections/configure.ts:25`) | `path.join(root, WORKSPACE_DIRS.skillsStaging)` — 無条件 |
| MulmoTerminal (`server/backends/collections.ts`) | `isManagedWorkspace(root) ? … : null` |

そして `isManagedWorkspace` が聞いているのは「**このパスは `~/mulmoclaude` か**」
(`MULMOCLAUDE_WORKSPACE_PATH || path.join(os.homedir(), "mulmoclaude")`)。
一方 MulmoTerminal 自身のワークスペースは `CLAUDE_CWD` = **ランチャを起動したディレクトリ**
(`bin/cli-args.js` の `chooseCwd` → `serverSpawnEnv` が必ず注入する)。**この 2 つは同じ質問ではない。**

両者がずれると、MulmoClaude が staged レイアウトで書いた「このサーバ自身のワークスペース」を、
MulmoTerminal が「managed ではない」と判定して staging を読まない。これが 404 の正体。

手元で署名まで再現済み（同じレイアウトを 2 つの root に置いて比較）:

```
root = 管理下 (~/mulmoclaude 相当)   → detail: project / view-file: 200
root = それ以外のワークスペース       → detail: project / view-file: 404 (null)
```

## 決定

### D1: staging の可否は「このサーバが serve しているワークスペースか」で決める

`skillsStagingDir` の述語を **`isManagedWorkspace(root) || isWorkspaceRoot(root)`** にする。
`isWorkspaceRoot` は `initProjectRoots({ workspace })` が束縛した root — つまり `CLAUDE_CWD` —
との同一判定。`~/mulmoclaude` 判定は**残したまま足す**ので、今動いているものは何も止まらない。

`CLAUDE_CWD === ~/mulmoclaude`（通常のケース）では union は今日とビット単位で同じ答えを返す。
差が出るのは、今まさに 404 になっている「ワークスペースが `~/mulmoclaude` でない」場合だけ。

### D2: `stagedSkillAuthoring` は触らない（読みだけ広げる）

`server/infra/collection-tool.ts` の `stagedSkillAuthoring` は `isManagedWorkspace` のまま。
core の `authoringTarget` は

```js
const stagingDir = deps.stagedSkillAuthoring === false ? null : stagingSkillDir(resolveBase(deps), slug);
```

なので `false` が勝ち、**エージェントに出す authoring guide も `putSchema` の書き先も今日のまま**
（`.claude/skills/<slug>/`）。「読めるようにする」以上のことをしない。

これは core が "Staged requires BOTH to agree; anything else is direct" と書いている、定義済みの
組み合わせ。書き込み先を変えるのは別の判断（このワークスペースで MulmoTerminal が staged に
authoring すべきか）なので、この PR には含めない。

### D3: `userSkillsDir` も触らない

同じ `isManagedWorkspace` で分岐しているが、こちらを広げると **どのコレクションが見えるか** が
変わる（`~/.claude/skills` 配下がワークスペースの一覧と slug 解決に入る）。副作用なので触らない。

### D4: 「同じディレクトリか」の 2 段判定を 1 か所にする

`isManagedWorkspace` は lexical → realpath の 2 段で比較している。`isWorkspaceRoot` も同じ規則が
要る（root は保存済み preset のスペルで来る）。2 か所に書き写さず `isSameRealPath` として
`server/infra/canonical-path.ts` に出し、両方がそれを呼ぶ。抽出は 1:1（分岐なし）で、既存の
`collectionStaging.spec.ts` が symlink 経路を含めて `isManagedWorkspace` を留めている。

## 広がった root で何が変わるか（core 側の `stagingSkillDir` 呼び出し全数）

| 呼び出し元 | 影響 |
|---|---|
| `readSourceAwareFile`（view / i18n） | **これが目的**。staging を先に試し、無ければ従来どおり `skillDir` |
| `authoringTarget`（`putSchema` / `schemaDocs`） | 変化なし（D2 の `stagedSkillAuthoring: false` が勝つ） |
| `writeArchive` | `staging !== null && await pathExists(staging)` で存在ガード済み |
| `canonicalBase` / `schemaWriteTargets`（view 削除） | `fileExists(<staging>/schema.json)` で存在ガード済み |
| `deleteTargets` | 封じ込めチェックの対象が増えるだけ |
| `removeLocations` | `rm -rf` に `force: true`。無ければ no-op、有れば消すのが正しい |

`data/skills` を持たないディレクトリでは、増える仕事は ENOENT の probe 1 回だけ。

## 変更

| 変更 | 場所 |
|---|---|
| `isSameRealPath` を足す | `server/infra/canonical-path.ts` |
| 2 段判定をそれに置き換える | `server/backends/workspaceSetup.ts` |
| `isWorkspaceRoot` を足す | `server/infra/project-root.ts` |
| `skillsStagingDir` の述語を union にする | `server/backends/collections.ts` |
| 回帰テスト | `test/server/backends/collectionStagingServerWorkspace.spec.ts` |

## テスト

新規 spec は 3 つを留める（`configureCollectionHost` は 1 ファイル 1 束縛なので root を変えて確認）:

1. **サーバ自身のワークスペース**（`~/mulmoclaude` ではない）で staged view が読める — 修正前は `null`
2. **`~/mulmoclaude`** も引き続き読める — union であって置き換えではない
3. **保存済みプロジェクト**では `data/skills` の野良ファイルが commit 済みの view を shadow しない
   — 今日の保証がそのまま残っている
