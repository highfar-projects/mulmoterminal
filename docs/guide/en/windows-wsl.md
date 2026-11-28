---
title: Windows and WSL2 in one window — the Start-menu launcher
layout: default
parent: English
nav_order: 22.5
description: Install the Windows launcher (straight from GitHub, or downloaded first), run MulmoTerminal on Windows, on WSL2 or on both from one window, and how the two servers fit together.
---

# Windows and WSL2 in one window
{: .no_toc }

- TOC
{:toc}

This page is about **this fork** (`highfar-projects/mulmoterminal`). On Windows it ships a
**Start-menu launcher**, a PowerShell script in
[`tools/windows-launcher/`](https://github.com/highfar-projects/mulmoterminal/tree/main/tools/windows-launcher).
It starts MulmoTerminal with no console window and opens it in an Edge or Chrome app window. It
can run the server on Windows, inside WSL2, or **both at once**, and then the cells of both open
from one window.

## What the launcher does

- Starts the server with **no console window**, and opens it in an **app window** (Edge by default,
  Chrome if you choose).
- Shows its state with a **tray icon**: orange while starting, green / blue while running, red when
  it failed. When something goes wrong, right-click it → **ログを開く** ("open log"; the
  launcher's menu is in Japanese).
- **Closing the window stops the server.** It waits 15 seconds first, and does not count the time
  the PC was asleep.
- **Updates on restart.** **Settings → Restart MulmoTerminal** in the browser makes it run `npx`
  again, which fetches the newest commit. You do not need to write a restart loop yourself.

Choose where the server runs with `-Runtime`. Each choice is a Start-menu entry of its own:

| `-Runtime` | Start-menu entry | Runs |
| --- | --- | --- |
| `windows` | MulmoTerminal | the Windows server only (port 34568) |
| `wsl` | MulmoTerminal (WSL) | the WSL2 server only (port 34567) |
| `both` | MulmoTerminal (Windows + WSL) | both. WSL's cells open from the one Windows window |

For `wsl` and `both`, set WSL up first: `git`, `tmux`, Node and Claude Code installed **inside**
the distribution, and logged in there. WSL keeps its own `~/.claude`, so the Windows login does not
carry over. The steps are in the README's
[WSL2](https://github.com/highfar-projects/mulmoterminal#wsl2) section.

## Install it

There are two ways. Either way the files land in `%LOCALAPPDATA%\MulmoTerminalLauncher`, a
Start-menu entry is added (you can also pin it to the taskbar with a right-click), and your own
settings file `launcher.config.json` is never overwritten.

### Run it straight from GitHub

Paste this one line into PowerShell. Change `-Runtime` to suit.

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/install.ps1))) -Runtime both
```

- It fetches the launcher files into a temporary folder, installs them, and removes the folder.
- **Running the same line again is the update.**
- Add `-Ref <branch or tag>` to install from somewhere other than `main`.

### Download it, then run it

Save these three files into one folder:

- [`mulmoterminal-launcher.ps1`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/mulmoterminal-launcher.ps1) — the launcher itself
- [`ensure-peer.mjs`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/ensure-peer.mjs) — `both` uses it to add WSL to `remoteHosts`
- [`launcher.config.example.json`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/launcher.config.example.json) — a sample of the settings file

If you cloned the repository, or downloaded it with **Code → Download ZIP** and unpacked it, the
`tools\windows-launcher` folder already holds all three.

Open PowerShell in that folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\mulmoterminal-launcher.ps1 -Install -Runtime both
```

- **To update, download the files again and run the same command.**
- Keep `mulmoterminal-launcher.ps1` **exactly as saved**. If an editor saves it again without its
  BOM (UTF-8 with BOM), Windows PowerShell 5.1 can no longer read it correctly.
- A file saved by a browser is marked "downloaded from the internet". That does not matter here:
  both this command and the Start-menu entry run it with `-ExecutionPolicy Bypass`.
- The Start-menu entry runs the copy in `%LOCALAPPDATA%`, so you can delete the downloaded folder
  once it is installed.

### Your own settings

Write only the values you want to change into
`%LOCALAPPDATA%\MulmoTerminalLauncher\launcher.config.json`:

