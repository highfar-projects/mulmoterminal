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

### D1: `PORT` は**値**で判断する（名前だけでは決められない）

#989 は「ユーザー自身が export した値と区別できない」ため NODE_ENV を自動 scrub しないと決めた。
`PORT` は **MulmoTerminal 自身が読む名前**（`server/config/env.ts:20`、`--port` > `PORT` > 34567）
なので、そこには識別可能な「我々の値」がある —— **今 listen しているポート**。それを全セルに配ることは
「すでに我々が握っているアドレスを bind しろ」と dev サーバに言うのと同じで、#1857 そのもの。

**ただし名前だけで決めると行き過ぎる（codex-review iter-1）。** `PORT=3000 mulmoterminal --port 34601`
では、我々の env の `PORT`（3000）は bind ポート（34601）ではなく**ユーザー自身の値**で、
#1873 Items 2 がセルに届いてよいと決めたもの。

**「残骸」を値から推測しようとするとさらに壊れる（codex-review iter-2）。** 一度
「ユーザーの値」として通した `PORT=3000` は tmux サーバに残り、次に `PORT` 無しで起動したとき
「我々の env と違う ＝ 残骸」と判定してしまう。tmux 環境には provenance が無いので、
**残骸とユーザーの値は区別できない**。

結論としての規則は 1 行:

> **消すのは「今 listen しているポートと同じ値」だけ。**（`isOwnBindPort`）

| tmux グローバル env の値 | 判定 |
|---|---|
| bind ポートと同じ | **我々のもの** → 消す（#1857 の実害はこれだけ） |
| それ以外 | ユーザーの値と区別できない → **残す** |

クライアント側も同じ関数で、候補は「我々の env の `PORT`」だけなので
「`inherited === bound` のときだけ落とす」になる（`tmuxClientUnsetNames`）。

**受け入れたコスト**: 旧版の残骸のうち「今のポートと違う値」は回収できない。ただし回収できるのは
**報告されたケース（残骸＝そのときの bind ポート＝今も同じポートで動かしている）**で、かつ
**このサーバのアドレスを奪えるのはその値だけ**。別ポートを指す古い値は誰の実害にもならない。

rc で `export PORT=3000` している人は、そもそもセルの rc が同じ値を再設定するので失われない。

### D2: 起動時 scrub だけでは足りない（issue の提案は 1 の半分）

`SCRUBBED_NAMES` への追加は「すでに動いている tmux サーバ」しか直さない。2 の経路（新規作成）は
残り、しかも「tmux サーバが先に居たかどうか」で挙動が変わる不整合になる。そこで tmux **クライアント**
の env からも `PORT` を落とす。影響範囲は「新しく作られる tmux サーバが継承する env」だけ:
ペインの env は `new-session -e` 由来で、そこは触らない（`worktreeEnv` の `PORT` は従来どおり届く）。

### D3: `PORT` を判定するために `infra/tmux.ts` が `config/env.ts` を import する

`infra/` から `config/` を引くのはこのリポジトリで初（既存は全部コメント内の言及だけ）。代替は
`tmuxAvailable()` の 4 箇所の呼び出し側から bind ポートを渡すことだが、**渡し忘れた経路が黙って
何も scrub しない**という、この repo の CLAUDE.md が繰り返し警告している形になる。循環は無い
（`config/env.ts` は node builtins と `port-from-argv` しか引かない）。

### D4: 触らないもの

- **非 tmux 経路（`ptyEnv`）**: そこで落とすと #955 の「PTY サニタイザでユーザー自身の値を奪うのは
  違う」判断を覆すことになる。tmux が無い環境のフォールバックのみで、rc の値は rc が戻す。PR に明記。
- **`ANTHROPIC_API_KEY` の同型の非対称**（既存サーバなら scrub されるが、新規作成サーバには焼き付く）:
  同じ穴だが挙動の変更範囲が広いので今回は広げない。PR で報告する。

### D5: テストできる形にする

`scrubGlobalEnvironment()` は tmux を呼ぶので単体テストできない。判断だけを純関数
（`isOwnPort` / `isScrubbedGlobalEnvEntry` / `tmuxClientUnsetNames`、いずれもポートを引数で受ける）に
切り出してテストする。`pty-spawn-env.spec.ts` の tmux モックは `importOriginal` でこれらの純関数だけ
本物を使う —— 手書きのスタンドインを置くとスタンドインを pin することになるため。

## 変更

| 変更 | 場所 |
|---|---|
| `isOwnBindPort` / `isScrubbedGlobalEnvEntry`（値で判断する純関数）、`scrubGlobalEnvironment` を値ごと走査に | `server/infra/tmux.ts` |
| `tmuxClientUnsetNames`（新規作成される tmux サーバに焼き付けない名前）と `ownBindPort` | `server/infra/tmux.ts` |
| tmux クライアント spawn で `[...unset, ...tmuxClientUnsetNames(process.env.PORT, ownBindPort())]` | `server/session/pty-spawn.ts` |
| 純関数のテスト / クライアント env と `-e` の非対称のテスト | `test/server/infra/tmux.spec.ts`, `test/server/session/pty-spawn-env.spec.ts` |

