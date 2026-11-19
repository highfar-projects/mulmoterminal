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
- [`ensure-peer.mjs`](https://raw.githubusercontent.com/highfar-projects/mulmoterminal/main/tools/windows-launcher/ensure-peer.mjs) — `both` uses it to add WSL to `peers`
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
The browser talks to only one of them. The Windows server **relays** the WSL one as a **peer**:
`/peer/wsl/…` on the Windows server is `/…` on the WSL server, for ordinary requests and terminal
connections alike.

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

### The page stays on the Windows server

The browser only ever opens the Windows server's address. The relay checks the request against the
Windows server's own rules first, then hands it to WSL. Neither server has to loosen its checks to
accept requests from the other. Terminal traffic is passed through unchanged, so every kind of cell
(Claude, Codex, a launch command, …) works on WSL exactly as it does on Windows.

### WSL is a peer because the config says so

The Windows side's `~/.mulmoterminal/config.json` lists it. The launcher adds this entry the first
time `both` runs (and makes a backup of the file before it does):

```json
"peers": [{ "id": "wsl", "label": "WSL", "url": "http://127.0.0.1:34567" }]
```

The browser names a peer by its id only, never by a URL, so no web page can point the relay
somewhere else.

### Every cell belongs to one server

- The launch form's **Run on** picker chooses where a new cell runs. A WSL cell wears a **WSL**
  badge in its header.
- Everything about that cell is asked of the server it runs on: its terminal, transcript, resume
  list, worktrees, memo and the questions it asks you. `/home/you/proj` on WSL and
  `C:\Users\you\proj` are two different directories, and so is the same path on the two machines.
- **Command cells** (Run-menu scripts, launch configs, configured launchers) run on the Windows
  server only.

### Nothing is shared between the two servers

Each server has its own `~/.mulmoterminal/config.json`, its own `~/.claude` (log in to Claude Code
on each side), its own [accounts](accounts.html) and [token rotation](token-rotation.html), and its
own sessions and tmux server. The screen follows that:

- When **Run on** is WSL, the launch form shows **WSL's** saved folders and accounts.
- A WSL cell's account mark offers **WSL's** rotation tokens, with WSL's usage figures.
- The header's usage gauge shows WSL's readings after a **WSL** label, for example
  `WSL  /login 7d 26%  developer 5h 9% 7d 20%`. Hover over a figure to see whose it is.

### Notifications reach the one window from both

The page listens to both servers' activity, so the tab icon, the attention sound and the question
pane cover WSL cells too. If WSL stops answering, its cells say the server is down instead of just
looking slow.

### The launcher starts, restarts and stops both

- It starts both servers: `npx` on Windows, and `npx` inside WSL through `wsl.exe`.
- It stops both once the window has been closed for 15 seconds.
- **Restart MulmoTerminal** in the browser only reaches the Windows server. When that server exits
  to restart, the launcher restarts the WSL server too, so both run `npx` again and update together.
- If the WSL server fails, the Windows server keeps running on its own.

## When something is wrong

| What you see | What to do |
| --- | --- |
| No **Run on** picker in the launch form | The Windows side's `config.json` has no `peers`. Start once with `-Runtime both`, or add the entry above by hand |
| WSL cells say the server is down | Right-click the tray icon → **ログを開く** (open log). The launcher's log records why WSL did not start (for example Node or Claude Code missing inside WSL) |
| The usage gauge has no **WSL** section | WSL has nothing to show yet. Each server measures its own usage, so it appears once WSL has run Claude Code under a login |
| A WSL cell runs on a different subscription than expected | WSL uses its own `~/.claude` login and its own `tokenRotation`. Check WSL's `~/.mulmoterminal/config.json`, not the Windows one |
