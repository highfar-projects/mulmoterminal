# feat: 既定エージェントを宣言できるようにし、宣言があれば Claude Code 必須を外す

issue: #2082

## 何を変えるか

`npx mulmoterminal` は起動時に `claude` が PATH に無いと `process.exit(1)` する
(`bin/mulmoterminal.js:621`)。Codex や Copilot だけの環境ではアプリに一度も到達できない。

**方針(ユーザー判断)**: ゲートを撤廃はしない。**既定の状態では Claude Code を必須のまま残し**、
CLI オプションか設定で**既定エージェントが宣言されている場合にだけ** Claude のチェックを外す。

issue の提案 3(「インストール済みの先頭を自動で既定にする」)は**採らない**。自動判定は
「なぜこのエージェントが起動したのか」を利用者が説明できない状態を作る。宣言は明示的にする。

## 先に分かった落とし穴 — 「既定エージェント」は 2 つの別物を指す

`src/components/gridTabs.ts:124` のコメントが明言している:

> Claude is stored as the ABSENCE of the field, so a cell written before the field existed and a
> cell running Claude are the same thing on disk.

同じ規約が `src/components/wsUrl.ts:186`(claude 以外のときだけ `?agent=` を付ける)と、
`src/` の `?? "claude"` **14 箇所**(リテラル比較まで数えると **22 箇所**)に通っている。つまり:

| | 正体 | 新設定で変えてよいか |
|---|---|---|
| `agent` フィールドが**無い**ときの意味 | **保存形式・ワイヤ形式** | **だめ**。変えると保存済みセルが一斉に別エージェントとして復元される |
| **新しく**起動するときの初期値 | 利用者の好み | **これが新設定** |

素直に `?? "claude"` を新設定に差し替えると、Claude セルを 9 枚保存している利用者が
`defaultAgent: "codex"` にした瞬間、9 枚すべてが codex セルとして復元される。**やらない。**

設定は**起動時にだけ**解決し、**保存済みデータを読む側の `?? "claude"` は 1 つも触らない**。
非 claude は常に明示的に保存されるので、「無い = claude」は claude セルにしか生じず、形式は安全。

## 設計

### 1. 宣言の置き場所(2 つ、CLI が勝つ)
- CLI: `--agent <name>`
- グローバル設定 `~/.mulmoterminal/config.json` の `defaultAgent`
- CLI で指定された値は環境変数でサーバ子プロセスへ渡す(設定ファイルはサーバが自分で読む)

### 2. ゲート(`bin/mulmoterminal.js`)
- 宣言が**無い**: 今までどおり Claude Code 必須 — ただし下記 3 の不具合を直した上で
- 宣言が**ある**: claude は一切見ない。**宣言されたエージェントのバイナリ**を見て、
  無ければそのエージェント名で説明する

### 3. 同時に直す不具合: ゲートが `CLAUDE_BIN` を無視する
サーバ側は `process.env.CLAUDE_BIN || "claude"`(`server/agents/claude.ts:18`, README 記載の
公式 env)。一方ゲートは PATH 上の `claude` を直接探すので、`CLAUDE_BIN` を指していて実体が
あっても起動を拒否する。**今 Claude Code を使っている利用者に当たる不具合**であり、
その判定式を書き換える PR で既知の不具合を残す方が悪いので同じ変更に含める。

### 4. バイナリ表の共有
7 エージェントすべて `process.env.<AGENT>_BIN || "<既定名"` の同型。ただし
`antigravity → agy`、`cursor → cursor-agent` とキーと既定名が違う。
`bin/` は素の JS、サーバは TS だが、**サーバは既に `bin/instances.js` を import している**ので
同じ向きで JS の表を 1 つ置き、サーバの `AGENT_BINS` と**ズレないことを spec で固定**する。

### 5. UI
- 起動フォーム/ピッカーの**初期値**が宣言された既定エージェントになる
  (`LaunchPanel.vue:51`、`LaunchAgentPicker.vue:38` の `nonDefaultOnly` 比較)
- **保存済みセルを読む経路は 1 つも変えない**(上記の落とし穴)

### 6. エラー文とガイド(ユーザー要望)
- Claude Code が無いときのエラーに**簡潔な説明**を出し、詳細は web ガイドへ誘導する
  (`https://receptron.github.io/mulmoterminal/guide/{en,ja}/`)
- `docs/guide/{en,ja}` に説明を書く。README の Required 行(:266)と説明(:277)も更新

## やらないこと
- `?? "claude"` の置換(上記のとおり保存形式)
- 「インストール済みの先頭を自動で既定にする」自動判定
- `/api/agents` 相当の可用性 API(issue が挙げる別スコープ)

## 検証
- 宣言あり/なし × claude あり/なし × `CLAUDE_BIN` あり/なし をテストで固定
- バイナリ表がサーバの `AGENT_BINS` とズレないことを spec で固定
- `yarn format` / `lint` / `typecheck` / `build` / `test`
