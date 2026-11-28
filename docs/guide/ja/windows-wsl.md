---
title: Windows と WSL2 を 1 つの窓で — スタートメニューのランチャー
layout: default
parent: 日本語
nav_order: 22.5
description: Windows 用ランチャーを入れる（GitHub から直接、またはダウンロードしてから）。MulmoTerminal を Windows・WSL2・その両方で動かし、両方のセルを 1 つの窓で開く。2 つのサーバーのつながり方も説明します。
---

# Windows と WSL2 を 1 つの窓で
{: .no_toc }

- TOC
{:toc}

このページは**このフォーク**（`highfar-projects/mulmoterminal`）についての説明です。
Windows 用に**スタートメニューのランチャー**があり、中身は
[`tools/windows-launcher/`](https://github.com/highfar-projects/mulmoterminal/tree/main/tools/windows-launcher)
にある PowerShell のスクリプトです。MulmoTerminal をコンソール窓なしで起動し、Edge か Chrome のアプリ窓で開きます。
サーバーは Windows・WSL2 の中・**その両方**のどれでも動かせます。両方のときは、両方のセルを 1 つの窓から開けます。

## ランチャーがすること

- サーバーを**コンソール窓なし**で起動し、**アプリ窓**で開きます（既定は Edge、設定で Chrome も使えます）。
- **タスクトレイのアイコン**で状態が分かります。橙は起動中、緑・青は動作中、赤は失敗です。
  うまくいかないときは、アイコンを右クリック →**ログを開く**。
- **窓を閉じるとサーバーも止まります。** 15 秒待ってから止め、PC が休止していた間は数えません。
- **再起動すると更新されます。** ブラウザの**設定 → MulmoTerminal を再起動**で `npx` をもう一度動かし、
  最新のコミットを取ってきます。再起動のためのループを自分で書く必要はありません。

サーバーを動かす場所は `-Runtime` で選びます。選んだものごとに、スタートメニューの項目が 1 つできます。

| `-Runtime` | スタートメニューの名前 | 動かすもの |
| --- | --- | --- |
| `windows` | MulmoTerminal | Windows 側だけ（ポート 34568） |
| `wsl` | MulmoTerminal (WSL) | WSL2 側だけ（ポート 34567） |
| `both` | MulmoTerminal (Windows + WSL) | 両方。WSL 側のセルも Windows 側の窓 1 つで開ける |

`wsl` と `both` を使う前に、WSL の準備をしてください。ディストリビューションの**中に** `git`・`tmux`・Node・Claude Code
を入れ、中でログインしておきます。WSL は自分の `~/.claude` を持つので、Windows でのログインは引き継がれません。
手順は README の [WSL2](https://github.com/highfar-projects/mulmoterminal#wsl2) の節にあります。

## 入れる

入れ方は 2 通りです。どちらでも、ファイルは `%LOCALAPPDATA%\MulmoTerminalLauncher` に入り、スタートメニューに登録されます
（右クリックでタスクバーにピン留めもできます）。自分の設定ファイル `launcher.config.json` は上書きされません。

### GitHub から直接実行する

PowerShell に次の 1 行を貼って実行します。`-Runtime` は上の表から選んでください。

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/install.ps1))) -Runtime both
```

- 一時フォルダにファイルを取ってきて登録し、一時フォルダは消します。
- **更新も同じ 1 行**です。
- `main` 以外のブランチやタグから入れるときは `-Ref <ブランチ名>` を足します。

### ダウンロードしてから実行する

次の 3 つのファイルを、同じフォルダに保存します。

- [`mulmoterminal-launcher.ps1`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/mulmoterminal-launcher.ps1) — ランチャー本体
- [`ensure-peer.mjs`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/ensure-peer.mjs) — `both` で `remoteHosts` に WSL 側を足すのに使う
- [`launcher.config.example.json`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/launcher.config.example.json) — 設定ファイルの見本

リポジトリを clone してあるか、GitHub の **Code → Download ZIP** で取って展開したなら、`tools\windows-launcher` フォルダに 3 つともそろっています。

そのフォルダで PowerShell を開き、次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\mulmoterminal-launcher.ps1 -Install -Runtime both
```

