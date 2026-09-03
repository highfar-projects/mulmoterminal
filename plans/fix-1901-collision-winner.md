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

## codex review で見つかった残り —— 衝突が 3 者のとき（PR #1906 レビュー）

最初の直しは **winner と loser の 2 者**でしか考えていなかった。`collisionReason` の条件が
`winner.label === "copy" && loser.kind === "send"` なので、**同じキーに send が 2 つある**と
両方が「選択が無いときに発火する」と言われる:

```json
{ "copy": "Ctrl+c", "send": [{ "key": "Ctrl+c", "bytes": "^A" }, { "key": "Ctrl+c", "bytes": "^B" }] }
```

**再現済み。** `validateKeymap` は `send[0]` と `send[1]` の両方に
「`copy` は選択中だけ、`send[N]` は選択が無いとき」を返す。一方 `sendBytesFor` は
**最初に一致した 1 件**を返す（`keymap.ts` のコメントどおり "First match wins"）ので、
実際に返るのは `^A` = `send[0]` だけ。**`send[1]` はどちらの状態でも発火しない。**
#1901 と同じ「実際には起きないことを起きると言う」欠陥が、1 つ下の要素に残っていた。

### 直し方 —— 衝突「グループ」として解決する

ペアではなく、同じキーストロークを主張する claim 全体を rank 順に並べて解決する:

- **`actionForKey` は最も rank の低いアクションを返して止まる**ので、2 つ目のアクションは
  どちらの状態でも到達しない（`copy` + `paste` + send なら `paste` は発火しない）
- **`copy` だけが条件付き**。選択が無いと `clipboardActionFor` が null を返し、キーは
  send ハンドラへ落ちる。そこで勝つのは `sendBytesFor` の**最初の一致**
- よって **到達可能な claim はちょうど 2 つ**（選択あり = `copy`、選択なし = 最初の send）で、
  **それ以外は全部 unreachable**

`unselectedWinner()` を足してその「2 人目の勝者」を求め、`collisionReason` を 3 分岐にした:

| loser | 文言 |
|---|---|
| 条件付き勝者（最初の send） | `copy` は選択中だけ、これは選択が無いとき（従来どおり） |
| それ以外（後続の send、2 つ目のアクション） | **`copy` と `send[0]` が両状態を取るので、これは発火しない** |
| `copy` が勝者でない全ケース | only `X` will fire（従来どおり） |

### 検証

- **追加した 2 件は、直す前のコードで red・直した後で green** を確認済み
  （`git stash` で `common/keymap.ts` だけ戻して実行 → `2 failed | 31 passed`、
  復元後 `33 passed`。復元が byte-identical であることも `diff` で確認）
- ディスパッチ側も pin した: `copy` + send 2 件で `sendBytesFor` が `send[0]` のバイト列を返す
  = `send[1]` が到達不能であることをテストが押さえる
- `test/common` 全体 + `keymap-check.spec.ts` で **905 tests green**、
  `vue-tsc -b` **exit 0**、`eslint` **exit 0**、`prettier` 差分なし

**なお、最初の `vue-tsc` は 48 error を出したが全て環境要因だった。** worktree に
symlink した `node_modules` が別チェックアウトのもので `@receptron/sharedapp@0.26.0`、
このブランチが要求するのは `^0.34.0`。エラーは全て sharedApp 系ファイルで、
`keymap.ts` / `keymapSend.spec.ts` には 1 件も無し。正しいバージョンを持つ
チェックアウトの `node_modules` に貼り替えて再実行し、exit 0 を確認した。

## codex review 2 巡目 —— 条件付きなのは `copy` だけではなかった

前節の直しでもまだ不足だった。`runnerUp === null` を「無条件の勝者」と見なしていたが、
**グリッドのアクション 4 つも条件付き**だった:

```
NEEDS_A_CURRENT_TERMINAL = ["zoom-next", "zoom-prev", "terminal-new-adjacent", "terminal-close"]
```

`gridShortcutFor` は**拡大中のセルが無いとこれらを拒否**して null を返す。そして
`GridView.vue` のハンドラは

```ts
const shortcut = gridShortcutFor(getActiveKeymap(), e, expandedUid.value !== null);
if (!shortcut) return;          // ← preventDefault も stopPropagation もしない
```

なので、**イベントはそのままターミナルへ流れ**、`makeSendHandler` → `sendBytesFor` で
send が発火する。つまり `{"zoom-next":"Ctrl+c","send":[{"key":"Ctrl+c","bytes":"^A"}]}` は
グリッドが拡大されていない間ずっと `send[0]` が発火するのに、
`validateKeymap` は「only `zoom-next` will fire」と言っていた。**#1901 と同じ欠陥、条件が違うだけ。**

### 一般化した

「`copy` かどうか」ではなく「**そのアクションはキーを手放すか**」で判定する形に変えた。
手放す条件は 2 つあり、構造は同じ（**どちらのハンドラも event を止めずに return する**）:

| アクション | 手放す状態 | 判定するハンドラ |
|---|---|---|
| `copy` | 選択が無い | `clipboardActionFor` |
| `zoom-next` / `zoom-prev` / `terminal-new-adjacent` / `terminal-close` | 拡大中のセルが無い | `gridShortcutFor` |

`standsAside()` がこの表で、`acts` / `otherwise` の 2 文が文言になる。
`fallthroughWinner()` は `copy` 固定をやめて「手放すアクションなら最初の send」を返す。

### `NEEDS_A_CURRENT_TERMINAL` を `common/` へ移した

判定に必要になったが、リストは `src/composables/gridShortcut.ts` のローカル定数だった。
**両側が同じ値から判断する**ので、CLAUDE.md の規則どおり `common/keymap.ts` の
`TERMINAL_SCOPED_ACTIONS` の隣に置き、`gridShortcut.ts` は import に変更。
中身は変えていない（同じ 4 要素）。コピーを 2 つ持つと、**この PR が直している「文言と実挙動の乖離」を
自分で再生産する**ことになる。

### 検証

- **追加した 6 件が、直す前のコードで red・直した後で green**
  （`common/keymap.ts` と `gridShortcut.ts` を stash → `6 failed | 34 passed`、
  復元後 `40 passed`。両ファイルとも byte-identical 復元を確認）
- ディスパッチ側も pin: `gridShortcutFor` が拡大中 = `zoom-next` / 非拡大 = null かつ
  `sendBytesFor` がバイト列を返す。**無条件側の対照**として `terminal-new` が両状態で
  発火することも押さえた（例外が例外のままであることの担保）
- `test/common` + `gridShortcut.spec.ts` + `keymap-check.spec.ts` で **930 tests green**、
  `vue-tsc -b` / `eslint` / `prettier` すべて exit 0

**`test/src/components/GridView.spec.ts` だけはローカルで実行できていない。** worktree の
`node_modules` が symlink なので vite の `fs.allow` が worktree 外のパスを拒否する
（`Denied ID .../@mulmoclaude/markdown-plugin/dist/style.css?inline`）。**変更を stash しても
同じエラーが出る**ことを確認済みで、変更とは無関係。ここは CI が検証する。

