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
- CLI で指定された値は **argv** (`--agent <id>`) でサーバ子プロセスへ渡す(設定ファイルはサーバが自分で読む)。
  **環境変数は使わない**: サーバは自分の環境を全 PTY に渡すので、環境に置いた設定は全セルの
  全ターミナルに届く — #955 (`NODE_ENV`) と #1857 (`PORT`) と同じ形で、`--port` が環境から
  argv に移された理由そのもの (`server/config/port-from-argv.ts`)

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

## 追記: ゲートの判定基準を「起動できるもの」に反転させた(レビュー 7 巡目)

`bin/has-command.js` に findings が 3 回続いた(2 巡目: `.cmd` を `execFileSync` で起動できない、
6 巡目: 起動できるマシンを拒否した、7 巡目: 起動できないマシンを通した)。個別対処をやめ、
**判定基準そのものを反転**した — ゲートは「何が起動できるか」という独自の理屈を持たない。

- 候補拡張子は **`server/infra/resolve-bin.ts` が起動できる閉じた集合**
  (`""` / `.exe` / `.com` / `.cmd` / `.bat`)。**PATHEXT は読まない**。
  標準の PATHEXT は `.VBS` `.JS` `.WSF` `.MSC` も含み、どれも CreateProcessW は実行できない。
  しかも PATHEXT を「集合の代わり」に使っていたため**逆方向にも壊れていた**:
  `PATHEXT=.PS1` だと実在する `claude.exe` を見落として起動を拒否する。
  生成した Windows マシン 1715 通りで実測 — 緩すぎ 49 件、**厳しすぎ 24 件(誰も報告していなかった)**。
- カレントディレクトリを探索しない。cmd.exe は探すが node-pty は探さず、
  そもそもこのプロセスの居場所は起動ディレクトリであってセッションの作業ディレクトリではない。
- パスを含む名前は**完全一致**。node-pty はそのパスだけを見るので、
  `CLAUDE_BIN=C:\tools\claude` の隣に `claude.exe` があっても起動はしない。

`test/bin/gate-agrees-with-spawn.spec.ts` が、ゲートとサーバの `hasBinary` を
生成した Windows 1715 通り・POSIX 217 通りで突き合わせる(不一致 0)。
2 つは共有できない(`bin/` は素の JS、`server/` は tsx 経由の TS)ので、
`bin/agent-bins.js` と同じく**比較でズレを止める**。

## 追記: グリッド内の空セルが既定エージェントで開いていなかった(レビュー 8 巡目)

`LaunchPanel` は既定エージェントを読んでいたが、**グリッド内の空セル**(`ensureEntry` が
空グリッドに 1 つだけ置く「入口セル」)は読んでいなかった。新規ユーザーが最初に押す Start が
そこなので、「新しいセルがそのエージェントで開きます」というガイドの記述が偽になっていた。
codex を宣言して claude が入っていないマシンでは、その Start が存在しないものを起動しようとする。

直す場所は **表示層**であって状態ではない。セル状態に既定エージェントを書き込むと、
それが永続化されて保存済みセルを書き換えてしまう — この PR が避けるべき当のもの。
`emit("agent", …)` は `launchIn` / `resumeSession`(= 実際に起動したとき)でしか発火しないので、
ピッカーの**初期値**を変えても保存内容は動かない。

境界そのものを純粋関数 `src/components/cellLaunchAgent.ts` に切り出した:

> セッションも保存 agent もラッパーも無いセルだけが、設定を読む。

- セッションがある → 復元。`agent` の不在は claude を意味する**保存形式**なので設定は読まない。
- `agent` が入っている / カスタムエージェント → そのセルは既に何を動かすか答えている。
- どれも無い → これから**始める**セッション。設定が答える唯一の問い。

設定は HTTP で遅れて届き、入口セルはそれより先に mount するので、`defaultAgentRef` の watch で
後から適用する。ただし **ユーザーが既に選んでいたら上書きしない** —
`seedLaunchAgentFromConfig` が 5 巡目で記録したのと同じレース。

**`autoStart` も「不在 = claude」側**である点が最大の罠だった。スマホや launch panel からの
「ここで Claude を起動」要求は `{ session: null, autoStart: true }` で **agent フィールドを持たない**
(`src/components/launchCell.ts`)。この節を入れ忘れると、**claude を名指しした要求が**既定エージェントで
開いた上に mount 時にそのまま起動する。Codex も見落としており(C-bis で述語を承認している)、
述語を書いた後の自己レビューで見つけた。

`test/src/components/cellLaunchAgent.spec.ts` が境界を両方向で、
`test/src/components/cellDefaultAgent.spec.ts` が**配線**を(規則が正しくてもセルが従うとは限らない)
固定する。復元セルは form を描画しないので、その回帰は `TerminalView` に渡る `agent` で見る。
mutation 5/5 が red。

### 同時に直した: `--agent` のパーサが 2 つあった

`bin/default-agent.js` の `parseAgentArg` は `--agent=codex` も受けるが、
`server/config/agent-from-argv.ts` に書いた独自コピーはスペース形式しか受けなかった。
ランチャーは常にスペース形式で再送するので通常経路では見えないが、
**サーバを直接起動したとき**(`yarn dev --agent=codex`)は警告すら出ずに黙って落ちる —
この関数がまさに存在する理由のケース。ランチャー側のパーサを再利用して 1 つにした
(サーバは既に `bin/*.js` を 5 箇所で import している)。Codex の指摘ではなく自分で見つけたもの。
