# fix(cli): PORT を launcher が読み、server へは argv で渡す (#1861 / #1857)

> **この文書の読み方 —— 時系列のログであって、現状の仕様書ではない。**
>
> 設計時の判断・実測・レビュー対応を、起きた順に記録している。**節の見出しに「（設計時）」
> と付いたものは、その時点のコードについての記述**で、以後の修正で当てはまらなくなっている
> ことがある（当てはまらなくなった経緯も、消さずに後ろの節に書いてある）。
>
> **現在のコードの仕様はコードが唯一の情報源。** この文書のコード片や関数シグネチャを、
> 現在のものとして引用しないこと。codex-cross-review round 3・4 が拾ったのは、まさにこれを
> 現在の主張として読める形で置いていたため。

## 症状

- `PORT=34601 npx mulmoterminal` が **34567 で起動する**。`--port` だけが効く (#1861)
- ポート衝突時のメッセージが、その効かない `PORT=<n>` を使えと言う
- launcher が置いた生の `PORT` が全 PTY に配られ、セル内の dev サーバーが
  MulmoTerminal のポートを掴みにいって落ちる (#1857)

両方とも `bin/cli-args.js` の同じ 1 行が発生源。

## 再現（設計時、修正前のコードに対する 2026-08-27 の実測）

**下の 2 行は修正前のシグネチャで、現在のツリーでは動かない**（現在は
`parsePortArg(args, env, defaultPort)` と `serverSpawnEnv(env, cwd)`）。バグが実在したことの
記録として残してある。

```
# 修正前（origin/main 51067ecb）の signature に対して
parsePortArg([], 34567)                        -> {"port":34567,"explicit":false}   # env 完全無視
serverSpawnEnv({PORT:'34601'}, 34567, '/x')    -> {"PORT":"34567","CLAUDE_CWD":"/x"} # 上書き
```

## なぜ「MULMOTERMINAL_PORT に改名」では駄目か

`MULMOTERMINAL_PORT` は `server/session/mcp-config.ts:75` が **意図してセル内の全 PTY に配って
いる**（MCP URL と bundled skills がそれを読む）。server がそれを bind ポートとして読むと、
セル内で `yarn dev` した瞬間に MulmoTerminal 自身のポートを掴みにいく — #1857 が名前を変えて
再発するだけになる。

PTY サニタイザで落とす案も採らない。`sanitizePtyEnv` は **ユーザー自身が export した値を残す**
のが役目で、`NODE_ENV` を #955 で launcher 側に直したのと同じ理由（`test/server/infra/pty-env.spec.ts`
のコメントが明示している）。

→ **argv で渡す。** argv は PTY に継承されないので leak 面がゼロになる。

## 変更（設計時の計画。実際に入ったものは下の「code-review 対応」まで読むこと）

1. `parsePortArg(args, env, defaultPort)` — 優先順位 **`--port` > `env.PORT` > default**
   （`bin/room.js:54` が既に持っている順序に合わせる）
   - env 由来も `explicit: true`。ユーザーがポートを名指ししている以上、埋まっていたときに
     別ポートで 2 個目を提案するのは訊かれていない質問への答えになる（`--port` と同じ理屈）
   - 不正値 (`PORT=abc`) は `--port` と同じくエラーで停止。黙って default に落ちるのは
     「設定したのに効かない」という今回のバグそのもの。**空文字・未設定は default へ**
2. `serverSpawnEnv(env, cwd)` — `PORT` を足すのをやめる（#1857 の発生源）。
   ユーザー自身の `PORT` はそのまま通す
3. `serverNodeArgs(serverEntry, launchDir, port)` — `--port <n>` を script 引数として付ける
4. `server/config/env.ts` — `ARGV_PORT ?? (process.env.PORT || 34567)`、`ARGV_PORT = portFromArgv(process.argv)`
   - **`??` ではなく `||` なのは意図的。** `PORT=""` は `??` だと空文字が通ってしまい、
     `Number("")` = 0 でランダムポートに bind する。空文字は「値なし」でなければならない
   - launcher 経由: argv が勝つ
   - `yarn dev` 経由: `PORT`（`vite.config.ts:9` が同じ変数でプロキシ先を決めているので、
     この経路は従来どおりでなければならない）
5. `server/infra/server-exit.ts:25` の `set PORT=<n>` は **変更しない**。1 によって
   launcher 経由でも実際に効くようになるため、メッセージが真になる

## 触らないもの

- `server/session/mcp-config.ts` の `MULMOTERMINAL_PORT`（PTY 向け、正しい）
- `scripts/dev-server-config.js` の `set PORT=<n>`（dev 経路では元から正しい）

> **当初ここに `bin/room.js` を「既に `PORT` を読むので触らない」と書いていたが、これは誤り
> だった。** room がセル内で読んでいた `PORT` の唯一の供給源が、この変更で消す行そのもの
> だったため、触らなければ room が別インスタンスに話しかける。code-review が見つけた。
> 実際の変更は下の「code-review 対応」節の 1 番。

## 検証（設計時に立てた計画。実施結果は下の実機検証・再検証の節）

- ユニット: `parsePortArg` の優先順位・不正値・explicit、`serverSpawnEnv` に `PORT` が無いこと、
  `serverNodeArgs` が `--port` を entry の **後ろ** に置くこと、`portFromArgv` の純関数テスト
- 実機: `PORT=<n> node bin/mulmoterminal.js` で起動し、その番号で `GET /` が 200 を返すこと。
  `--port` が `PORT` に勝つこと。セル内 PTY の env に生の `PORT` が入らないこと

## 追加で分かったこと

- `worktreeEnv` の `{"PORT": {"kind":"port"}}`（`server/config/worktree-env.ts`）は、ディレクトリごとに
  **意図して** `PORT` を配る opt-in 機能。launcher が生の `PORT` を全 PTY に撒いていた間は、
  この機能を使っていないディレクトリにも `PORT` が入っていた。今回の変更で「`PORT` が入るのは
  ユーザーが export したときか、この機能を有効にしたときだけ」になる
- `bin/room.js` は `Number(...)` で不正値を黙ってデフォルトに落とす。今回 launcher 側だけ
  厳しくしたので、`PORT=abc mulmoterminal` は止まるが `PORT=abc mulmoterminal room` は 34567 を使う。
  room は既存サーバに話しかけるだけで bind しないので、**不正値の扱いは**触っていない（レビュー対象）。
  ただし **room の優先順位そのものは変更した** —— `--port` > `MULMOTERMINAL_PORT` > `PORT` > default。
  理由は下の「code-review 対応」節の 1 番

## 実機検証（2026-08-27、clean env + scratch HOME で実施）

| 条件 | 結果 |
|---|---|
| `PORT=34611`（`--port` なし） | `Starting MulmoTerminal on port 34611` / `GET / -> 200` |
| `--port 34612` + env に `PORT` なし | `port 34612` / `GET / -> 200` |
| `PORT=abc` | `Invalid PORT value: "abc" (expected integer 1..65535)`、exit 1、サーバは起動しない |
| 実 PTY（`/ws/run`）の env | `RAWPORT=[]` — 生の `PORT` が入らないことを実測（#1857） |

`MULMOTERMINAL_PORT` について、**測れた範囲と測れていない範囲**（後続の追試で範囲が変わったので、
ここに最新の切り分けを置く）:

- **測れた**: シェル PTY（`/ws/run`）に `MTPORT=[34614]` / `[34615]` が届くこと。tmux 有り・無しの
  両方で実測（下の 2 節）。これは `spawnEnvFor` 経由で、**全 PTY 共通の経路**
- **測れていない**: エージェントセル（claude 等）の env を直接読むこと。`ps eww` が
  このセッションでは実行できないため。ただしエージェントセルは上の共通経路に加えて
  `spawn-claude.ts:195` の `guiMcpEnv(sessionId, PORT)` が同じ名前に同じ値を重ねるだけで、
  その `PORT` は `server/config/env.ts` の同じ定数 —— 正しさは 34611/34612 に bind したこと自体が示す

## tmux 経路の検証（2026-08-27 追試）

初回の実機測定は `env -i` の最小 PATH に tmux が無く、ログに `[tmux] not found` が出ていた
＝ tmux を通らない直接 spawn しか測れていなかった。`server/infra/tmux.ts` の `SERVER_SOCKET` を
一時的に `mt-porttest` へ変えて**ユーザーの稼働中 tmux サーバから隔離**し、再測定した。

```
[tmux] persistence on
tmux -L mt-porttest show-environment -g | grep -iE '^-?PORT=|^-?MULMOTERMINAL_PORT=|^-?NODE_ENV='
  -> (何も出ない)
```

#989 が「ペインは mulmoterminal のプロセスではなく **tmux サーバーの環境**を継承する」と特定した
その環境に `PORT` が入らないことを確認。テスト後、tmux サーバは kill、ソケット名は復元済み
（`git diff -- server/infra/tmux.ts` が空であることを確認）。

**残留は別問題として残る。** 修正前の版が起動した tmux サーバが生き残っている場合、そのグローバル
環境の `PORT` は配られ続ける。#989 は「ユーザー自身が export した値と区別できない」ため
**自動 scrub しない**方針で CLOSE されており、同じ判断を踏襲するなら回避策の案内になる:
`tmux -L mulmoterminal set-environment -gu PORT`

## code-review 対応（2026-08-27、`/code-review high`）

5 件の指摘。うち 1 件は**私が入れた本物のリグレッション**だった。

### 1. `mulmoterminal room` がセル内で壊れる（対応済み・最重要）

`bin/room.js:54` はサーバの場所を `process.env.PORT` からしか得ておらず、セル内でのその値の
唯一の供給源が、今回消した launcher の `PORT` だった。34567 以外で動かしていると `room` は
**別インスタンスに話しかける**。

対応:
- `server/session/pty-spawn.ts` の `spawnEnvFor` で **全 PTY** に `MULMOTERMINAL_PORT` を渡す
  （従来は `guiMcpEnv` 経由でエージェント spawn だけだった）
- `bin/room.js` の優先順位を `--port` > `MULMOTERMINAL_PORT` > `PORT` > default に

**置き場所を最初 `ptyEnv` にして間違えた。** tmux パスではペインの env が `new-session -e` から
来るので `ptyEnv` の値は届かない（`ptySpawn` のコメントが明記している）。追加したテストが赤で
捕まえたので `spawnEnvFor` に移した。両パスがここから作られる。

### 2. ユーザー自身の `PORT` は依然 PTY に届く（仕様として明記）

`export PORT=3000` していると launcher は 3000 に bind し、`serverSpawnEnv` はその `PORT` を
素通しするので PTY にも入る。セル内の `yarn dev` は 3000 を掴もうとして衝突する。
ただしこれは #1857 が要求した挙動そのもの（「`PORT` は自分が設定したときだけ入っていてほしい」）で、
セルはユーザーのシェルと同じ振る舞いをしている。**変更せず、PR に明記する。**

### 3. どこから来た番号か分からない（対応済み）

`.envrc` やシェルプロファイル由来の `PORT` で黙って別ポートに行くのを避けるため、
`--port` が無く env 由来のときだけ `Port <n> comes from the PORT environment variable` を出す。
`portInUseAction` の「An explicit --port already named...」という古くなったコメントも直した。

### 4. server 側の不正な `--port` が無言（対応済み）

`server/config/env.ts` で、`--port` があるのに解釈できなかった場合に警告を出す。

### 5. README（対応済み）

`--port <n> (default 34567)` に `PORT` の記載を追加。`printHelp` は先に直していた。

## 再検証（tmux 隔離、2026-08-27）

| 条件 | 結果 |
|---|---|
| `PORT=34614`（`--port` なし）+ tmux | `Port 34614 comes from the PORT environment variable` / 34614 で起動 |
| 同上の実 PTY | `RAWPORT=[34614] MTPORT=[34614]` — 生 PORT はユーザー自身の値、名前空間付きも届く |
| `--port 34615`、env に `PORT` なし + tmux | `RAWPORT=[] MTPORT=[34615]` — leak 無し、セルはサーバを見つけられる |
| `MULMOTERMINAL_PORT=34615 mulmoterminal room list` | exit 0（到達） |
| `MULMOTERMINAL_PORT=34699` で同上 | `could not reach the server at http://localhost:34699` |

ゲート: format / lint / typecheck / build すべて 0。`yarn test` は **commit 77db6135 の時点で
11438 passed**（sha に紐づけた事実なので、あとから増えても嘘にならない）。
