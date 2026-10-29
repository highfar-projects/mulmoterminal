# refactor: code scanning の duplicate-code アラート #233 を共有化で解消する (#3209)

`duplication-scan`（jscpd 5.0.12）の open アラートは 1 件。SARIF は片側の位置しか持たないので、
対は CI と同じ引数でのローカル実行で特定する（`plans/refactor-jscpd-duplicates-3069.md` と同じ手順）。
リポジトリ全体でこの 1 対だけが報告される。

| alert | 片側 | 対 |
| --- | --- | --- |
| 233 | `server/session/spawn/spawn-shell.ts` `spawnLauncherPty` | 同ファイル `spawnBotJobPty`（#3184 で追加） |

## 重複していたもの

エントリを登録し、出力をバッファに流し、終了時に「ログ → flush → `reportPtyExit`」を行う 7 行。
これは 6 つのエージェント起動が既に共有している `wireAgentPtyRelay`（`server/session/pty/pty-relay.ts`）の
本体そのもの。シェル側がそれを使えなかった理由は終了ログの語だけ: シェルのエントリは電話向けに
`agent: "shell"` を記録するが、ログは開始行に合わせて `launcher` / `bot-job` と書く。

## 変更

- `wireAgentPtyRelay` の第 5 引数を options オブジェクトにする。`onOutput`（codex が渡していた tap）と、
  終了行の語を上書きする `loggedAs` を持つ。既存のエージェント呼び出し 6 件のうち、引数を渡していた
  codex だけが `{ onOutput: autoRun }` になる。
- `spawnLauncherPty` / `spawnBotJobPty` は登録のあと `wireAgentPtyRelay(..., { loggedAs: "launcher" | "bot-job" })` を呼ぶ。
  bot job の `publishSessionCreated` は登録の後のまま。
- 関数名 `wireAgentPtyRelay` は変えない。シェルからも呼ぶので名前は少しずれるが、改名は 6 呼び出し + mock する
  3 spec に及ぶ別の変更で、単独で戻せるので別 PR の範囲。

## 検証

旧 `spawn-shell.ts` を作業領域に写し（import を絶対パスに）、新旧を同じ入力で走らせて痕跡を丸ごと比較した。
痕跡は葉で取る: `ptySpawn` の引数、`console.log` の全行、送った全フレーム、`reportPtyExit` の引数、
`publishSessionCreated`、返したエントリとレジストリ（起動直後と終了後）。入力は生成する:
起動の種類（launcher 4 種の target / bot job のファイル × 引数）× tmux × 再接続 × 出力の筋書き
（なし / 1 回 / 8ms 以内の 2 回で片方が待ち / 20ms 空けた 2 回 / バッチ上限超え / DECSET 列）
× 終了（code と signal 4 組）× 終了までの経過（0 / 7ms / 1.5s / 61s）× cwd 3 種 × session id 2 種。
すべての組で一致。

検証台そのものの確認として新コードを 1 行ずつ壊した: `loggedAs` を落とす、`reportPtyExit` を flush の前に出す、
bot job の `publishSessionCreated` を消す、lifetime を 1ms ずらす、bot job の `ptys.set` を消す — いずれも赤。
`onOutput` の tap を落とす変異だけは緑のまま。これは等価な変異で、シェル起動はどちらも tap を渡さないので
区別できる入力が存在しない（tap は下の pty-relay spec が押さえる）。検証台は旧コードを半分含むので残さない。

## 残すテスト

- `test/server/session/pty/pty-relay.spec.ts` — `wireAgentPtyRelay` 自体の spec は今までなかった（3 つの spec が
  mock しているだけ）。終了行の語（エントリの agent / `loggedAs`）、終了時の flush が `reportPtyExit` より先、
  `reportPtyExit` の引数と lifetime、`onOutput` が同じ chunk を受けること。
- `test/server/session/spawn/spawn-shell.spec.ts` — 2 つのシェル起動が共有化で変えてはいけないもの:
  エントリは `shell`、開始行と終了行は `launcher` / `bot-job`、再接続した launcher はコマンド名を書かない、
  bot job は socket なしで登録後に告知され、出力はバッファだけに残る。
- `test/server/session/spawn/agents/spawn-codex.spec.ts` に 1 件追加 — 種プロンプトは codex の起動出力が静かになると
  貼り付けて送信される。この PR が触った唯一のエージェント側の呼び出し（`{ onOutput: autoRun }`）を実際に通す。
  tap を外すと赤。進めるタイマーは静止窓の分だけにする: auto-run には時間切れで打つ上限もあり、全タイマーを
  走らせると tap が外れていても緑になる（CodeRabbit の提案した形がそれだった）。