## 実機検証（2026-08-30）

`SERVER_SOCKET` を一時的に `mt-i1919v` に変えて**ユーザーの稼働中 tmux サーバ（socket
`mulmoterminal`, port 34567, checkout `mulmoterminal5`）から隔離**し、scratch HOME /
scratch `CLAUDE_CWD` で実サーバを起動。**実ペインの env をペイン自身に `echo` させて**読んだ
（`/ws/launch?shell=1` = 永続シェルセル。`/ws/run` は ephemeral で tmux を通らないため、
#1873 の測定はこの経路を測れていなかった）。測定後、tmux サーバは kill、ソケット名は復元済み
（`git diff -- server/infra/tmux.ts` に socket 行が出ないことを確認）。

最終規則（iter-2 後）での測定:

| 条件 | 修正前 | 修正後 |
|---|---|---|
| **残骸**: 旧版の tmux サーバに `PORT=34719`、`--port 34719` で起動 | ペイン `RAW=[34719]` | ペイン `RAW=[]` / global `-PORT`（起動時 scrub で回収） |
| **生きた経路**: tmux サーバ未起動、`PORT=34719 mulmoterminal` | ペイン `RAW=[34719]` / global `PORT=34719` | ペイン `RAW=[]` / global に `PORT` 無し |
| **ユーザーの値**: `PORT=3000 mulmoterminal --port 34719`（iter-1） | ペイン `RAW=[3000]` | ペイン `RAW=[3000]` / global `PORT=3000`（**変えない**） |
| **再起動**: global に `PORT=3000` が残る状態で、`PORT` 無し + `--port 34719` で起動（iter-2 の repro） | ペイン `RAW=[3000]` | ペイン `RAW=[3000]`（**奪わない**） |
| どちらも `MULMOTERMINAL_PORT` | `MT=[34719]` | `MT=[34719]`（変わらず＝セルはサーバを見つけられる） |
| `worktreeEnv: { PORT: { kind: port, base: 3000 } }` のディレクトリ | — | ペイン `RAW=[3000]`（`-e` は無傷、#1367 は保たれる） |

補助的に測ったこと:

- tmux 3.6a のグローバル環境は `new-session` を実行したクライアントの env を丸ごと継承する
  （`env -i … PORT=34567 tmux -L … new-session` → `show-environment -g` に `PORT=34567`）
- `set-environment` / `has-session` は**サーバを起動しない**（`error connecting to …`, exit 1）
  ＝ サーバを作る経路は `ptySpawn` の tmux クライアントだけ、という前提の裏付け

## codex-review 対応（iter-1、2026-08-30）

`CODEX VERDICT: CHANGES REQUESTED` 1 件、**採用**。

> `server/session/pty-spawn.ts:226` unconditionally removes `PORT` from the tmux client, even when
> `--port` overrides it and leaves the raw value as a user-provided terminal setting. Preserve that
> value when it differs from MulmoTerminal's resolved bind port, and cover
> `PORT=3000 mulmoterminal --port 34601`.

初版の根拠「我々の env の `PORT` は定義上 bind ポート」は **`--port` があると成り立たない**。
D1 の規則を名前ベースから**値ベース**に書き換え、クライアント側も
「`inherited === bound` のときだけ落とす」に変更。グローバル側も同じ規則にしないと
「tmux サーバが先に居たかどうか」で `--port` 時の挙動が割れるため、両方を `isOwnPort` に寄せた。
実機で `PORT=3000 --port 34719` を測り、ペインが `RAW=[3000]` を保つことを確認（上表）。

## codex-review 対応（iter-2、2026-08-30）

`CODEX VERDICT: CHANGES REQUESTED` 1 件、**採用**。

> A user `PORT` that this patch deliberately allows through is not durable across the next
> MulmoTerminal restart. `PORT=3000 mulmoterminal --port 34601` → tmux サーバに 3000 が残る →
> `PORT` 無しで再起動すると `inherited` が undefined なので「残骸」と判定して消してしまう。

iter-1 の「我々の env と違う値＝旧版の残骸」という推測が誤り。**tmux 環境に provenance は無く、
残骸とユーザーの値は原理的に区別できない**。そこで規則を
「**bind ポートと同じ値だけ消す**」まで単純化し（`isOwnPort` → `isOwnBindPort`、`PortFacts` は不要に）、
回収できない残骸（別ポートを指す古い値）を**受け入れたコストとして明記＋テストで pin**した。
再起動 repro を実機で測定（上表）。

## ゲート

`yarn format` / `lint` / `typecheck` / `build` すべて 0。`yarn test` は **11763 passed / 50 skipped**
（790 ファイル、exit 0）。追加したテストは**修正を戻すと 4 件とも赤になる**ことを確認済み
（`SCRUBBED_NAMES` を戻す → tmux.spec 2 件、呼び出し側を戻す → pty-spawn-env.spec 2 件）。

なお、この作業コピーの `node_modules` は main より古く（`@mulmoclaude/core` 4.4.1 vs 4.4.2）、
最初の lint/typecheck が sharedApp 側で 40/48 件落ちていた。`yarn install` で解消。今回の変更とは無関係。
