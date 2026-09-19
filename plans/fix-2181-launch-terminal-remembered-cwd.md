# 再起動をまたいだセッションで「このディレクトリで新規ターミナル」が失敗する (#2181)

## 実在の確認（推測ではなく、入口からの1本の呼び出し鎖）

1. 電話がセッション一覧を引く → `listTerminalSessions()`（`hostSessionList.ts`）。
   一覧は `tmuxListSessionIds()` の生き残りを**含み**、各行の `cwd` は `cwdOfSession(id)` =
   `ptys.get(id)?.cwd ?? sessionCwd(id) ?? ""`。つまり **PtyEntry が無くても記憶された cwd が出る**。
2. 電話がその行で「ここで新規ターミナル」を押す → `launchTerminal(agent, sessionId)`
   （`handlers/terminalSession.ts:122` → `hostBindings.ts:60`）。
3. そこだけ `cwdOf: (id) => ptys.get(id)?.cwd ?? null` で、生き残りには `PtyEntry` が無いので `null`。
4. `decideLaunchTerminal` の `if (!cwd)` が
   `no working directory known for session '<id>'` で断る（`launchTerminal.ts`）。

**入力を供給しているのは手順1の一覧そのもの**で、そこには dir が表示されている。
tmux はサーバ再起動を設計上生き延びるので、これは例外状態ではなく**再起動のたびに起きる**。

`sessionCwds` は `~/.mulmoterminal/dev-terminal-cwds.json` に永続化され、起動時に hydrate される
（`registry.ts:518`）ので、再起動後も答えを持っている。

## 範囲 — 何を直し、何を意図的に残すか

**直す: cwd の規則、1箇所。** `hostBindings.ts` の `launchTerminal` が、他の読み手と同じ
`cwdOfSession` を使うようにする。`decideLaunchTerminal` は `if (!cwd)` なので、
`cwdOfSession` の「無ければ空文字」は `null` と同じに落ち、拒否の文言も変わらない。

**残す1: hydration の await。** `cwdForSessionHydrated`（`session-cwd.ts`）が存在するとおり、
`sessionCwd()` はブート時の非同期 hydrate の窓では空を返しうる。**この経路では到達不能**なので入れない:
`devTerminalCwdsHydrated` はモジュール評価時に1ファイルを読む IIFE で、数ミリ秒で解決する。
一方 Firestore runner はブラウザの Connect 操作（`/api/remote-host/connect`）でしか始まらない。
窓はとっくに閉じている。**起きえないケースへの修正は、実際のレビューを1回消費して本当の欠陥を隠す**ので入れない。

**残す2: agent の解決、3箇所。** `hostBindings.ts` の `canClearBox` / `submitSequence` /
`sessionAgent` はいずれも生の `ptys.get(id)?.agent` で、tmux にフォールバックする
`agentOfSession` を使っていない。同じ形の兄弟だが**別の規則**で、リスクが違う:
`submitSequence` は PTY に届く**バイト**を決めるので、生き残りに対して
「undefined（保守的に CR）」から「tmux が言うエージェント」へ変えるのは実挙動の変更になる。
本 issue の範囲外として PR に costed で報告する。

**残す3: `hostScreens.ts` の `cwdOf`。** こちらは `?? ""` で、コメントが
「再起動を生き延びたセッションは cwd も branch も持たないので、単に欠ける」と**意図として**書いている。
記憶された cwd を使うと、電話がポーリングする画面で毎回 git を叩くことになる。別途判断が要る。

## 直し方

- `hostBindings.ts` の `launchTerminal` の `cwdOf` を `cwdOfSession` にする。

## テスト

欠陥を**テスト可能な形**にする。規則の純粋部分（`decideLaunchTerminal`）は既にテスト済みなので、
欠陥があるのは**配線**のほう。`initRemoteHostBackend` を mock して渡された deps を捕まえ、
`launchTerminal` を配線ごと駆動する spec を書く:

- PtyEntry は無いが記憶された cwd がある → `ok: true`、その cwd が publish される（**これが再現テスト**）
- 生きた PTY の cwd が記憶された cwd に勝つ
- どちらも無い → 従来どおり断る
- ブラウザが1つも繋がっていない → 断る（cwd が解決できても）

先に赤にしてから直す。
