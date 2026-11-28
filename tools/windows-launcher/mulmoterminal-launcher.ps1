# MulmoTerminal launcher for Windows.
#
# MulmoTerminal をコンソール窓なしで起動し、Edge か Chrome のアプリ窓で開く。
# サーバーは Windows でも WSL2 の Linux 側でも動かせる。
# 「両方」(-Runtime both) では Windows 側を親、WSL 側を子として両方を起動し、
# 親の窓 1 つで WSL 側のセルも開ける（本家の remoteHosts 機能。親が /remote/wsl/... を中継する）。
#
#   入れ方・更新のしかたは同じフォルダの README.md を参照。GitHub から 1 行で入れられる（install.ps1）。
#   手元のファイルから登録するとき:
#     powershell -ExecutionPolicy Bypass -File <このファイル> -Install -Runtime both     -> 「MulmoTerminal (Windows + WSL)」
#     powershell -ExecutionPolicy Bypass -File <このファイル> -Install -Runtime windows  -> 「MulmoTerminal」
#     powershell -ExecutionPolicy Bypass -File <このファイル> -Install -Runtime wsl      -> 「MulmoTerminal (WSL)」
#     -Install はこのファイルと ensure-peer.mjs を %LOCALAPPDATA%\MulmoTerminalLauncher にコピーし、
#     スタートメニューのショートカットはそのコピーを指す（リポジトリでブランチを替えても、普段使いは変わらない）
#   登録の削除（全部）:
#     powershell -ExecutionPolicy Bypass -File <このファイル> -Uninstall
#   今の設定（既定値に launcher.config.json を重ねた結果）を表示する:
#     powershell -ExecutionPolicy Bypass -File <このファイル> -ShowConfig
#
# 自分の環境だけの値（ポート、作業フォルダ、Node のバージョンなど）は、このファイルを書き換えずに
# %LOCALAPPDATA%\MulmoTerminalLauncher\launcher.config.json に書く（見本: launcher.config.example.json）。
# キーは下の「設定」の変数名と同じ。書いたキーだけが既定値を上書きする。-Install はこのファイルを上書きしない。
#
# - 起動中は画面右下に小窓、起動後はタスクトレイにアイコン（橙=起動中 / 緑・青=動作中 / 赤=失敗）
# - トレイのメニュー: 開く / ログを開く / 停止して終了
# - ブラウザがサーバーに接続していない状態が続いたら（= 窓を閉じたら）サーバーも止める（$StopWithWindow）
#   「両方」では窓が接続するのは親だけなので、親への接続で判定し、止めるときは両方止める
#   休止・スリープから戻った直後は接続が切れているので、$resumeGrace 秒はこの判定をしない
# - 起動・状態の変化・休止からの復帰・止めた理由を launcher.log に残す（トレイの「ログを開く」でも開く）
# - ブラウザからの「Restart MulmoTerminal」（終了コード 76）では npx をもう一度動かす（最新版を取りにいく）
#   「両方」では、親が再起動したら、このランチャーが起動した WSL 側にも再起動を頼み、両方を更新する
# - 停止はまず POST /api/shutdown（ブラウザの Stop ボタンと同じ正規の終了）。止まらないときだけ強制終了
# - 別の方法で起動済みのサーバーは、使うだけで止めない（「両方」でも、片方だけ起動済みならそれを使う）
# - 「両方」のとき、WSL 側が起動できなくても Windows 側はそのまま使える（通知で知らせる）
# - 「両方」のとき、~/.mulmoterminal/config.json の remoteHosts に WSL の項目が無ければ足す（$EnsurePeer）。
#   足すのは remoteHosts だけ。書き換える前に config.json.bak-hosts（あれば -2, -3 ...）にコピーを取る
#
# このファイルは UTF-8 (BOM 付き) で保存すること。Windows PowerShell 5.1 は BOM なしの UTF-8 を
# Shift_JIS として読み、日本語の直後の改行や引用符を飲み込んで、行を黙って実行しなくなる。
# -Install はコピー先のファイルに BOM が無ければ付け直す。
param([switch]$Install, [switch]$Uninstall, [switch]$ShowConfig, [ValidateSet('windows', 'wsl', 'both')][string]$Runtime)

# ========================= 設定（既定値） =========================
# ここは誰が使っても動く既定値。自分の値は launcher.config.json に書く（上の説明を参照）。
# launcher.config.json の文字列の値では %USERPROFILE% のような環境変数が展開される。
$Browser             = 'edge'        # 'edge' または 'chrome'
$BrowserPath         = ''            # 空なら自動で探す。見つからないときだけ exe のフルパスを書く
$UseDedicatedProfile = $false        # true にすると普段のプロファイルと分けて開く（ログイン状態は共有されない）
$BrowserProfile      = ''            # 開くプロファイル。表示名（例: "仕事"）かフォルダ名（例: "Profile 1"）。空ならブラウザ任せ
$Package             = 'github:highfar-projects/mulmoterminal'   # npx で起動するもの。本家は 'mulmoterminal'
$StopWithWindow      = $true         # MulmoTerminal の窓を閉じたらサーバーも止める
$DefaultRuntime      = 'windows'     # -Runtime を付けずに起動・登録したとき: 'both' / 'windows' / 'wsl'

# --- Windows で動かすとき（-Runtime windows / both の親） ---
$Port                = 34568
$WorkDir             = ''            # --cwd。空ならユーザーフォルダ（例: "%USERPROFILE%\\workspace"）
$NodeVersion         = ''            # Volta で使う Node のバージョン（例: "24.21.0"）。空なら PATH 上の npx をそのまま使う

# --- WSL2 の Linux 側で動かすとき（-Runtime wsl / both の子） ---
$WslPort             = 34567         # Windows 版と同時に使うので、別のポートにする
$WslDistro           = ''            # 空なら既定のディストリビューション（wsl -l -v で確認）
$WslWorkDir          = '~'           # --cwd（Linux 側のパス）。無ければ作る
$WslNodeVersion      = ''            # Linux 側の Volta で使う Node のバージョン（その Node 付属の npm で起動する）
# $WslNodeVersion が空なら、ログインシェル（~/.profile と ~/.bashrc）で通る PATH の npx を使う（nvm など）。
# フォーク版を GitHub から入れるには npm 11 以上が要る（Volta 既定の npm 10.2.1 では入らない）。

