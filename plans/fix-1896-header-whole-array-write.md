# fix: `-header` skill の指示どおりに書くと既存の buttons / chips が消える (#1896)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 症状

`mulmoterminal-header` skill はこう書いていた:

> Global writes are a **partial `POST /api/config` merge** — send only `buttons` / `chips`.

「partial merge」は正しいが、**それはトップレベルのキー単位**。`server/config/app-config.ts` の
`mergeConfigUpdate`:

```ts
const updated = <T>(key: keyof AppConfig, sanitize: (input: unknown) => T, current: T): T =>
  body[key] !== undefined ? sanitize(body[key]) : current;
```

ボタンを 1 つ足すつもりで足したものだけを POST すると、**それが `buttons` の全体になり、既存の
ボタンが消える**。警告は出ず、レスポンスは成功。

## この skill には「replace」が 3 つあって、混ざりやすい

読んでいて分かったのは、同じファイルが**別々の replace 規則を 2 つ既に説明していた**こと。
足りなかったのは 3 つ目（グローバル書き込み）だけだった。

| | どこに書いてあったか |
|---|---|
| `buttons` を**グローバル設定に書く**と、グローバルの配列が全置換 | **どこにも無かった** ← これ |
| `buttons` を**どのレベルであれ列挙**すると `DEFAULT_BUTTONS` が置き換わる（組み込みはマージされない） | `header-config.ts:51`、skill 本文 |
| **プロジェクト** と **グローバル** は `id` でマージ | `header-config.ts:196`、skill の例の末尾 |

3 つを表にして並べた。ここを混同すると「例のとおりに書いたのに消えた」になる。

## 総論の skill は知っていた

`mulmoterminal-config`（ルーター）は既にこう書いていた:

> Arrays (`themes`, `providers`, `buttons`, `chips`, `soundKinds`) **replace** rather than append —
> send them complete, or you delete the rest.

**`buttons` / `chips` を名指ししている。** つまり**総論が知っていて、それを所有する skill が
知らなかった**。

ただしその配列リストは、ルーター自身が所有する `gitlabHosts` と `prRepos` を落としていたので
足した。`keymap` はオブジェクトだが同じ理由で全置換なので、その旨も 1 行。
**列挙した 8 キーすべてが `updated(...)` 経由であることを確認済み。**

## やらないこと

- **`mergeConfigUpdate` の挙動そのものは変えない。** 全置換は他の skill（`-theme` / `-model` /
  `-notify`）が既に前提にしている仕様で、変えれば全部が壊れる。直すのは**指示の側**

## リポジトリ自身のテストに捕まった

説明用に書いた JSON ブロックを `{ "buttons": [ { "id": "build", … } ] }` と省略記号で書いたところ、
**`test/server/config/doc-button-samples.spec.ts` が落ちた。**

このリポジトリには、**ガイドと `-header` skill の中の `buttons` を含む ```json ブロックを全部
パースして、実バリデータ `sanitizeButtons` に通す** spec がある。省略記号は JSON ではないので
`JSON.parse` で落ちた。

直したら 2 度目も落ちた —— `"run": "send"` は無効な run type で、ビルドボタンの正しい形は
`"run": "shell", "cmd": "yarn build"` だった。ガイドに既に検証済みの例があったのでそれに合わせた。

**この spec は良いガード**で、「ドキュメントのサンプルが実際には動かない」を防いでいる。
自分の説明用サンプルもその対象だと分かっていなかった。

**なお、この失敗に気づく前に一度 red のまま push している。** `yarn test` の直後に
`echo "test=$?"` を挟んだせいで `&&` チェーンが成功として続いた —— 終了コードを見たつもりで
`echo` の終了コードを見ていた。

## 検証

skill は散文なのでテストで赤くできない。確認したのは:

- 列挙した 8 キー（`themes` / `providers` / `buttons` / `chips` / `soundKinds` / `gitlabHosts` /
  `prRepos` / `keymap`）が `app-config.ts` の `updated(...)` 経由であること —— 全部 1 件ヒット
- 3 つの replace 規則それぞれの根拠（`app-config.ts` / `header-config.ts:51` /
  `header-config.ts:196`）
- 他の writing skill を掃いた結果、`-theme`（`themes`）/ `-model`（`providers` /
  `customAgents`）/ `-keys`（`keymap`、#1892 で追加済み）は既に「complete を送れ」と書いている
- `test/server/skills/skillFrontmatter.spec.ts` が緑（frontmatter を壊していない）

## codex review で見つかった追加の欠落 —— `sounds`（PR #1904 レビュー）

上の掃き方が甘かった。`-notify` を「既に complete と書いてある」と数えたが、実際の文面は

> Partial `POST /api/config` merge — write only the keys you are changing, and **send arrays complete**.

で、**`sounds` は配列ではなくオブジェクト**なので、この指示は `sounds` を覆っていなかった。
`mergeConfigUpdate` は `sounds` も `updated("sounds", sanitizeSounds, …)` で通し、
`sanitizeSounds` は `out` を**新規に組み直す**（`app-config.ts:384`）。つまり

```json
{ "sounds": { "waiting": "preset:coin" } }
```

は **他の kind の音を全部消す**。#1896 と同じ欠陥が、別の skill に残っていた。

**直し方を「列挙」から「原則」に変えた。** 元の直しは配列名を並べた表現で、
`sounds` が漏れたのはまさにその列挙が伸びなかったからなので、同じ形で 1 語足しても次に同じ穴が開く。
ルーター側（`-config`）を

- **トップレベルだけが merge。送ったキーは丸ごと置換され、その下は一切 merge されない**

という原則の書き方に変え、配列（13 個）と**オブジェクト**（`sounds` / `keymap` / `repoDirs` /
`headerStatusColors`）の両方を例として挙げた。**オブジェクトの方が事故る**（map は 1 キー足せる
ように見える）ことを明記している。

`-notify` 側も「arrays complete」を、`sounds` を名指しで
「`GET /api/config` で現在の map を読み、そこに足して、丸ごと返せ」に書き換えた。

**オブジェクト値 4 キーの sanitizer が全部「新規に組み直す」ことを確認済み**:
`sanitizeSounds`（`app-config.ts:384`）/ `sanitizeRepoDirs`（`:350`）/
`sanitizeKeymap`（`common/keymap.ts:247`）/ `sanitizeHeaderStatusColors`
（`common/headerStatusColors.ts:100`）。

**`-dirs` は対象外**だった。`headerStatusColors` をグローバルにも書けるとは書いているが、
グローバルへの**書き込み手順を持たない**（プロジェクトの `.mulmoterminal.json` を書く skill で、
グローバルは「読む」だけ）ので、`POST` を誤らせる文面が無い。
