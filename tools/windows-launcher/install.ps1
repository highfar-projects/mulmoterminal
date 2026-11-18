# Installs or updates the MulmoTerminal launcher for Windows straight from GitHub.
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/install.ps1))) -Runtime both
#
# Downloads the launcher files into a temporary folder and runs `mulmoterminal-launcher.ps1 -Install`,
# which copies them to %LOCALAPPDATA%\MulmoTerminalLauncher and registers the Start-menu shortcut.
# Running it again updates the launcher; launcher.config.json (your own settings) is never touched.
#
# This file is ASCII on purpose: it is fetched as text by Invoke-RestMethod and run from memory, so it
# never goes through the BOM rule the launcher itself depends on. The launcher is saved byte for byte.
param(
    [ValidateSet('windows', 'wsl', 'both')][string]$Runtime,
    [string]$Ref = 'main',
    [string]$Repo = 'highfar-projects/mulmoterminal'
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 may still default to TLS 1.0, which GitHub refuses.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$base = "https://raw.githubusercontent.com/$Repo/$Ref/tools/windows-launcher"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("mulmoterminal-launcher-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null
try {
    foreach ($f in 'mulmoterminal-launcher.ps1', 'ensure-peer.mjs', 'launcher.config.example.json') {
        Write-Host "Downloading $base/$f"
        Invoke-WebRequest "$base/$f" -OutFile (Join-Path $tmp $f) -UseBasicParsing
    }
    $launcherArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $tmp 'mulmoterminal-launcher.ps1'), '-Install')
    if ($Runtime) { $launcherArgs += @('-Runtime', $Runtime) }
    & powershell.exe @launcherArgs
    if ($LASTEXITCODE) { throw "mulmoterminal-launcher.ps1 -Install failed (exit code $LASTEXITCODE)." }
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