# --- 両方のとき（-Runtime both） ---
$EnsurePeer          = $true         # config.json の remoteHosts に WSL の項目が無ければ足す
$PeerId              = 'wsl'         # 窓の中で /remote/<id>/... になる名前
$PeerLabel           = 'WSL'         # セルの見出しのバッジと、起動フォームの「実行先」に出る名前
# ==================================================================

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$appDir  = Join-Path $env:LOCALAPPDATA 'MulmoTerminalLauncher'
$lnkDir  = [Environment]::GetFolderPath('Programs')
New-Item -ItemType Directory -Force $appDir | Out-Null

# --- 個別の設定（launcher.config.json）を既定値に重ねる -----------------------------------------
$configFile = Join-Path $appDir 'launcher.config.json'
$settingNames = @('Browser', 'BrowserPath', 'UseDedicatedProfile', 'BrowserProfile', 'Package', 'StopWithWindow', 'DefaultRuntime',
                  'Port', 'WorkDir', 'NodeVersion', 'WslPort', 'WslDistro', 'WslWorkDir', 'WslNodeVersion',
                  'EnsurePeer', 'PeerId', 'PeerLabel')
# ショートカットから起動したときはコンソールが見えないので、窓で知らせる
function Show-ConfigError([string]$message) {
    if ($Install -or $Uninstall -or $ShowConfig) { Write-Host $message -ForegroundColor Red }
    else { [System.Windows.Forms.MessageBox]::Show($message, 'MulmoTerminal launcher', 'OK', 'Error') | Out-Null }
    exit 1
}
if (Test-Path $configFile) {
    # 書き間違いを黙って無視すると、効いていない設定に気づけない。読めない・知らないキー・型違いは止める
    try { $userConfig = [IO.File]::ReadAllText($configFile) | ConvertFrom-Json }
    catch { Show-ConfigError "$configFile を JSON として読めません（PowerShell 5.1 は JSON のコメントも読めません）: $($_.Exception.Message)" }
    if ($userConfig -isnot [pscustomobject]) { Show-ConfigError "$configFile は { ... } の形にしてください。" }
    $problems = @()
    foreach ($p in $userConfig.PSObject.Properties) {
        $name = $settingNames | Where-Object { $_ -eq $p.Name } | Select-Object -First 1
        if (-not $name) { $problems += "知らないキー '$($p.Name)'"; continue }
        $current = Get-Variable -Name $name -ValueOnly
        $value = $p.Value
        if ($current -is [bool]) {
            if ($value -isnot [bool]) { $problems += "'$name' は true か false"; continue }
        } elseif ($current -is [int]) {
            if (($value -isnot [int] -and $value -isnot [long]) -or $value -lt 1 -or $value -gt 65535) { $problems += "'$name' は 1 から 65535 の数"; continue }
            $value = [int]$value
        } else {
            if ($value -isnot [string]) { $problems += "'$name' は文字列"; continue }
            $value = [Environment]::ExpandEnvironmentVariables($value)
        }
        Set-Variable -Name $name -Value $value
    }
    if ($problems.Count) { Show-ConfigError ("$configFile の設定を直してください:`n- " + ($problems -join "`n- ")) }
}

# 検査が先: $Runtime は ValidateSet 付きなので、違う値を代入すると英語のエラーで止まってしまう
if ($DefaultRuntime -notin @('windows', 'wsl', 'both')) { Show-ConfigError "launcher.config.json の DefaultRuntime は 'both' / 'windows' / 'wsl' のどれかにしてください（今: '$DefaultRuntime'）。" }
if (-not $Runtime) { $Runtime = $DefaultRuntime }
$appName = switch ($Runtime) { 'wsl' { 'MulmoTerminal (WSL)' } 'both' { 'MulmoTerminal (Windows + WSL)' } default { 'MulmoTerminal' } }

# ブラウザのプロファイルの一覧（フォルダ名と表示名）は、ユーザーデータのフォルダの Local State にある。
# BrowserPath で Beta / Dev 版などを指したときは場所が違うので読めない（そのときは BrowserProfile をフォルダ名として渡す）
$userDataDir = if ($UseDedicatedProfile) { Join-Path $appDir "profile-$Browser" }
               elseif ($Browser -eq 'chrome') { Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data' }
               else { Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data' }
function Get-BrowserProfiles {
    $state = Join-Path $userDataDir 'Local State'
    if (-not (Test-Path $state)) { return @() }
    try { $cache = ([IO.File]::ReadAllText($state) | ConvertFrom-Json).profile.info_cache } catch { return @() }
    if (-not $cache) { return @() }
    @($cache.PSObject.Properties | ForEach-Object { [pscustomobject]@{ Dir = $_.Name; Name = [string]$_.Value.name } })
}

if ($ShowConfig) {
    Write-Host "個別の設定: $configFile $(if (Test-Path $configFile) { '（読み込んだ）' } else { '（無い。すべて既定値）' })"
    Write-Host "Runtime = $Runtime"
    foreach ($n in $settingNames) { Write-Host ("{0,-20} = {1}" -f $n, (Get-Variable -Name $n -ValueOnly)) }
    $profiles = Get-BrowserProfiles
    if ($profiles.Count) {
        Write-Host "`n$Browser のプロファイル（BrowserProfile には表示名かフォルダ名を書く）:"
        foreach ($p in $profiles) { Write-Host ("  {0,-12} {1}" -f $p.Dir, $p.Name) }
    } else {
        Write-Host "`n$Browser のプロファイルの一覧を読めません（$userDataDir\Local State）"
    }
    exit
}

# 色付きの丸に ">" を描く（トレイのアイコンとショートカットのアイコンで共用）。
# $color2 を渡すと左半分が $color、右半分が $color2 になる（「両方」用）
function New-StatusBitmap([System.Drawing.Color]$color, [int]$size, $color2 = $null) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    if ($color2) {
        $g.FillPie((New-Object System.Drawing.SolidBrush $color), 0, 0, $size - 1, $size - 1, 90, 180)
        $g.FillPie((New-Object System.Drawing.SolidBrush $color2), 0, 0, $size - 1, $size - 1, 270, 180)
    } else {
        $g.FillEllipse((New-Object System.Drawing.SolidBrush $color), 0, 0, $size - 1, $size - 1)
    }
    $k = $size / 16.0
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (2 * $k)
    $pts = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF (5 * $k), (4 * $k)),
        (New-Object System.Drawing.PointF (9 * $k), (8 * $k)),
        (New-Object System.Drawing.PointF (5 * $k), (12 * $k)))
    $g.DrawLines($pen, $pts)
    $g.Dispose()
    $bmp
}
$green = [System.Drawing.Color]::FromArgb(40, 160, 70)
$blue  = [System.Drawing.Color]::FromArgb(30, 110, 200)
function New-RuntimeBitmap([int]$size) {
    switch ($Runtime) {
        'wsl'   { New-StatusBitmap $blue $size }
        'both'  { New-StatusBitmap $green $size $blue }
        default { New-StatusBitmap $green $size }
    }
}

