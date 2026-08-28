# fix: presentMulmoScript のビート差し替えが黙って無視される (#1880)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 症状

MCP ツール `presentMulmoScript` の「ビート差し替え」（`filePath` + `beatIndex` + `beat`）が
**何も書き換えずに成功として返る**。呼んだ側から成功と区別がつかない。

## 再現（実行中のサーバに対して、2026-08-28 実測）

```text
POST /api/plugin/presentMulmoScript
  {"filePath":"stories/…json","beatIndex":2,"beat":{…"# REPRO MARKER"…}}
-> 200、通常の再表示と同じ data.script が返る
-> ファイルの beat[2] は "# 1 つの台本から何でも" のまま（変わっていない）
```

## 原因 2 つ

### 1. ホストが引数を落としている

`server/backends/mulmoscript.ts` の `handleToolCall` が組み立てる allowlist に
`beatIndex` / `beat` が無い。パッケージ側は実装済みで、型にも入っている
（`SaveMulmoScriptArgs.beatIndex` / `.beat`、`executeMulmoScriptSave` の分岐）。
両方 undefined のまま渡るので分岐に入らず、`loadExistingScript` に素通りする。

### 2. 書き込んでも pubsub が飛ばない

`publishScriptChanged` を呼んでいるのはパッケージ側の kind ルータ（`updateKind`）だけ。
ホストの `handleToolCall` は `executeMulmoScriptSave` を直接呼ぶので publish されない。

新規保存で画面が変わって見えるのは、レスポンスの `Display the storyboard to the user.` を
受けてキャンバスが**その新しいファイルを開く**ため。既存ファイルを開いたまま中身だけ
差し替えるビート差し替えでは **pubsub が唯一の更新経路**なので、何も起きない。

## 直し方

1. allowlist に `beatIndex`（`typeof === "number"`）と `beat`（`!== undefined`）を足す
2. **書き込みが起きたときだけ** `publishScriptChanged` を呼ぶ。
   `executeMulmoScriptSave` は「差し替えたか」を返さないので、ホスト側で
   「`beatIndex` と `beat` が両方あり、かつ outcome が ok」を条件にする

## 触らないもの

- パッケージ側 `saveKind` の同じ取りこぼし（別リポジトリ。upstream issue に分ける）

## 検証（計画）

- ユニット: ツール呼び出し経路で `beatIndex` + `beat` を渡すと**ディスクの中身が変わり**、
  `script-changed` が publish されること。allowlist の取りこぼしはこの形でしか捕まらない
- 実機: 実行中のサーバに POST して、ファイルが変わることを確認

## 実装（2026-08-28）

- `server/backends/mulmoscript.ts`
  - allowlist を `saveArgsFrom(body)` として抽出し、そこに `beatIndex` / `beat` を追加。
    抽出は複雑度上限（`sonarjs/cognitive-complexity` 17 > 15）を超えたための対応でもあるが、
    **「何がパッケージに届くか」を決める場所が 1 つになる**ので読みやすさとしても良い
  - 書き込みが起きたときだけ `publishScriptChanged` を呼ぶ

### `origin` は渡さない

パッケージの契約に明記されていた:

> `origin` is who wrote it. A View passes its own id on every write and ignores the echo of
> its own … **An agent write carries no origin, so every View reloads.**

最初 `"agent"` を渡していたが、View 側が「自分のエコー」と判断して reload をスキップし得る。
それは直そうとしている沈黙そのもの。

### publish の条件は `body` ではなく `args` を見る

最初 `typeof body.beatIndex === "number" && body.beat !== undefined` と書いていた。
**ミューテーションが弱さを暴いた**: allowlist を #1880 の状態に戻しても broadcast のテストが
緑のままだった —— 条件が `body` から**同じ判断を二重に**導出していたので、パッケージに何も
届いていないのに publish していた（「何も書いていないファイルについての嘘」そのもの）。

`args`（実際にパッケージへ渡したもの）を見るようにして、allowlist と条件が乖離できなくした。
M1 で赤くなるテストが **1 件 → 4 件**に増えた。

## テストで踏んだ落とし穴 2 つ（どちらも自分のテストのバグ）