- **更新するときは、もう一度ダウンロードして同じコマンド**を実行します。
- `mulmoterminal-launcher.ps1` は**保存したそのまま**にしてください。エディタで保存し直して BOM（BOM 付き UTF-8）が外れると、
  Windows PowerShell 5.1 が正しく読めなくなります。
- ブラウザで保存したファイルには「インターネットから来たファイル」の印が付きます。ここでは問題になりません。
  このコマンドも、スタートメニューの項目も、`-ExecutionPolicy Bypass` で実行するからです。
- スタートメニューの項目は `%LOCALAPPDATA%` のコピーを動かすので、登録が済めばダウンロードしたフォルダは消してかまいません。

### 自分の設定

変えたい値だけを `%LOCALAPPDATA%\MulmoTerminalLauncher\launcher.config.json` に書きます。

```json
{
  "DefaultRuntime": "both",
  "WorkDir": "%USERPROFILE%\\workspace",
  "WslWorkDir": "~/workspace",
  "NodeVersion": "24.21.0"
}
```

すべてのキー（ポート、ブラウザ、WSL のディストリビューション、Node のバージョンなど）は
[ランチャーの README](https://github.com/highfar-projects/mulmoterminal/blob/main/tools/windows-launcher/README.md) にあります。
効いている設定の確かめ方（`-ShowConfig`）と、消し方（`-Uninstall`）もそこに書いてあります。

## Windows + WSL2 のしくみ

`-Runtime both` で起動すると、1 台の Windows で **MulmoTerminal のサーバーが 2 つ**、OS ごとに 1 つずつ動きます。
ブラウザが話す相手はそのうち 1 つだけです。Windows 側のサーバーは、WSL 側のサーバーを**リモートホスト**として扱います。
これは本家が [#3506](https://github.com/receptron/mulmoterminal/issues/3506) で入れた機能で、Windows 側の `/remote/wsl/…` への要求が WSL 側に転送されます。

2026-11-28 までは、このフォークが独自の中継（`peers`、`/peer/wsl/…`）を持っていました。
同じことをして、しかもセルのより多くの機能に対応する本家のリモートホストに置き換えたため、独自の中継は外しました。

```
┌──────────────────────────────┐   ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Edge / Chrome app window      │   │ Windows server  :34568 (parent)  │   │ WSL2 server  :34567 (host "wsl") │
│                               │   │                                  │   │                                  │
│ Windows cell ── /ws ──────────┼──►│ ws ─► node-pty ─► claude.exe     │   │                                  │
│                               │   │       (psmux if installed)       │   │                                  │
│ WSL cell ── /remote/wsl/ws ───┼──►│ gateway ── /ws ──────────────────┼──►│ ws ─► node-pty ─► tmux ─► claude │
│                               │   │  (terminals piped byte for byte, │   │                                  │
│ /api/…, /ws/pubsub ───────────┼──►│   /api routes from a fixed table)│   │                                  │
│ /remote/wsl/api/… ────────────┼──►│ ─────────────────────────────────┼──►│ /api/…                           │
└──────────────────────────────┘   └──────────────────────────────────┘   └──────────────────────────────────┘
        ▲                                   ▲            own: ~/.mulmoterminal, ~/.claude, accounts,
        │ one window                        │                  token rotation, sessions, tmux
        └──── tray launcher (PowerShell) ───┴── starts / restarts / stops both ──► (WSL side via wsl.exe)
```

### ページは Windows 側のサーバーにとどまる

ブラウザが開くのは、いつも Windows 側のサーバーのアドレスだけです。WSL 側のセルの要求は Windows 側のサーバーが代わりに転送するので、どちらのサーバーも、相手からの要求を受けるために確認をゆるめる必要がありません。
端末の通信はそのまま通します。それ以外の要求は、転送してよいルートの表（`common/remoteRoutes.ts`）にあるものだけが、そのセルのフォルダの中に限って通ります。表に無いものは断ります。

### WSL がリモートホストになるのは、設定に書いてあるから

Windows 側の `~/.mulmoterminal/config.json` に書いてあります。`both` で初めて起動したときに、ランチャーがこの項目を足します（足す前にファイルのバックアップを取ります）。

```json
"remoteHosts": [{ "id": "wsl", "label": "WSL", "url": "http://127.0.0.1:34567" }]
```

- URL はループバックのアドレスでなければいけません。WSL2 はポートを Windows の `127.0.0.1` に転送するので、ここでは SSH のトンネルはいりません。
- ブラウザはホストを id でしか指しません。URL は渡さないので、Web ページが転送先を別の場所に向けることはできません。
- 2 つのサーバーのメジャーバージョンが違うと、WSL 側のセルはつながらず、そのことを表示します。ランチャーは両側で同じパッケージを動かすので、普通はそろっています。
- 以前のランチャーは、代わりに `peers` という項目を書いていました。もう読まれないので、消してかまいません。

### セルはどれか 1 つのサーバーに属する

- 新しいセルをどちらで動かすかは、起動パネルのホストの選択で決めます。この選択は `remoteHosts` を設定したときだけ出ます。
- そのセルについてのことは、すべてそのセルが動いているサーバーに問い合わせます。端末、状態、ファイルペイン、git、会話の記録、こちらへの質問などです。WSL の `/home/you/proj` と `C:\Users\you\proj` は別のフォルダで、同じパスでも 2 つのマシンでは別物です。
- WSL 側のセルでできること・できないことは、本家のリモートホストのとおりです。まだ転送しないもの（全画面の `/files` や、コレクションなど）は本家の計画に書いてあります。このフォーク独自の機能のうち、このマシンに対して動くもの（起動構成のメニュー、devcontainer のバッジ、外部からの依頼）は、WSL 側のセルには出ません。

### 2 つのサーバーは何も共有しない

サーバーごとに、自分の `~/.mulmoterminal/config.json`、自分の `~/.claude`（Claude Code へのログインは両側で必要です）、自分の[アカウント](accounts.html)と[トークンの切り替え](token-rotation.html)、自分のセッションと tmux サーバーを持ちます。

### 起動・再起動・停止はランチャーが両方まとめて行う

- 両方のサーバーを起動します。Windows 側は `npx`、WSL 側は `wsl.exe` を通して WSL の中の `npx` です。
- 窓を閉じて 15 秒たつと、両方を止めます。
- ブラウザの **MulmoTerminal を再起動**が届くのは Windows 側のサーバーだけです。そのサーバーが再起動のために終了すると、ランチャーが WSL 側も再起動するので、両方が `npx` を実行し直し、そろって更新されます。
- WSL 側のサーバーが起動しなくても、Windows 側はそのまま使えます。

## うまくいかないとき

| 見えていること | すること |
| --- | --- |
| 起動パネルにホストの選択が出ない | Windows 側の `config.json` に `remoteHosts` がありません。2026-11-28 以降のランチャーを入れて `-Runtime both` で一度起動するか、上の設定を手で足してください |
| WSL 側のセルに、ホストにつながらないと出る | トレイのアイコンを右クリック →**ログを開く**。WSL 側が起動しなかった理由（WSL の中に Node や Claude Code が無い、など）がランチャーのログにあります |
| WSL 側のセルに、バージョンが合わないと出る | 2 つのサーバーのメジャーバージョンが違います。トレイから再起動して、両方に `npx` を実行し直させてください |
| WSL 側のセルが、思ったのと違う契約で動いている | WSL 側は自分の `~/.claude` のログインと、自分の `tokenRotation` を使います。Windows 側ではなく、WSL 側の `~/.mulmoterminal/config.json` を確かめてください |