# ============================ 登録 / 削除 ============================
if ($Uninstall) {
    foreach ($n in 'MulmoTerminal', 'MulmoTerminal (WSL)', 'MulmoTerminal (Windows + WSL)') { Remove-Item (Join-Path $lnkDir "$n.lnk") -ErrorAction SilentlyContinue }
    Remove-Item (Join-Path $appDir '*.ico') -ErrorAction SilentlyContinue
    Write-Host "スタートメニューの MulmoTerminal / MulmoTerminal (WSL) / MulmoTerminal (Windows + WSL) を削除しました。"
    exit
}
if ($Install) {
    # 実行するのは %LOCALAPPDATA% のコピー。リポジトリやダウンロード先から登録したときは、そこへコピーする。
    # launcher.config.json は個別の設定なので上書きしない
    $self = Join-Path $appDir 'mulmoterminal-launcher.ps1'
    if ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ine [IO.Path]::GetFullPath($appDir).TrimEnd('\')) {
        Copy-Item $PSCommandPath $self -Force
        foreach ($f in 'ensure-peer.mjs', 'launcher.config.example.json') {
            $from = Join-Path $PSScriptRoot $f
            if (Test-Path $from) { Copy-Item $from (Join-Path $appDir $f) -Force }
            else { Write-Host "$f が $PSScriptRoot に無いのでコピーしていません。" -ForegroundColor Yellow }
        }
        Write-Host "ランチャーを $appDir にコピーしました。"
    }
    Remove-Item (Join-Path $appDir 'ensure-peer.js') -ErrorAction SilentlyContinue   # 以前の版が書き出していたもの
    $bytes = [IO.File]::ReadAllBytes($self)
    if (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)) {
        $text = [IO.File]::ReadAllText($self, (New-Object System.Text.UTF8Encoding $false))
        [IO.File]::WriteAllText($self, $text, (New-Object System.Text.UTF8Encoding $true))
        Write-Host "このファイルに BOM が無かったので付けました（Windows PowerShell 5.1 で正しく読むため）。"
    }
    # アイコン: PNG を 1 枚入れた .ico（Vista 以降で読める形式）。Windows 版は緑、WSL 版は青、両方は半分ずつ
    $iconFile = Join-Path $appDir "mulmoterminal-$Runtime.ico"
    $png = New-Object System.IO.MemoryStream
    (New-RuntimeBitmap 64).Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $data = $png.ToArray()
    $ico = New-Object System.IO.MemoryStream
    $w = New-Object System.IO.BinaryWriter $ico
    $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)                 # header: icon, 1 image
    $w.Write([byte]64); $w.Write([byte]64); $w.Write([byte]0); $w.Write([byte]0)  # 64x64
    $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$data.Length); $w.Write([uint32]22)
    $w.Write($data); $w.Flush()
    [IO.File]::WriteAllBytes($iconFile, $ico.ToArray())
    # conhost --headless を挟むと、ショートカットから起動してもコンソール窓が一切出ない
    # （powershell -WindowStyle Hidden だけだと一瞬見えるうえ、既定のターミナルが Windows Terminal だと隠れない）
    $lnkPath = Join-Path $lnkDir "$appName.lnk"
    $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath)
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\conhost.exe'
    $lnk.Arguments = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$self`" -Runtime $Runtime"
    $lnk.WorkingDirectory = $env:USERPROFILE
    $lnk.IconLocation = $iconFile
    $lnk.Description = "$appName を起動する"
    $lnk.Save()
    Write-Host "スタートメニューに登録しました: $lnkPath"
    Write-Host "スタートメニューで「$appName」を探して起動できます。右クリック →「タスクバーにピン留め」も使えます。"
    if ($Runtime -eq 'both') { Write-Host "Windows 側の窓 1 つで、WSL 側のセルも開けます（起動フォームの「実行先」で WSL を選ぶ）。" }
    if (Test-Path $configFile) { Write-Host "個別の設定 $configFile はそのまま使います。" }
    else { Write-Host "自分の値（ポートや作業フォルダなど）は $configFile に書けます（見本: launcher.config.example.json）。" }
    Write-Host "更新するときは、同じ方法でもう一度 -Install を実行してください。動いているランチャーは次の起動から新しい版になります。"
    exit
}

# ============================== 起動 ==============================
[System.Windows.Forms.Application]::EnableVisualStyles()

$startLimit  = 300                 # 秒。初回や更新時は npx のダウンロードとビルドがある
$closeGrace  = 15                  # 秒。ブラウザの接続が無い状態がこれだけ続いたら止める
$resumeGrace = 120                 # 秒。休止・スリープから戻ったあと、これだけは窓が閉じたと判断しない
$sleepGap    = 15                  # 秒。1 秒ごとの確認がこれ以上あいたら、その間は休止していたとみなす
                                   # （確認 1 回は応答待ちと停止待ちで最大 7 秒ほどかかるので、それより長くする）
$launcherLog = Join-Path $appDir 'launcher.log'   # 起動・状態の変化・止めた理由を残す（大きくなったら古い分を捨てる）
$exitRestart = 76                  # ブラウザの「Restart MulmoTerminal」で返る終了コード
if (-not $WorkDir) { $WorkDir = $env:USERPROFILE }

function Write-LauncherLog([string]$message) {
    try {
        if ((Get-Item $launcherLog -ErrorAction SilentlyContinue).Length -gt 1MB) {
            Move-Item $launcherLog "$launcherLog.old" -Force
        }
        $line = "{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}" -f (Get-Date), $Runtime, $message
        [IO.File]::AppendAllText($launcherLog, "$line`r`n", (New-Object System.Text.UTF8Encoding $false))
    } catch { }
}

function Show-Error([string]$message) {
    Write-LauncherLog "エラー: $message"
    [System.Windows.Forms.MessageBox]::Show($message, $appName, 'OK', 'Error') | Out-Null
}

if ($Runtime -eq 'both' -and $Port -eq $WslPort) {
    Show-Error "launcher.config.json の Port と WslPort が同じ番号です（$Port）。両方を同時に動かすには別の番号にしてください。"
    exit 1
}

# 窓を開くのは親（「両方」と「windows」では Windows 側、「wsl」では WSL 側）
$primaryPort = if ($Runtime -eq 'wsl') { $WslPort } else { $Port }
$url = "http://localhost:$primaryPort"

# --- ブラウザ --------------------------------------------------------------------------
$candidates = @{
    edge   = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
               "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
    chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
               "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
               "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
}
if (-not $candidates.ContainsKey($Browser)) { Show-Error "launcher.config.json の Browser は 'edge' か 'chrome' にしてください（今: '$Browser'）。"; exit 1 }
if (-not $BrowserPath) { $BrowserPath = $candidates[$Browser] | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if (-not $BrowserPath -or -not (Test-Path $BrowserPath)) { Show-Error "$Browser が見つかりません。launcher.config.json の BrowserPath に exe のフルパスを書いてください。"; exit 1 }
$browserProcess = [IO.Path]::GetFileNameWithoutExtension($BrowserPath)
$browserArgs = @("--app=$url")
if ($BrowserProfile) {
    # フォルダ名が先: 表示名が別のプロファイルのフォルダ名と同じでも、フォルダ名で書いた人の意図どおりになる
    $profiles = Get-BrowserProfiles
    $match = @($profiles | Where-Object { $_.Dir -eq $BrowserProfile })
    if (-not $match.Count) { $match = @($profiles | Where-Object { $_.Name -eq $BrowserProfile }) }
    if ($match.Count -eq 1) { $profileDir = $match[0].Dir }
    elseif (-not $profiles.Count) { $profileDir = $BrowserProfile }   # 一覧が読めない（専用プロファイルの初回など）。フォルダ名として渡す
    else {
        $list = ($profiles | ForEach-Object { "- $($_.Name)（フォルダ名: $($_.Dir)）" }) -join "`n"
        $why = if ($match.Count) { "同じ表示名のプロファイルが複数あります。フォルダ名で書いてください" } else { "そのプロファイルがありません" }
        Show-Error "launcher.config.json の BrowserProfile '$BrowserProfile': $why。`n$Browser のプロファイル:`n$list"
        exit 1
    }
    $browserArgs = @("--profile-directory=`"$profileDir`"") + $browserArgs
}
if ($UseDedicatedProfile) {
    $browserArgs = @("--user-data-dir=`"$userDataDir`"", '--no-first-run') + $browserArgs
}

