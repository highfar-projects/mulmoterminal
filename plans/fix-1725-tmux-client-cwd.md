# fix: tmux クライアントを消えうるディレクトリから起動しない (#1725)

## 症状

削除された worktree を握った tmux サーバーが残ると、**以後このホストで作られる全セッションが
起動直後に落ちる**。既存セッションは動き続ける。MulmoTerminal を再起動しても直らない
（壊れているのは tmux サーバー側）。ログに出るのは `code=0` と node-pty の EIO だけで、
どちらも原因を指さない。

## 真因 — tmux 3.7 の回帰

**tmux 3.7 以降でのみ起きる。** 3.6 以前は影響なし。実測で確定した機構:

1. **tmux サーバーの cwd は、`new-session` のたびにクライアントの cwd へ移動し、戻らない**

   ```
   start-server を $HOME から        -> server cwd = $HOME
   client を $D から new-session     -> server cwd = $D        ← 追従する
   client を $HOME から new-session  -> server cwd = $D のまま  ← 戻らない
   ```

2. `spawn_pane()` の chdir が `getcwd()` で guard されている。サーバーの cwd が消えると
   `getcwd()` が失敗し、**chdir ごとスキップされる**。以後 `-c <実在するディレクトリ>` を
   明示しても、新しい pane は消えたパスで起動する（上流 tmux/tmux#5473 がソース行を特定）

3. `claude` はネイティブバイナリで起動時に `getcwd()` を呼ぶので、そこで即 abort する。
   `sh` は `pwd` のエラーを出して続行するため、shell のセルでは症状が出にくい

`server/session/pty-spawn.ts` は tmux クライアントを **セルの cwd から** 起動していた:

```ts
spawnPty("tmux", tmuxNewSessionArgs(sessionId, file, args, cwd, env), cwd, unset)
//                                      ^^^ -c cwd（pane の位置）      ^^^ クライアントの cwd
```

`cwd` が二重に渡っている。pane の位置は `-c` が決めるので後者は本来不要だが、それが
「worktree のセルを開くとサーバーがその worktree に移動する」を作っていた。

## 直し方

**tmux クライアントだけ `os.homedir()` から起動する。** `-c` はそのまま。

- pane の着地先は変わらない（`-c` が決めている。3.7b / 3.6a 両方で確認）
- 非 tmux の直接 spawn は**変えてはいけない**。あちらは cwd がプロセスの cwd そのもの

### 採らなかった案

**`tmux start-server` を安定した cwd から先に打つ。** issue の Suggested fix 1 で「本丸」と
されていたが、**実測で効かない**。最初の `new-session` がサーバーを動かしてしまうため。

## 検証

1. **機構の実測** — Homebrew の tmux 3.7b ボトルを scratch に展開（インストール済みの 3.6a は
   触らない）。3.7b でのみ再現、3.6a では再現しない
2. **end-to-end** — アプリの実 `tmuxNewSessionArgs` と実 `claude` バイナリで:

   | | pane |
   | --- | --- |
   | 修正前（クライアントをセルの cwd から） | (empty) — セッション即死 |
   | 修正後（`TMUX_CLIENT_CWD`） | `/Users/isamu` / `2.1.233 (Claude Code)` / `EXIT=0` |

3. **単体テスト** — `pty-spawn-env.spec.ts` に 3 件。tmux クライアントが `TMUX_CLIENT_CWD` から
   起動すること、pane には**セルの**ディレクトリが渡ること、非 tmux は今までどおりセルで走ること
4. **負の対照** — 修正を巻き戻すと新テストだけが赤になることを確認済み

## 残る穴（この PR では直さない）

**既に壊れているサーバーは回復しない。** この修正は毒を作らないだけで、既に消えた cwd を握って
いるサーバーには `tmux -L mulmoterminal kill-server` が要る。

回復まで入れるなら、issue の Suggested fix 2（`diedDuringStartup` が tmux 経由で発火しない）と
合わせて「起動直後に落ちた + tmux 経由なら、サーバーが消えたディレクトリを握っている可能性を
1 行出す」が筋。別 issue にする。
