# MulmoTerminal launcher for Windows

MulmoTerminal をコンソール窓なしで起動し、Edge か Chrome のアプリ窓で開くランチャーです。
スタートメニューから起動でき、タスクトレイのアイコンで状態（橙=起動中 / 緑・青=動作中 / 赤=失敗）が分かります。
窓を閉じるとサーバーも止まります。

サーバーを動かす場所は次の 3 通りです。

| `-Runtime` | スタートメニューの名前 | 動かすサーバー |
| --- | --- | --- |
| `windows` | MulmoTerminal | Windows 側だけ |
| `wsl` | MulmoTerminal (WSL) | WSL2 の Linux 側だけ |
| `both` | MulmoTerminal (Windows + WSL) | 両方。Windows 側の窓 1 つで、WSL 側のセルも開ける（peers 機能） |

## 入れる・更新する

PowerShell で次の 1 行を実行します（`-Runtime` は上の表から選ぶ）。

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/install.ps1))) -Runtime both
```

- ファイルは `%LOCALAPPDATA%\MulmoTerminalLauncher` に入り、スタートメニューに登録されます。
  右クリックの「タスクバーにピン留め」も使えます。
- **更新も同じ 1 行**です。個別の設定 `launcher.config.json` は上書きしません。
  動いているランチャーは、次に起動したときから新しい版になります。
- 特定のブランチやタグから入れるときは `-Ref <ブランチ名>` を足します。

このリポジトリを clone してあるなら、手元のファイルからも登録できます。

```powershell
powershell -ExecutionPolicy Bypass -File tools\windows-launcher\mulmoterminal-launcher.ps1 -Install -Runtime both
```

どちらの方法でも、ショートカットが指すのは `%LOCALAPPDATA%` のコピーです。リポジトリでブランチを切り替えても、
普段使いのランチャーは `-Install` し直すまで変わりません。

## 自分の環境に合わせる

既定値は誰が使っても動く値です。変えたいものだけを `%LOCALAPPDATA%\MulmoTerminalLauncher\launcher.config.json` に書きます
（見本: 同じフォルダの `launcher.config.example.json`）。

```json
{
  "DefaultRuntime": "both",
  "WorkDir": "%USERPROFILE%\\workspace",
  "NodeVersion": "24.21.0"
}
```

| キー | 既定値 | 意味 |
| --- | --- | --- |
| `Package` | `github:highfar-projects/mulmoterminal` | npx で起動するもの。本家は `mulmoterminal` |
| `DefaultRuntime` | `windows` | `-Runtime` を付けずに起動・登録したときの動かし方 |
| `Browser` | `edge` | `edge` または `chrome` |
| `BrowserPath` | 空（自動で探す） | 見つからないときだけ exe のフルパス |
| `UseDedicatedProfile` | `false` | `true` で普段のブラウザのプロファイルと分けて開く |
| `StopWithWindow` | `true` | 窓を閉じたらサーバーも止める |
| `Port` | `34568` | Windows 側のポート |
| `WorkDir` | 空（ユーザーフォルダ） | Windows 側の作業フォルダ（`--cwd`） |
| `NodeVersion` | 空（PATH の npx） | Volta で使う Node のバージョン |
| `WslPort` | `34567` | WSL 側のポート。`both` では `Port` と別にする |
| `WslDistro` | 空（既定のディストリビューション） | `wsl -l -v` で確認できる名前 |
| `WslWorkDir` | `~` | WSL 側の作業フォルダ。無ければ作る |
| `WslNodeVersion` | 空（ログインシェルの npx） | WSL 側の Volta で使う Node のバージョン |
| `EnsurePeer` | `true` | `both` のとき、`~/.mulmoterminal/config.json` の `peers` に WSL 側が無ければ足す |
| `PeerId` / `PeerLabel` | `wsl` / `WSL` | その peer の id と、画面に出る名前 |

- 文字列の値では `%USERPROFILE%` のような環境変数が展開されます。
- JSON にはコメントを書けません（Windows PowerShell 5.1 が読めないため）。
- 知らないキーや型の違う値があると、起動せずにどこが違うかを知らせます。黙って無視はしません。
- 設定が効いているかは次で確かめられます（既定値に `launcher.config.json` を重ねた結果を表示します）。

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MulmoTerminalLauncher\mulmoterminal-launcher.ps1" -ShowConfig
```

## 消す

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\MulmoTerminalLauncher\mulmoterminal-launcher.ps1" -Uninstall
```

スタートメニューの 3 つのショートカットを消します。`%LOCALAPPDATA%\MulmoTerminalLauncher` のフォルダ（設定とログ）は残るので、
要らなければ手で消してください。

## 困ったとき

- トレイのアイコンを右クリック →「ログを開く」で、`launcher.log`（起動・休止からの復帰・止めた理由）と
  サーバーのログが開きます。
- フォーク版を GitHub から入れるには npm 11 以上が要ります（Volta 既定の npm 10.2.1 では入りません）。

## 編集するとき

`mulmoterminal-launcher.ps1` は **UTF-8（BOM 付き）** のまま保存してください。Windows PowerShell 5.1 は BOM の無い UTF-8 を
Shift_JIS として読み、日本語の直後の行を黙って実行しなくなります（`.editorconfig` で指定済み、`-Install` もコピー先に BOM を付け直します）。
編集したら構文を確かめます。

```powershell
$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile("$PWD\tools\windows-launcher\mulmoterminal-launcher.ps1", [ref]$null, [ref]$e); $e
```