function Test-Port([int]$p) {
    try { (Invoke-WebRequest "http://127.0.0.1:$p" -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }
}
function Open-Window { Start-Process $BrowserPath -ArgumentList $browserArgs }

# 窓が開いているか = ブラウザが親のポートに接続しているか。
# ページは開いている間サーバーと接続し続け、閉じると切れる（使われない接続もサーバーが数秒で閉じる）。
# WSL 側のセルも、ブラウザは親にだけ接続する（親が中継する）ので、親だけ見ればよい。
function Test-BrowserConnected {
    $pids = @(Get-Process $browserProcess -ErrorAction SilentlyContinue | ForEach-Object Id)
    if ($pids.Count -eq 0) { return $false }
    [bool](Get-NetTCPConnection -RemotePort $primaryPort -State Established -ErrorAction SilentlyContinue |
           Where-Object { $pids -contains $_.OwningProcess } | Select-Object -First 1)
}

# --- サーバーの一覧 --------------------------------------------------------------------------
# Role: 'own' = このランチャーが起動して止める / 'adopted' = 起動済みだったので使うだけ /
#       'elsewhere' = 別のランチャーが起動処理中なので待つだけ
# State: 'starting' / 'running' / 'restarting' / 'stopped'（終了した・起動に失敗した）
$kinds = if ($Runtime -eq 'both') { @('windows', 'wsl') } else { @($Runtime) }
$servers = @(foreach ($kind in $kinds) {
    $p = if ($kind -eq 'wsl') { $WslPort } else { $Port }
    [pscustomobject]@{
        Kind = $kind; Label = $(if ($kind -eq 'wsl') { 'WSL' } else { 'Windows' }); Port = $p
        Primary = ($p -eq $primaryPort); Role = 'own'; State = 'starting'; Proc = $null
        Mutex = (New-Object System.Threading.Mutex($false, "Local\MulmoTerminalLauncher-$p")); OwnsMutex = $false
        OutLog = (Join-Path $appDir "server-$kind.log"); ErrLog = (Join-Path $appDir "server-$kind-error.log")
        Exe = $null; Args = @(); Dir = $null; StartedAt = $null
    }
})
$primary = $servers | Where-Object Primary | Select-Object -First 1

# --- 二重起動の防止: 同じポートのランチャーが動いていれば、そのサーバーは任せる --------------------
foreach ($s in $servers) {
    try { $s.OwnsMutex = $s.Mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $s.OwnsMutex = $true }
    if (-not $s.OwnsMutex) { $s.Role = 'elsewhere' }
    elseif (Test-Port $s.Port) { $s.Role = 'adopted'; $s.State = 'running' }   # 別の方法で起動済み: 開くだけ（止めない）
}
function Close-Mutexes { foreach ($s in $servers) { if ($s.OwnsMutex) { try { $s.Mutex.ReleaseMutex() } catch { } ; $s.OwnsMutex = $false } } }

# 起動するものが 1 つも無ければ、窓を開くだけ（以前と同じ動き）
if (-not ($servers | Where-Object { $_.Role -eq 'own' })) {
    if (Test-Port $primaryPort) { Open-Window }
    else { [System.Windows.Forms.MessageBox]::Show("$appName は起動処理中です。画面右下の表示が消えるまでお待ちください。", $appName) | Out-Null }
    Close-Mutexes
    exit
}

# --- Windows 側の node -----------------------------------------------------------------------
$script:winNode = $null
function Resolve-WindowsNode {
    if ($script:winNode) { return $script:winNode }
    if ($NodeVersion) {
        # volta run は 0 以外の終了コードをすべて 126 にするので、76 を見分けられない。
        # Volta が入れた node の場所だけ教えてもらい、その node から npx を直接動かす。
        if (-not (Get-Command volta -ErrorAction SilentlyContinue)) { Show-Error "Volta が見つかりません。launcher.config.json の NodeVersion を空にすると PATH 上の npx を使います。"; exit 1 }
        $nodeExe = (& volta run --node $NodeVersion node -p "process.execPath" 2>$null | Select-Object -Last 1)
        if (-not $nodeExe -or -not (Test-Path $nodeExe)) { Show-Error "Volta で Node $NodeVersion を用意できませんでした。"; exit 1 }
        $env:PATH = "$(Split-Path $nodeExe);$env:PATH"   # サーバーが起動する node / npm も同じ版にそろえる
    } else {
        $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    }
    $script:winNode = $nodeExe
    $nodeExe
}

# --- サーバーを起動するコマンド ------------------------------------------------------------
function Set-WslCommand($s) {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { return 'WSL が見つかりません。' }
    # Windows 側の環境変数は WSL に渡らないので、必要なものはコマンドの中で設定する。
    # 引用符が Windows -> wsl.exe -> bash と渡る間に崩れないよう、コマンドは base64 で渡す。
    # bash -i は ~/.bashrc の PATH（Volta / nvm）を通すため。wsl.exe は Linux 側の終了コードをそのまま返す。
    $wd = $WslWorkDir -replace '^~', '$HOME'
    if ($WslNodeVersion) {
        # Windows 側と同じく volta run は通さない（終了コードが 126 になり 76 を見分けられない）。
        # node の場所だけ教えてもらい、その node 付属の npx-cli.js を直接動かす。
        $npxCmd = "nd=`$(volta run --node $WslNodeVersion node -p process.execPath) && d=`$(dirname `"`$nd`") && " +
                  "export PATH=`"`$d:`$PATH`" && exec `"`$nd`" `"`$d/../lib/node_modules/npm/bin/npx-cli.js`""
    } else {
        $npxCmd = 'exec npx'
    }
    $bash = "export MULMOTERMINAL_RELAUNCH_ON_EXIT=1; mkdir -p `"$wd`" && cd `"$wd`" && " +
            "$npxCmd --yes '$Package' --cwd `"$wd`" --port $($s.Port) --no-open"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bash))
    $s.Exe = 'wsl.exe'
    $s.Args = @()
    if ($WslDistro) { $s.Args += @('-d', $WslDistro) }
    $s.Args += @('--exec', 'bash', '-lic', "`"eval `$(echo $b64 | base64 -d)`"")
    $s.Dir = $env:USERPROFILE
    $null
}
function Set-WindowsCommand($s) {
    if ($NodeVersion) {
        $nodeExe = Resolve-WindowsNode
        $s.Exe = $nodeExe
        $prefix = @("`"$(Join-Path (Split-Path $nodeExe) 'node_modules\npm\bin\npx-cli.js')`"")
    } else {
        $s.Exe = (Get-Command npx -ErrorAction SilentlyContinue).Source
        if (-not $s.Exe) { return 'npx が見つかりません。Node.js を入れるか、launcher.config.json の NodeVersion を指定してください。' }
        $prefix = @()
    }
    $env:MULMOTERMINAL_RELAUNCH_ON_EXIT = '1'
    $s.Args = $prefix + @('--yes', $Package, '--cwd', "`"$WorkDir`"", '--port', "$($s.Port)", '--no-open')
    $s.Dir = $WorkDir
    $null
}
$script:commandErrors = @()
foreach ($s in $servers | Where-Object { $_.Role -eq 'own' }) {
    $err = if ($s.Kind -eq 'wsl') { Set-WslCommand $s } else { Set-WindowsCommand $s }
    if ($err) {
        if ($s.Primary) { Show-Error $err; Close-Mutexes; exit 1 }
        $s.State = 'stopped'; $script:commandErrors += "$($s.Label): $err"   # 子が起動できなくても親は使える
    }
}

# --- remoteHosts の設定（両方のとき） -------------------------------------------------------------------
# 親の config.json の remoteHosts に、WSL 側のサーバーが無ければ足す。親は設定を読み直すたびに反映するので
# 再起動はいらない。JSON は node で読み書きする（PowerShell 5.1 の ConvertTo-Json は形を崩すため）。
# 中身は同じフォルダの ensure-peer.mjs（-Install がこのファイルと一緒にコピーする）
$script:peerNotice = $null
function Confirm-PeerConfig {
    if ($Runtime -ne 'both' -or -not $EnsurePeer) { return }
    $nodeExe = Resolve-WindowsNode
    if (-not $nodeExe) { $script:peerNotice = 'node が見つからないため、config.json の remoteHosts を確かめられませんでした。'; return }
    $js = Join-Path $PSScriptRoot 'ensure-peer.mjs'
    if (-not (Test-Path $js)) { $script:peerNotice = "ensure-peer.mjs が $PSScriptRoot に無いため、config.json の remoteHosts を確かめられませんでした（-Install し直してください）。"; return }
    $config = Join-Path $env:USERPROFILE '.mulmoterminal\config.json'
    $peerUrl = "http://127.0.0.1:$WslPort"
    $result = (& $nodeExe $js $config $PeerId $PeerLabel $peerUrl 2>$null | Select-Object -Last 1)
    switch -Wildcard ("$result") {
        'present'   { }
        'added*'    { $script:peerNotice = "config.json の remoteHosts に $PeerLabel（$peerUrl）を足しました。" }
        'conflict*' { $script:peerNotice = "config.json の remoteHosts の '$PeerId' が別の URL（$($result.Substring(9))）を指しています。書き換えていません。" }
        default     { $script:peerNotice = "config.json を読めなかったため、remoteHosts を足していません（$result）。" }
    }
}
Confirm-PeerConfig

function Start-Server($s) {
    $p = Start-Process $s.Exe -ArgumentList $s.Args -WorkingDirectory $s.Dir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $s.OutLog -RedirectStandardError $s.ErrLog
    $null = $p.Handle   # これを読んでおかないと、終了後に ExitCode が取れない
    $s.Proc = $p
    $s.StartedAt = Get-Date
}

function New-StatusIcon([System.Drawing.Color]$color) { [System.Drawing.Icon]::FromHandle((New-StatusBitmap $color 16).GetHicon()) }
$iconStarting = New-StatusIcon ([System.Drawing.Color]::FromArgb(230, 140, 20))
$iconRunning  = [System.Drawing.Icon]::FromHandle((New-RuntimeBitmap 16).GetHicon())
$iconFailed   = New-StatusIcon ([System.Drawing.Color]::FromArgb(200, 40, 40))

# --- タスクトレイ ---------------------------------------------------------------------------
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $iconStarting
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add("$appName を開く")
$miOpen.Enabled = $false
$miLog  = $menu.Items.Add('ログを開く')
[void]$menu.Items.Add('-')
$miStop = $menu.Items.Add('停止して終了')
$tray.ContextMenuStrip = $menu
$tray.Visible = $true

$stateText = @{ starting = '起動中'; running = '動作中'; restarting = '再起動中'; stopped = '停止' }
# トレイの文字は 63 文字まで
function Set-TrayText([string]$text) { $tray.Text = if ($text.Length -gt 63) { $text.Substring(0, 63) } else { $text } }
function Get-ChildSummary {
    $parts = @($servers | Where-Object { -not $_.Primary -and $_.State -ne 'running' } | ForEach-Object { "$($_.Label): $($stateText[$_.State])" })
    if ($parts.Count) { "（$($parts -join ' / ')）" } else { '' }
}
Set-TrayText "${appName}: 起動中..."

# --- 起動中の小窓（画面右下） ---------------------------------------------------------------
$splash = New-Object System.Windows.Forms.Form
$splash.FormBorderStyle = 'None'
$splash.ShowInTaskbar = $false
$splash.TopMost = $true
$splash.StartPosition = 'Manual'
$splash.Size = New-Object System.Drawing.Size 360, $(if ($servers.Count -gt 1) { 96 } else { 74 })
$splash.BackColor = [System.Drawing.Color]::FromArgb(32, 34, 40)
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$splash.Location = New-Object System.Drawing.Point ($wa.Right - $splash.Width - 16), ($wa.Bottom - $splash.Height - 16)
$label = New-Object System.Windows.Forms.Label
$label.Dock = 'Fill'
$label.ForeColor = [System.Drawing.Color]::White
$label.Font = New-Object System.Drawing.Font 'Yu Gothic UI', 10
$label.Padding = New-Object System.Windows.Forms.Padding 12, 10, 12, 8
$splash.Controls.Add($label)
$label.Add_Click({ $splash.Hide() })   # クリックで隠せる（トレイのアイコンは残る）

function Stop-Server($s) {
    $p = $s.Proc
    if ($s.Role -ne 'own' -or -not $p -or $p.HasExited) { return }
    # まずブラウザの Stop ボタンと同じ POST /api/shutdown。Ctrl+C と同じ終了処理が走り、
    # セッションの状態も保存される（Windows の taskkill /F ではそれが失われる: #3234）
    try {
        Invoke-WebRequest "http://127.0.0.1:$($s.Port)/api/shutdown" -Method Post -Headers @{ Origin = "http://localhost:$($s.Port)" } -UseBasicParsing -TimeoutSec 3 | Out-Null
        [void]$p.WaitForExit(15000)
    } catch { }
    if (-not $p.HasExited -and $s.Kind -eq 'wsl') {
        # wsl.exe を止めても Linux 側は残ることがあるので、Linux 側で止める
        $kill = @(); if ($WslDistro) { $kill += @('-d', $WslDistro) }
        & wsl.exe @kill --exec pkill -f -- "--port $($s.Port) --no-open" 2>$null | Out-Null
        [void]$p.WaitForExit(5000)
    }
    if (-not $p.HasExited) { taskkill /PID $p.Id /T /F | Out-Null }
    if ($s.Kind -eq 'windows') {
        # 念のため、まだポートを掴んでいる Windows のプロセスがあれば止める
        # （WSL のときは Windows 側に見えるのは中継役だけなので触らない）
        Get-NetTCPConnection -LocalPort $s.Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { taskkill /PID $_ /T /F | Out-Null }
    }
}

# ブラウザの「Restart MulmoTerminal」と同じ POST /api/restart。終了コード 76 で終わるので、
# タイマーの処理が npx をもう一度動かす（最新版を取りにいく）。使うだけのサーバーには頼まない
function Request-Restart($s) {
    if ($s.Role -ne 'own' -or $s.State -ne 'running' -or -not $s.Proc -or $s.Proc.HasExited) { return }
    try {
        Invoke-WebRequest "http://127.0.0.1:$($s.Port)/api/restart" -Method Post -Headers @{ Origin = "http://localhost:$($s.Port)" } -UseBasicParsing -TimeoutSec 3 | Out-Null
    } catch {
        Show-ChildWarning "$($s.Label) 側のサーバーを再起動できませんでした（古い版のまま動いています）。"
    }
}

function Stop-All([string]$reason) {
    $timer.Stop()
    Write-LauncherLog "停止: $reason"
    Set-TrayText "${appName}: 停止中..."
    foreach ($s in $servers) { Stop-Server $s }
    $tray.Visible = $false
    $tray.Dispose()
    $splash.Close()
    [System.Windows.Forms.Application]::Exit()
}

function Set-Failed([string]$message) {
    Write-LauncherLog "起動失敗: $message"
    $script:state = 'failed'
    $tray.Icon = $iconFailed
    Set-TrayText "${appName}: 起動失敗"
    $label.Text = "$appName を起動できませんでした`n$message"
    $splash.Show()
    $tray.ShowBalloonTip(10000, "$appName を起動できませんでした", "$message`nトレイのアイコンを右クリック →「ログを開く」で原因を確認できます。", 'Error')
    $miStop.Text = '終了'
}

# 子（WSL 側）が使えなくなったことを知らせる。親は動き続ける
function Show-ChildWarning([string]$message) {
    Write-LauncherLog "警告: $message"
    $tray.ShowBalloonTip(8000, "$appName", "$message`nWindows 側はそのまま使えます。トレイのアイコンを右クリック →「ログを開く」で原因を確認できます。", 'Warning')
}

$miOpen.Add_Click({ Open-Window })
$tray.Add_DoubleClick({ if ($script:state -eq 'running') { Open-Window } })
$miLog.Add_Click({
    if (Test-Path $launcherLog) { Start-Process notepad.exe $launcherLog }
    foreach ($s in $servers | Where-Object { $_.Role -eq 'own' }) {
        Start-Process notepad.exe $s.OutLog
        if ((Get-Item $s.ErrLog -ErrorAction SilentlyContinue).Length -gt 0) { Start-Process notepad.exe $s.ErrLog }
    }
})
$miStop.Add_Click({ Stop-All 'トレイのメニューから' })

$script:state = 'starting'          # 全体の状態（親で決まる）: starting / running / failed
$script:startedAt = Get-Date
$script:seenWindow = $false
$script:missingSince = $null
$script:lastTick = Get-Date
$script:resumedAt = $null

function Update-Label {
    $elapsed = [int]((Get-Date) - $script:startedAt).TotalSeconds
    $lines = @("$appName を起動しています... $elapsed 秒")
    if ($servers.Count -gt 1) { $lines += ($servers | ForEach-Object { "$($_.Label): $($stateText[$_.State])" }) -join ' / ' }
    $lines += '初回や更新があったときは数分かかります'
    $label.Text = $lines -join "`n"
    $splash.Refresh()   # 下の Test-Port が一瞬止まる間も、描画が途中のままにならないように
}

# 休止に入る直前の Windows からの通知（WM_POWERBROADCAST / PBT_APMSUSPEND）を受け取る見えない窓。
# 休止の操作から実際に休止に入るまでには十数秒かかることがあり、その間にブラウザの接続が先に切れる。
# 時刻の飛びで気づくのは戻ってからなので、入る前の分はこの通知で防ぐ。作れなければ時刻の飛びだけで判断する
$script:powerWatcher = $null
try {
    Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Windows.Forms;
public class MtPowerWatcher : NativeWindow {
    public static DateTime LastSuspend = DateTime.MinValue;
    public static DateTime LastResume = DateTime.MinValue;
    public MtPowerWatcher() { CreateHandle(new CreateParams()); }
    protected override void WndProc(ref Message m) {
        if (m.Msg == 0x218) {                       // WM_POWERBROADCAST
            int e = m.WParam.ToInt32();
            if (e == 0x4) LastSuspend = DateTime.Now;                     // PBT_APMSUSPEND
            else if (e == 0x7 || e == 0x12) LastResume = DateTime.Now;    // PBT_APMRESUMESUSPEND / RESUMEAUTOMATIC
        }
        base.WndProc(ref m);
    }
}
'@
    $script:powerWatcher = New-Object MtPowerWatcher
} catch {
    Write-LauncherLog "休止の通知を受け取る窓を作れませんでした（時刻の飛びだけで判断します）: $($_.Exception.Message)"
}
$script:seenSuspend = [DateTime]::MinValue
$script:seenResume = [DateTime]::MinValue
$suspendHold = 60                  # 秒。休止に入るという通知のあと、これだけは窓が閉じたと判断しない

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    if ($script:state -eq 'failed') { return }

    # 0. 休止・スリープから戻ったか。止まっている間はタイマーも止まるので、前の確認から時間が飛ぶ。
    # 戻った直後はブラウザの接続が切れていて、つなぎ直すまで時間がかかる。そのあいだに「窓が閉じた」と
    # 判断して止めないよう、$resumeGrace 秒は待つ。起動待ちの時間も、休止していた分は数えない
    $now = Get-Date
    $gap = ($now - $script:lastTick).TotalSeconds
    $script:lastTick = $now
    if ($gap -ge $sleepGap) {
        $script:resumedAt = $now
        $script:missingSince = $null
        $script:startedAt = $script:startedAt.AddSeconds($gap)
        foreach ($s in $servers | Where-Object { $_.StartedAt }) { $s.StartedAt = $s.StartedAt.AddSeconds($gap) }
        Write-LauncherLog ("休止から復帰（{0:N0} 秒止まっていた）。{1} 秒は窓が閉じたと判断しない" -f $gap, $resumeGrace)
    }
    if ($script:powerWatcher) {
        $suspendAt = [MtPowerWatcher]::LastSuspend
        $resumeAt = [MtPowerWatcher]::LastResume
        if ($suspendAt -gt $script:seenSuspend) { $script:seenSuspend = $suspendAt; Write-LauncherLog '休止に入るという通知を受け取った' }
        if ($resumeAt -gt $script:seenResume) {
            $script:seenResume = $resumeAt
            $script:resumedAt = $resumeAt
            $script:missingSince = $null
            Write-LauncherLog "休止から戻ったという通知を受け取った。$resumeGrace 秒は窓が閉じたと判断しない"
        }
    }

    # 1. 自分で起動したサーバーが終了していないか
    foreach ($s in $servers | Where-Object { $_.Role -eq 'own' -and $_.Proc -and $_.State -ne 'stopped' }) {
        if (-not $s.Proc.HasExited) { continue }
        $code = $s.Proc.ExitCode
        if ($code -eq $exitRestart) {
            # ブラウザから再起動された: npx をもう一度動かす（最新のコミットを取りにいく）
            Write-LauncherLog "$($s.Label) 側を再起動（終了コード 76）"
            Start-Server $s
            if ($s.State -eq 'running') { $s.State = 'restarting' }
            if ($s.Primary -and $script:state -eq 'running') { $tray.Icon = $iconStarting; Set-TrayText "${appName}: 再起動中..." }
            # 親の再起動は親にしか届かない（ブラウザは親の /api/restart を呼ぶ）。子も同じ版にそろえるため、
            # このランチャーが起動した子にも再起動を頼む。子は 76 で終わり、上の処理で npx がもう一度動く
            if ($s.Primary) { foreach ($c in $servers | Where-Object { -not $_.Primary }) { Request-Restart $c } }
            continue
        }
        $s.State = 'stopped'
        if ($s.Primary) {
            if ($script:state -eq 'starting') { Set-Failed "サーバーが終了しました（終了コード $code）"; return }
            $tray.ShowBalloonTip(5000, "$appName が停止しました", "サーバーが終了しました（終了コード $code）", 'Warning')
            Start-Sleep -Seconds 5
            Stop-All "$($s.Label) 側のサーバーが終了した（終了コード $code）"
            return
        }
        Show-ChildWarning "$($s.Label) 側のサーバーが終了しました（終了コード $code）。"
    }

    # 2. 応答を待っているサーバー（自分で起動したもの・別のランチャーが起動中のもの）
    foreach ($s in $servers | Where-Object { $_.State -in @('starting', 'restarting') }) {
        if (Test-Port $s.Port) {
            $wasRestarting = $s.State -eq 'restarting'
            $s.State = 'running'
            Write-LauncherLog "$($s.Label) 側が応答（ポート $($s.Port)、$(if ($s.Role -eq 'own') { '起動したもの' } else { '起動済みのものを使う' })）"
            if ($s.Primary -and $wasRestarting) { $script:missingSince = $null }
        } elseif (-not $s.Primary -and $s.State -eq 'starting' -and $s.Role -eq 'own' -and
                  ((Get-Date) - $s.StartedAt).TotalSeconds -ge $startLimit) {
            $s.State = 'stopped'
            Show-ChildWarning "$($s.Label) 側のサーバーが $startLimit 秒待っても応答しません。"
        }
    }

    switch ($script:state) {
        'starting' {
            Update-Label
            if ($primary.State -eq 'running') {
                $script:state = 'running'
                $splash.Hide()
                $tray.Icon = $iconRunning
                $miOpen.Enabled = $true
                Open-Window
                $tip = if ($StopWithWindow) { '窓を閉じるとサーバーも停止します。' } else { 'サーバーはトレイのアイコンから停止できます。' }
                $extra = @($script:commandErrors) + @($script:peerNotice | Where-Object { $_ })
                $more = if ($extra.Count) { "`n" + ($extra -join "`n") } else { '' }
                $tray.ShowBalloonTip(4000, "$appName を起動しました", "$tip トレイのアイコンから開き直せます。$more", 'Info')
            } elseif ([int]((Get-Date) - $script:startedAt).TotalSeconds -ge $startLimit) {
                Set-Failed "$startLimit 秒待っても応答がありません"
            }
        }
        'running' {
            # トレイの文字とアイコン: 親が再起動中なら橙、そうでなければ動作中（子の状態は文字で添える）
            if ($primary.State -eq 'restarting') { $tray.Icon = $iconStarting; Set-TrayText "${appName}: 再起動中..." }
            else { $tray.Icon = $iconRunning; Set-TrayText "${appName}: 動作中$(Get-ChildSummary)" }
            if (-not $StopWithWindow -or $primary.State -ne 'running') { return }
            # 窓を閉じたら止める。止めるものが無い（親も子も起動済みだったものを使っている）なら見なくてよい
            if (-not ($servers | Where-Object { $_.Role -eq 'own' -and $_.State -ne 'stopped' })) { return }
            if (Test-BrowserConnected) {
                if ($script:missingSince) { Write-LauncherLog ("ブラウザの接続が戻った（{0:N0} 秒切れていた）" -f ((Get-Date) - $script:missingSince).TotalSeconds) }
                $script:seenWindow = $true
                $script:missingSince = $null
            } elseif ($script:seenWindow) {
                if ($script:resumedAt -and ((Get-Date) - $script:resumedAt).TotalSeconds -lt $resumeGrace) { return }
                # 休止に入る途中（通知のあと、まだ戻っていない）。通知だけ来て休止しなかった場合に備え、時間で区切る
                if ($script:seenSuspend -gt $script:seenResume -and ((Get-Date) - $script:seenSuspend).TotalSeconds -lt $suspendHold) { return }
                if (-not $script:missingSince) { $script:missingSince = Get-Date; Write-LauncherLog 'ブラウザの接続が切れた' }
                elseif (((Get-Date) - $script:missingSince).TotalSeconds -ge $closeGrace) { Stop-All "ブラウザの接続が $closeGrace 秒戻らなかった（窓を閉じた）" }
            }
        }
    }
})

Write-LauncherLog ("起動: " + (($servers | ForEach-Object { "$($_.Label)=$($_.Role)" }) -join ', '))
Update-Label
$splash.Show()
$splash.Refresh()
foreach ($s in $servers | Where-Object { $_.Role -eq 'own' -and $_.State -eq 'starting' }) { Start-Server $s }
$script:lastTick = Get-Date
$timer.Start()
[System.Windows.Forms.Application]::Run()
Close-Mutexes