1. **`express.json()` を付けていなかった。** body が空のままルートに届き、パッケージは
   `Provide either 'script' or 'filePath'` を **200 で**返す。「status 200 かつファイル不変」
   だけを見ていた 4 件が、**まったく違う理由で緑**になっていた
2. **`initArtifactsBackend` を呼んでいなかった。** publish 経路はファイルに触らないので既存の
   channels spec では露見しないが、save 経路は 500 になる

3 件目として、**`leaves the other beats alone` が no-op でも通っていた** —— 「他が変わっていない」
は何も起きていないときに自明に真。対象 beat も assert するようにした。

## break-verify

| ミューテーション | 結果 |
|---|---|
| allowlist から `beatIndex`/`beat` を戻す（#1880 そのもの） | **4 red** |
| publish を消す | 2 red |
| publish を無条件にする | 1 red |
| `origin` を付ける | 2 red |

各回のあと `diff -q` で byte-identical 復元を確認。

## 実機検証（2026-08-28）

修正前（実行中のサーバ、`c8901e90` 相当）:

```text
POST … {"filePath":"stories/…json","beatIndex":2,"beat":{…"# REPRO MARKER"…}}
-> 200、通常の再表示と同じ data.script
-> beat[2] は "# 1 つの台本から何でも" のまま
```

修正後（`--port 34910` で起動）:

```text
-> 200
-> beat[2] が "# FIXED" に変わった
```

検証に使ったストーリーは元の内容に戻してある。

ゲート: format / lint / typecheck / build / test すべて 0。
`yarn test` は **11514 passed**（+7、この PR が足したもの）。


## レビューループ（`/gh-review-loop`、2026-08-28）

PR #1886。codex は 1〜3 巡すべて `LGTM`。CodeRabbit は 1 巡目で 1 件、2 巡目は **rate limit で
レビューできず**（沈黙は承認ではないので clean round に数えない）。Sourcery はこのリポジトリに
設定されていない。

**指摘を受けて直したもの**

- CodeRabbit: MD040 —— 症状の再現ブロックに言語タグが無かった（`text`、他の 2 つに揃えた）

**bot が挙げず、こちらの読み直しで見つけたもの**

- spec が temp workspace を消していなかった。このリポジトリの `mkdtempSync` を使う spec 69 本の
  うち 65 本は消している。1 つのテストがルートを 2 回呼ぶので、変数 1 つではなく配列で追跡する
- **レスポンスが書き込み後のスクリプトを返すことを何も pin していなかった。** エージェントが
  読めるのはレスポンスだけで、修正前はそれが**書き込み前**のスクリプトを成功に見えるメッセージ
  付きで返していた。以前のスナップショットを返すホストでも全アサーションが緑のままになる

**確認して「欠陥ではない」と判断したもの**（根拠付き、パッケージのソースを読んで）

- **書き込みが起きていないのに publish し得るか** → しない。`executeMulmoScriptSave` は
  `hasScript === hasFilePath` で `script`+`filePath` の同時指定も `script` 単独＋beat 対も
  badRequest にし、`executeUpdateBeat` が失敗したらその失敗をそのまま返す。
  よって `outcome.ok` かつ両フィールドあり ⇒ 書き込みは起きている
- **検証されていない書き込み経路が増えるか** → 増えない。届く先は View の `updateBeat` kind が
  既に使っている `executeUpdateBeat` そのもので、`mulmoBeatSchema.safeParse`・整数/非負・
  ディスク上のスクリプト長との境界チェックを通り、`parsed.data` を書く
- **publish の形はパッケージ自身のものと一致するか** → する。kind ルータも `outcome.ok` の後に
  `ops.publishScriptChanged(filePath, origin)` を呼ぶ。こちらはそれの `origin` 無し版で、
  wire path の正規化は `publishScriptChanged` 自身がやる
- **メッセージを「ビートを差し替えた」にすべきか** → スコープ外。`outcome.message` はパッケージの
  もの。エージェントの ground truth は返ってくるスクリプトで、それは上記のテストで pin した

**break-verify の更新（`515cb848` 時点）**

レスポンスのアサーションを足したので、M1（allowlist を #1880 に戻す）で赤くなるのが
**4 件 → 5 件**（全 8 件中）になった。`yarn test` は **11515 passed**。

`origin/main`（#1887）を取り込み、マージ結果で全ゲートを再実行。
