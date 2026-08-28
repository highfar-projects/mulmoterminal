# fix: 衝突時の起動警告が勝者を誤って名指しする（copy + send） (#1901)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
> 現在のコードの仕様はコードが唯一の情報源。数値は sha に紐づけて書くこと。

## 症状

`keymap` のアクションと `send` が同じキーに割り当てられているとき、`duplicateWarnings` は
**常にアクションを勝者として**警告を書いていた:

```
same keystroke as `copy` — only `copy` will fire
```

`copy` と `send` の組み合わせでは**これが嘘になる**。ユーザーは「`copy` しか発火しない」と
言われたうえで、選択が無いときに `send` が発火するのを見る。

## 根拠になっていたコメント自体が誤りだった

```
// `rank` is DISPATCH order, so the winner can be named: every action outranks every send
// binding, because the grid's handler runs in the capture phase and stops the event before
// the terminal — see sendBytesFor.
```

**`copy` と `paste` はそのハンドラに到達しない。** `src/composables/gridShortcut.ts`:

> Terminal-scoped actions are decided inside the terminal … **must never reach this handler**

ターミナル側（`useTerminalConnections.ts`）の順序は `clipboardActionFor` → `onSend`。そして
`clipboardActionFor` は**選択が無ければ `copy` に対して null を返す** —— `^C` を割り込みとして
残すための意図的な設計。

| 同じキーにあるもの | 実際に勝つのは |
|---|---|
| `copy`/`paste` 以外のアクション + `send` | アクション（capture フェーズ） |
| `paste` + `send` | `paste`（ターミナル内で `send` より先、選択に依存しない） |
| **`copy` + `send`、選択なし** | **`send`** |

## 直し方

**順位付けは変えない** —— `copy` + `send` 以外はすべて正しい。変えたのは**文言の生成**だけ:

- `Claim` に `kind: "action" | "send"` を持たせた。`label` からは読み取れないため
- `collisionReason(winner, loser)` を分け、`winner.label === "copy" && loser.kind === "send"` の
  ときだけ「選択があるときは `copy`、無いときは `send`」と書く
- 根拠になっていたコメントを、`TERMINAL_SCOPED_ACTIONS` の例外込みに書き直した

## 触らないもの

- **ディスパッチの挙動**。`copy` が選択なしで素通りするのは `^C` を守るための設計で、
  `terminalClipboard.ts` にその理由が書いてある。直すのは**説明の側**
- `paste` と、グリッドを通る全アクションの文言 —— 例外は 1 つだけで、規則の書き換えではない

## 検証

### 文言と実挙動を同じファイルで pin した

**#1901 が起きた形そのものが「コメントが規則を主張し、メッセージがそこから生成され、
どちらも `terminalClipboard` と突き合わされたことが無かった」**だったので、
`test/common/keymapSend.spec.ts` に両方を置いた:

- 警告の文言 3 件（`copy`+send は条件付き / `paste`+send は断定 / グリッドのアクション+send は断定）
- **その文言が主張しているディスパッチ**2 件（選択ありで `clipboardActionFor` が `copy`、
  選択なしで null かつ `sendBytesFor` がバイト列を返す）

### break-verify（各回 byte-identical 復元）

| ミューテーション | 結果 |
|---|---|
| 文言を無条件の「only X will fire」に戻す | **1 red** |
| `clipboardActionFor` から選択の条件を外す（挙動を文言に合わせる） | **2 red**（うち 1 件は既存の `^C` テスト） |

2 つ目が要点 —— **メッセージと実挙動のどちらを動かしても赤くなる**ので、乖離できない。