```json
{
  "DefaultRuntime": "both",
  "WorkDir": "%USERPROFILE%\\workspace",
  "WslWorkDir": "~/workspace",
  "NodeVersion": "24.21.0"
}
```

The [launcher's README](https://github.com/highfar-projects/mulmoterminal/blob/main/tools/windows-launcher/README.md)
lists every key (ports, browser, WSL distribution, Node versions and more). It also covers how to
check what took effect (`-ShowConfig`) and how to uninstall (`-Uninstall`).

## How Windows + WSL2 fits together

With `-Runtime both`, one Windows machine runs **two complete MulmoTerminal servers**, one per OS.
The browser talks to only one of them. The Windows server reaches the WSL one as a **remote host**,
the feature upstream added in [#3506](https://github.com/receptron/mulmoterminal/issues/3506):
`/remote/wsl/…` on the Windows server is forwarded to the WSL server.

Until 2026-11-28 this fork had its own relay for this (`peers`, `/peer/wsl/…`). It was removed in
favour of upstream's remote hosts, which do the same job and cover more of a cell.

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

### The page stays on the Windows server

The browser only ever opens the Windows server's address. The Windows server forwards a WSL cell's
requests itself, so neither server has to loosen its checks to accept the other. Terminal traffic is
passed through unchanged. Other requests cross only if they are in the gateway's table of routes
(`common/remoteRoutes.ts`), each held to the cell's own directory; anything else is refused.

### WSL is a remote host because the config says so

The Windows side's `~/.mulmoterminal/config.json` lists it. The launcher adds this entry the first
time `both` runs (and makes a backup of the file before it does):

```json
"remoteHosts": [{ "id": "wsl", "label": "WSL", "url": "http://127.0.0.1:34567" }]
```

- The URL must be a loopback address. WSL2 forwards its port to `127.0.0.1` on Windows, so no SSH
  tunnel is needed here.
- The browser names a host by its id only, never by a URL, so no web page can point the gateway
  somewhere else.
- The two servers must run the same major version, or the WSL cells say so instead of connecting.
  The launcher runs the same package on both sides, so they normally match.
- An older launcher wrote a `peers` entry instead. Nothing reads it any more; you can delete it.

### Every cell belongs to one server

- The launch panel's host picker chooses where a new cell runs. It appears only when
  `remoteHosts` is set.
- Everything about that cell is asked of the server it runs on: its terminal, status, Files pane,
  git, transcript and the questions it asks you. `/home/you/proj` on WSL and `C:\Users\you\proj` are
  two different directories, and so is the same path on the two machines.
- What a WSL cell can and cannot do follows upstream's remote hosts. Upstream's plans list what is
  not forwarded yet (for example the full-screen `/files` view and collections). This fork's own
  additions that act on this machine (the launch-config menu, the devcontainer badge, external asks)
  are not offered on a WSL cell.

### Nothing is shared between the two servers

Each server has its own `~/.mulmoterminal/config.json`, its own `~/.claude` (log in to Claude Code
on each side), its own [accounts](accounts.html) and [token rotation](token-rotation.html), and its
own sessions and tmux server.

### The launcher starts, restarts and stops both

- It starts both servers: `npx` on Windows, and `npx` inside WSL through `wsl.exe`.
- It stops both once the window has been closed for 15 seconds.
- **Restart MulmoTerminal** in the browser only reaches the Windows server. When that server exits
  to restart, the launcher restarts the WSL server too, so both run `npx` again and update together.
- If the WSL server fails, the Windows server keeps running on its own.

## When something is wrong

| What you see | What to do |
| --- | --- |
| No host picker in the launch panel | The Windows side's `config.json` has no `remoteHosts`. Start once with `-Runtime both` (with a launcher installed after 2026-11-28), or add the entry above by hand |
| WSL cells say the host is unreachable | Right-click the tray icon → **ログを開く** (open log). The launcher's log records why WSL did not start (for example Node or Claude Code missing inside WSL) |
| WSL cells report a version mismatch | The two servers run different major versions. Restart from the tray so both run `npx` again |
| A WSL cell runs on a different subscription than expected | WSL uses its own `~/.claude` login and its own `tokenRotation`. Check WSL's `~/.mulmoterminal/config.json`, not the Windows one |
