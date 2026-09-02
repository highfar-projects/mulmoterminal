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

```text
root = 管理下 (~/mulmoclaude 相当)   → detail: project / view-file: 200
root = それ以外のワークスペース       → detail: project / view-file: 404 (null)
```

## 決定

### D1: staging の可否は 1 つの述語にまとめ、read と authoring の両方をそこから導く

`server/backends/stagedSkills.ts` に `skillsStagingDirFor(root)` を置き、

- `skillsStagingDir`（読み。view / schema をどこから読むか）
- `stagedSkillAuthoring`（書き。どの authoring guide を出し、`putSchema` がどこに書くか）

の**両方をそこから導く**。core が言うとおり、この 2 つは合っていなければならない：

> ONE predicate on purpose. … a host that says `stagedSkillAuthoring: false` while still returning
> a staging path would have the agent told to write `.claude/skills/<slug>/` while `putSchema`
> wrote `data/skills/` …

読みだけ広げて書きを据え置くと、**エージェントが `.claude/skills` に書いた view より、
MulmoClaude が置いた古い staging のコピーが勝つ**（＝編集が黙って反映されない）。
#1955 の codex レビューの指摘どおり。

### D2: staging を返す root は 2 つ。第 2 の root だけ「証拠」を要求する

```ts
export function skillsStagingDirFor(root: string): string | null {
  const staging = path.join(root, "data", "skills");
  if (isManagedWorkspace(root)) return staging;
  return isWorkspaceRoot(root) && holdsStagedCollection(staging) ? staging : null;
}
```

- **managed workspace (`~/mulmoclaude`)** — 無条件。今日と同じ。中身が空でも返す必要がある
  （最初の `putSchema` がそれを埋める）
- **このサーバが serve しているワークスペース (`CLAUDE_CWD`)** — **staged なコレクションが実在
  するときだけ**（`data/skills/<slug>/schema.json`）

証拠を「ディレクトリの存在」ではなく「`<slug>/schema.json`」にしているのが要点。`data/skills`
という**名前**は repo が自分の都合で持ちうるので、それを根拠にエージェントの書き先を変えるのは
名前を信じているだけになる。`<slug>/schema.json` は staged なコレクションが実際に持つ形で、
core 自身も `canonicalBase` で同じ証拠を見ている。

| root | 判定 | 意味 |
|---|---|---|
| `~/mulmoclaude` | staged（無条件） | 今日と同じ |
| `CLAUDE_CWD` に staged なコレクションがある | staged | 何かが staged にした本物のワークスペース → **#1925 が直る** |
| `CLAUDE_CWD` に無い（＝git repo でランチャを起動しただけ。`data/skills` が別用途であっても） | direct | **今日と 1 ビットも変わらない**。repo に `data/skills` が生えることもない |
| 保存済みプロジェクト | direct | 今日と同じ。野良ファイルが commit 済み skill を shadow しない |

キャッシュしない。ワークスペースは MulmoClaude が最初の 1 件を書いた瞬間に staged になるので、
「無い」を覚えるとサーバが生きている限りそれに気づけなくなる。`manageCollectionHandlerFor` の
インスタンスキャッシュも同じ理由で **root + variant** を鍵にした（root だけだと、変わった後も
古い authoring guide を出し続ける）。

### D3: `userSkillsDir` は触らない

同じ `isManagedWorkspace` で分岐しているが、こちらを広げると **どのコレクションが見えるか** が
変わる（`~/.claude/skills` 配下がワークスペースの一覧と slug 解決に入る）。副作用なので触らない。

### D3b: staging の先読みが root 単位である件は core の設計。#1957 に切り出す

core の `readSourceAwareFile` は `<staging>/<slug>` を**その slug が staged かを見ずに** base へ
入れる。なので staged なワークスペースでは、staging schema を持たないコレクションでも古い
`data/skills/<slug>/views/*.html` が commit 済みの view に勝つ。

**この PR が持ち込んだものではない** —— `~/mulmoclaude`（触っていない側）で実測して同じ挙動を
確認済み。かつホストの束縛は `skillsStagingDir(workspaceRoot) => string | null` で slug を
受け取らないので、**このリポジトリからは per-slug を表現できない**。直す場所は core
（削除側の `canonicalBase` は既に per-slug の証拠を見ている）。#1957。

現在の挙動は「両 root で同じ答えになる」形でテストに留めてある。

### D4: 「同じディレクトリか」の 2 段判定を 1 か所にする

`isManagedWorkspace` は lexical → realpath の 2 段で比較している。`isWorkspaceRoot` も同じ規則が
要る（root は保存済み preset のスペルで来る）。2 か所に書き写さず `isSameRealPath` として
`server/infra/canonical-path.ts` に出し、両方がそれを呼ぶ。抽出は 1:1（分岐なし）で、既存の
`collectionStaging.spec.ts` が symlink 経路を含めて `isManagedWorkspace` を留めている。

## 広がった root で何が変わるか（core 側の `stagingSkillDir` 呼び出し全数）

| 呼び出し元 | 影響 |
|---|---|
| `readSourceAwareFile`（view / i18n） | **これが目的**。staging を先に試し、無ければ従来どおり `skillDir` |
| `authoringTarget`（`putSchema` / `schemaDocs`） | **読みと同じ答え**になる（D1）。staged なワークスペースでのみ staged |
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
| `skillsStagingDirFor` / `usesStagedSkillAuthoring` を置く | `server/backends/stagedSkills.ts`（新規） |
| 束縛をそれに差し替える | `server/backends/collections.ts` |
| `stagedSkillAuthoring` をそれから導く | `server/infra/collection-tool.ts` |
| 条件付きの 2 エントリを表に書く | `docs/collection-plugin-integration.md` |
| 回帰テスト | `test/server/backends/collectionStagingServerWorkspace.spec.ts`, `collectionStagingUnstagedWorkspace.spec.ts`, `test/server/infra/canonical-path.spec.ts` |

## テスト

`configureCollectionHost` は 1 プロセス 1 束縛なので、ワークスペースの状態ごとにファイルを分ける。

**`collectionStagingServerWorkspace.spec.ts`** — staging tree のある root（ケースごとに別 slug を
使い、実行順に依存しない）:

1. **サーバ自身のワークスペース**（`~/mulmoclaude` ではない）で staged view が読める — 修正前は `null`
2. **`~/mulmoclaude`** も引き続き読める — 置き換えではない
3. **両方にコピーがある**とき staging が勝ち、**かつ authoring guide も staged** — D1 の両端
4. **staging の先読みは root 単位**（D3b の既知の制約）。`managed` と `workspace` の**両方**で
   同じ答えになることを assert し、core のルールであってこの PR の新ルールではないことを示す
5. **保存済みプロジェクト**では `data/skills` の野良ファイルが commit 済みの view を shadow しない

**`collectionStagingUnstagedWorkspace.spec.ts`** — git repo をワークスペースにした場合。
**コレクションを含まない `data/skills` を置いた状態で**、commit 済みの view が出ること、
**authoring guide が direct のままである**ことの 2 つで、「この人たちには何も変わらない」を留める。

**`canonical-path.spec.ts`** — D4 の抽出で確かめた性質（trailing separator / `.` / `..` /
大文字小文字 / symlink の両向き / 存在しない leaf）。
