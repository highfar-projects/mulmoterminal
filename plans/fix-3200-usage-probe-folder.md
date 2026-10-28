# fix: 利用状況プローブを MulmoTerminal 専用のフォルダで走らせる

Issue: #3200

## User Prompt

> https://github.com/receptron/mulmoterminal/issues/3200

（issue の報告: ホーム（`~`）で `npx mulmoterminal@latest` を起動すると、Claude の利用状況プローブが毎回
trust ダイアログで止まり、案内どおり承認しても `n/a` のまま。対応の方向として、案内の修正・専用フォルダでの
実行・専用フォルダの自動 trust の 3 案が挙げられている。）

## 原因

- ランチャーは起動したディレクトリを workspace（`CLAUDE_CWD`）にし、プローブもそこで `claude` を起動する。
- Claude Code はホームの trust を保存しない（バイナリ内の文言: "home trust is session-only"）。
  `~/.claude.json` の `projects["~"].hasTrustDialogAccepted` は承認しても `false` のまま。
- プローブはキーを送らない（#1293 で意図的にそうした）ので、trust ダイアログが出れば必ずタイムアウトする。
  ホームで起動している限り Claude 側のゲージは出ず、ツールチップの「そのフォルダで `claude` を実行して承認」は
  どのフォルダか言わないうえ、ホームでは効かない。

## 方針（issue の案 2 + 案 1）

プローブを **MulmoTerminal 自身のフォルダ `~/.mulmoterminal/probe`** で走らせる。

- どこから起動しても同じフォルダになり、一度承認すれば保存される。
- 場所が決まっているので、ツールチップでフォルダを名指しできる（案 1 の「案内を正しくする」も同時に満たす）。
- 空のフォルダなので、workspace の `CLAUDE.md` / hooks / project 設定が 1 問だけのセッションに読み込まれなくなる。
- プローブの transcript が workspace の `--resume` 一覧の近くに書かれなくなる（#1010 の削除は従来どおり行う）。

案 3（`~/.claude.json` に `hasTrustDialogAccepted: true` を書く）は **この PR では行わない**。
他アプリの設定ファイルを書くこと、#1293 の「誰も承認していないフォルダに trust を書かない」方針との整合は
人の判断が要るため、PR の Items to Confirm に残す。

## 変更

- `server/agents/probe/probe-cwd.ts`（新規）: `probeCwd(stateDir)` — プローブの cwd。純関数。
- `server/agents/rate-limit/rate-limit-service.ts`: 既定ログイン・アカウント・rotation token の 3 種のプローブとも
  `probeCwd(MULMOTERMINAL_HOME)` で起動。起動直前にフォルダを作る（作れなければ spawn が失敗し、従来どおり
  「応答なし」として扱われる）。transcript 削除（`removeProbeTranscript`）の向き先も同じフォルダに変える。
  routes 向けに `probeCwd` を返す。
- `server/agents/rate-limit/rate-limit-routes.ts`: `/api/rate-limits` の本文に `claudeProbeCwd` を載せる。
- `server/infra/fs/legacy-cleanup.ts`: 起動時の取り残し掃除（#3152）を、専用フォルダと（以前プローブが走っていた）
  workspace の両方に対して行う。
- `src/composables/rateLimitGauge.ts` / `useRateLimits.ts` / `src/i18n/tips/*.ts`: trust の案内にフォルダを入れる。
  サーバーがフォルダを送ってこない（版ずれ）ときは、従来の「応答なし」の一般文に落とす。
- docs: `docs/guide/{en,ja}/accounts.md` の手順 4、`docs/guide/{en,ja}/config.md` と `README.md` の `usageGauge` 行。

## 既存ユーザーへの影響

- 既定ログイン・各アカウントとも、新しいフォルダで **一度** trust の承認が要る（それまでは `n/a` と、フォルダを
  名指しした案内が出る）。これまで workspace で承認済みだった人も対象になる。

## 検証

- `yarn format` / `lint` / `typecheck` / `test`。
- スタブの `CLAUDE_BIN` を使い、別 HOME で立てたサーバーに `/api/rate-limits/refresh` を打って、
  `claude` の cwd が `<HOME>/.mulmoterminal/probe` になること、応答の `claudeProbeCwd` が同じ値であること、
  trust ダイアログの画面を出すスタブで `claudeProbeStall: "trust-prompt"` になることを確認する。
- 実機の Claude Code でホームの trust が保存されないことは、報告者の計測とバイナリ内の文言で確認済み。
