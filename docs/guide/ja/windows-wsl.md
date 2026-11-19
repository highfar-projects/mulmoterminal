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
- [`ensure-peer.mjs`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/ensure-peer.mjs) — `both` で `peers` に WSL 側を足すのに使う
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
ブラウザが話す相手はそのうち 1 つだけです。Windows 側のサーバーが WSL 側のサーバーを **peer**（相手のサーバー）として**中継**します。
Windows 側の `/peer/wsl/…` が WSL 側の `/…` にあたり、普通のリクエストも端末の接続も同じように通ります。

```
┌──────────────────────────────┐   ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Edge / Chrome app window      │   │ Windows server  :34568 (parent)  │   │ WSL2 server  :34567 (peer "wsl") │
│                               │   │                                  │   │                                  │
│ Windows cell ── /ws ──────────┼──►│ ws ─► node-pty ─► claude.exe     │   │                                  │
│                               │   │       (psmux if installed)       │   │                                  │
│ WSL cell ── /peer/wsl/ws ─────┼──►│ peer relay ── /ws ───────────────┼──►│ ws ─► node-pty ─► tmux ─► claude │
│                               │   │  (HTTP + WS upgrade, piped       │   │                                  │
│ /api/…, /ws/pubsub ───────────┼──►│   byte for byte)                 │   │                                  │
│ /peer/wsl/api/…, …/ws/pubsub ─┼──►│ ─────────────────────────────────┼──►│ /api/…, /ws/pubsub               │
└──────────────────────────────┘   └──────────────────────────────────┘   └──────────────────────────────────┘
        ▲                                   ▲            own: ~/.mulmoterminal, ~/.claude, accounts,
        │ one window                        │                  token rotation, sessions, tmux
        └──── tray launcher (PowerShell) ───┴── starts / restarts / stops both ──► (WSL side via wsl.exe)
```

### ページは Windows 側のサーバーにとどまる

ブラウザが開くのは、いつも Windows 側のサーバーのアドレスだけです。中継は、まず Windows 側のサーバー自身の決まりでリクエストを確かめ、
それから WSL 側に渡します。どちらのサーバーも、相手からのリクエストを受けるために確認をゆるめる必要はありません。
端末のやり取りは中身を変えずに通すので、どの種類のセル（Claude・Codex・起動コマンドなど）も、WSL 側で Windows 側と同じように動きます。

### WSL が peer になるのは、設定に書いてあるから

Windows 側の `~/.mulmoterminal/config.json` に、次のように書かれています。ランチャーは、`both` で初めて起動したときにこれを足します
（足す前にファイルのバックアップを取ります）。

```json
"peers": [{ "id": "wsl", "label": "WSL", "url": "http://127.0.0.1:34567" }]
```

ブラウザは peer を id でしか指定せず、URL を送ることはありません。なので、どんなウェブページも中継先を勝手に変えられません。

### セルはどれか 1 つのサーバーに属する

- 新しいセルをどこで動かすかは、起動フォームの**実行先**で選びます。WSL 側のセルは、見出しに **WSL** のバッジが付きます。
- そのセルに関することは、すべてそのセルが動くサーバーに問い合わせます。端末、会話の記録、再開できる会話の一覧、worktree、メモ、
  セルからの質問がそうです。WSL の `/home/you/proj` と Windows の `C:\Users\you\proj` は別のフォルダで、同じパスでもマシンが違えば別物です。
- **コマンドセル**（Run メニューのスクリプト、起動構成、設定したランチャー）は Windows 側のサーバーでだけ動きます。

### 2 つのサーバーは何も共有しない

サーバーごとに、`~/.mulmoterminal/config.json`、`~/.claude`（Claude Code へのログインはそれぞれで行う）、
[アカウント](accounts.html)と[トークンのローテーション](token-rotation.html)、セッションと tmux があります。画面もそれに合わせて表示します。

- **実行先**が WSL のとき、起動フォームには **WSL 側の**保存フォルダとアカウントが出ます。
- WSL 側のセルのアカウント表示からは、**WSL 側の**ローテーション用トークンに切り替えられ、WSL 側で計った使用量が出ます。
- ヘッダーの使用量ゲージには、WSL 側の数値が **WSL** の表示の後に出ます。たとえば `WSL  /login 7d 26%  developer 5h 9% 7d 20%` です。
  数値にマウスを乗せると、誰の数値かが出ます。

### 通知は両方から 1 つの窓に届く

ページは両方のサーバーの動きを受け取っています。なので、タブのアイコン、注意を促す音、質問ペインは WSL 側のセルでも働きます。
WSL 側が応答しなくなると、そのセルは「遅いだけ」に見えるのではなく、サーバーが止まっていると表示します。

### 起動・再起動・停止はランチャーが両方まとめて行う

- 両方のサーバーを起動します。Windows 側は `npx`、WSL 側は `wsl.exe` を通して WSL の中で `npx` を動かします。
- 窓を閉じて 15 秒たつと、両方を止めます。
- ブラウザの **MulmoTerminal を再起動**が届くのは Windows 側のサーバーだけです。Windows 側が再起動のために終わると、
  ランチャーが WSL 側も再起動します。こうして両方が `npx` を動かし直し、一緒に更新されます。
- WSL 側が起動に失敗しても、Windows 側はそのまま動きます。

## うまくいかないとき

| 見えていること | すること |
| --- | --- |
| 起動フォームに**実行先**が出ない | Windows 側の `config.json` に `peers` がありません。`-Runtime both` で一度起動するか、上の設定を手で足してください |
| WSL 側のセルに、サーバーが止まっていると出る | トレイのアイコンを右クリック →**ログを開く**。WSL 側が起動しなかった理由（WSL の中に Node や Claude Code が無い、など）がランチャーのログにあります |
| 使用量ゲージに **WSL** の表示が出ない | WSL 側にまだ表示できる数値がありません。使用量はサーバーごとに計るので、WSL 側でログインして Claude Code を動かすと出ます |
| WSL 側のセルが、思ったのと違う契約で動いている | WSL 側は自分の `~/.claude` のログインと、自分の `tokenRotation` を使います。Windows 側ではなく、WSL 側の `~/.mulmoterminal/config.json` を確かめてください |
