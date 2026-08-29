# fix(#1919): tmux サーバのグローバル環境から `PORT` を消す（残骸 + 生きた経路）

## 問題

`PORT` を配るのをやめた #1857/#1873 の後も、セルに `PORT`（= MulmoTerminal 自身の bind ポート）が
届く経路が 2 つ残っている。どちらも **ペインの env が tmux サーバのグローバル環境から来る**という
#989 が特定した性質による。

1. **残骸（issue #1919 の報告）** — 修正前の版が起動した tmux サーバが生き延びていると、その
   グローバル環境の `PORT` が新規ペイン全てに配られ続ける。MulmoTerminal を上げても消えない。
2. **生きた経路（コードを読んで見つけた分）** — `PORT=34601 mulmoterminal` で起動すると
   `server/config/env.ts:8` の通り `process.env.PORT` がサーバのプロセス env に残る。tmux サーバが
   未起動なら、最初の spawn（`spawnPty("tmux", …)`）がその env ごと tmux サーバを**新規作成**するので、
   `PORT` がグローバル環境に焼き付き、以後の全ペインに配られる。4.13.0 で起きる。

実害は #1857 と同じ: セル内の dev サーバ（`next dev` 等）が `PORT` を読んで MulmoTerminal の
ポートを bind し、ブラウザが切断される。

## 実測（scratch ソケット `mt-i1919`、tmux 3.6a）

```
env -i PATH=… HOME=… PORT=34567 tmux -L mt-i1919 new-session -d …
tmux -L mt-i1919 show-environment -g   → PORT=34567
新規ペイン                              → PORT=[34567]
tmux -L mt-i1919 set-environment -g -r PORT
新規ペイン                              → PORT=[]
```

`set-environment` / `has-session` は**サーバを起動しない**ことも確認済み（`error connecting to …`,
exit 1）。つまりサーバを作るのは `new-session`＝ `ptySpawn` の tmux クライアントだけ。

## 判断

### D1: `PORT` は scrub してよい。`NODE_ENV`（#989）と違う理由

#989 は「ユーザー自身が export した値と区別できない」ため NODE_ENV を自動 scrub しないと決めた。
`PORT` はその論法が当たらない: **`PORT` は MulmoTerminal 自身が読む名前**（`server/config/env.ts:8`、
`--port` > `PORT` > 34567）なので、**我々の** tmux サーバのグローバル環境にある `PORT` は定義上
「MulmoTerminal が今 listen しているポート」でしかない。それを全セルに配ることは、
「すでに我々が握っているアドレスを bind しろ」と dev サーバに言うのと同じで、#1857 そのもの。

rc で `export PORT=3000` している人は、セルの rc が同じ値を再設定するので失われない。
失われるのは `PORT=34601 mulmoterminal` のような**一度きりの前置き**だけ＝ leak そのもの。

### D2: 起動時 scrub だけでは足りない（issue の提案は 1 の半分）

`SCRUBBED_NAMES` への追加は「すでに動いている tmux サーバ」しか直さない。2 の経路（新規作成）は
残り、しかも「tmux サーバが先に居たかどうか」で挙動が変わる不整合になる。そこで tmux **クライアント**
の env からも `PORT` を落とす。影響範囲は「新しく作られる tmux サーバが継承する env」だけ:
ペインの env は `new-session -e` 由来で、そこは触らない（`worktreeEnv` の `PORT` は従来どおり届く）。

### D3: 触らないもの

- **非 tmux 経路（`ptyEnv`）**: そこで落とすと #955 の「PTY サニタイザでユーザー自身の値を奪うのは
  違う」判断を覆すことになる。tmux が無い環境のフォールバックのみで、rc の値は rc が戻す。PR に明記。
- **`ANTHROPIC_API_KEY` の同型の非対称**（既存サーバなら scrub されるが、新規作成サーバには焼き付く）:
  同じ穴だが挙動の変更範囲が広いので今回は広げない。PR で報告する。

### D4: テストできる形にする

`scrubGlobalEnvironment()` は tmux を呼ぶので単体テストできない。判断だけを純関数
`isScrubbedGlobalEnvName(name)` に切り出し、集合の中身をテストする。

## 変更

| 変更 | 場所 |
|---|---|
| `SCRUBBED_NAMES` に `PORT`、判断を純関数 `isScrubbedGlobalEnvName` に切り出し | `server/infra/tmux.ts` |
| `TMUX_CLIENT_UNSET_NAMES`（新規作成される tmux サーバに焼き付けない名前） | `server/infra/tmux.ts` |
| tmux クライアント spawn で `[...unset, ...TMUX_CLIENT_UNSET_NAMES]` | `server/session/pty-spawn.ts` |
| 純関数のテスト / クライアント env と `-e` の非対称のテスト | `test/server/infra/tmux.spec.ts`, `test/server/session/pty-spawn-env.spec.ts` |

## 実機検証（2026-08-30）

`SERVER_SOCKET` を一時的に `mt-i1919v` に変えて**ユーザーの稼働中 tmux サーバ（socket
`mulmoterminal`, port 34567, checkout `mulmoterminal5`）から隔離**し、scratch HOME /
scratch `CLAUDE_CWD` で実サーバを起動。**実ペインの env をペイン自身に `echo` させて**読んだ
（`/ws/launch?shell=1` = 永続シェルセル。`/ws/run` は ephemeral で tmux を通らないため、
#1873 の測定はこの経路を測れていなかった）。測定後、tmux サーバは kill、ソケット名は復元済み
（`git diff -- server/infra/tmux.ts` に socket 行が出ないことを確認）。

| 条件 | 修正前 | 修正後 |
|---|---|---|
| **残骸**: 旧版の tmux サーバに `PORT=59999`、`--port 34719` で起動 | ペイン `RAW=[59999]` / global `PORT=59999` | ペイン `RAW=[]` / global `-PORT`（起動時 scrub で回収） |
| **生きた経路**: tmux サーバ未起動、`PORT=34719 mulmoterminal` | ペイン `RAW=[34719]` / global `PORT=34719` | ペイン `RAW=[]` / global に `PORT` 無し |
| どちらも `MULMOTERMINAL_PORT` | `MT=[34719]` | `MT=[34719]`（変わらず＝セルはサーバを見つけられる） |
| `worktreeEnv: { PORT: { kind: port, base: 3000 } }` のディレクトリ | — | ペイン `RAW=[3000]`（`-e` は無傷、#1367 は保たれる） |

補助的に測ったこと:

- tmux 3.6a のグローバル環境は `new-session` を実行したクライアントの env を丸ごと継承する
  （`env -i … PORT=34567 tmux -L … new-session` → `show-environment -g` に `PORT=34567`）
- `set-environment` / `has-session` は**サーバを起動しない**（`error connecting to …`, exit 1）
  ＝ サーバを作る経路は `ptySpawn` の tmux クライアントだけ、という前提の裏付け

## ゲート

`yarn format` / `lint` / `typecheck` / `build` すべて 0。`yarn test` は **11763 passed / 50 skipped**
（790 ファイル、exit 0）。追加したテストは**修正を戻すと 4 件とも赤になる**ことを確認済み
（`SCRUBBED_NAMES` を戻す → tmux.spec 2 件、呼び出し側を戻す → pty-spawn-env.spec 2 件）。

なお、この作業コピーの `node_modules` は main より古く（`@mulmoclaude/core` 4.4.1 vs 4.4.2）、
最初の lint/typecheck が sharedApp 側で 40/48 件落ちていた。`yarn install` で解消。今回の変更とは無関係。
