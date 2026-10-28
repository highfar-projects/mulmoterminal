# fix: 利用状況プローブの専用フォルダの trust を MulmoTerminal が書く

Issue: #3206（#3203 の残課題。方針は issue の案 A をユーザーが選択）

## User Prompt

> A で進めて

## 背景

#3203 でプローブは `~/.mulmoterminal/probe` で走るようになったが、このフォルダで `claude` を起動する人は
普段いないので、ゲージが出るまでに全ユーザー（既定ログイン・各アカウント）が一度手で trust を承認する
手順が恒久的に残っていた。

## 方針（案 A）

プローブを起動する直前（フォルダを作った直後）に、そのログインの Claude Code 設定ファイル
（既定: `~/.claude.json`、サーバーに `CLAUDE_CONFIG_DIR` があればその下、アカウント: そのアカウントの
`CLAUDE_CONFIG_DIR/.claude.json`、rotation token: 既定ログインと同じ）へ
`projects["<probe folder の実パス>"].hasTrustDialogAccepted: true` を書く。

- 書くのは **MulmoTerminal が作った空のフォルダの分だけ**。#1293 が消したのは「盲打ちの Enter が、ユーザーの
  ディレクトリに trust を書いてしまう」副作用であり、本件はそれとは別物。線引きはモジュールの頭に書く。
- 書き込みは小さく: ログインごとにサーバーの生存中 1 回（成功したら記憶する）、キーが既に `true` なら書かない、
  parse → 書き直しを一手で、一時ファイル → rename で原子的に。
- 書けないとき（ファイルが無い = そのログインで `claude` を一度も動かしていない、読めない、JSON でない、書けない）
  は何もしない。従来どおりツールチップの手順が最後の受け皿。
- Claude Code 自身が対話なし利用の手段としてこのキーを書くよう案内している（2.1.292 のバイナリ内文言）。

## 変更

- `server/agents/probe/probe-trust.ts`（新規）: 純関数 `withProbeFolderTrusted(configText, dir)` と
  fs 包み `ensureProbeFolderTrusted(configFile, dir)`。
- `server/session/project-dir.ts`: `claudeUserConfigFile(configDir?)` — ログインの設定ディレクトリを渡せるようにする。
- `server/agents/rate-limit/rate-limit-service.ts`: `spawnProbe` でフォルダ作成の直後に trust を書く。
- docs: `docs/guide/{en,ja}/accounts.md` の手順 4、`docs/guide/{en,ja}/config.md` と `README.md` の `usageGauge` 行。

## 検証

- `yarn format` / `lint` / `typecheck` / `test`。
- 純関数の spec（既に trust 済み / `projects` 無し / 他のフィールド保持 / JSON でない / 末尾改行の有無）と
  fs 包みの spec（ファイル無しなら作らない / rename で置き換え / 失敗時に一時ファイルを残さない）。
- サービス spec: 既定ログインとアカウントで、それぞれの設定ファイルに書くこと、設定ファイルが無くても spawn すること。
- 別 HOME にスタブ `claude` と `{"projects":{}}` の `.claude.json` を置いた使い捨てサーバーで、プローブ起動後に
  `projects["<HOME>/.mulmoterminal/probe"].hasTrustDialogAccepted` が `true` になり、他の中身が保たれることを確認。
