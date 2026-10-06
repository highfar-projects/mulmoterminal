---
title: MulmoCast videos — Remotion scenes
nav_title: MulmoCast videos
layout: default
parent: English
nav_order: 24
description: Let Claude Code write each scene of a MulmoCast video as a Remotion component. Optional packages you install yourself, where to put them so an npx upgrade keeps them, and how to tell it works.
---

# MulmoCast videos
{: .no_toc }

The GUI panel shows and renders MulmoCast scripts (mulmoScripts) — the slides and videos an agent
writes for you. This page covers the parts that need something installed first.

1. TOC
{:toc}

## Remotion scenes {#remotion}

Since mulmocast 2.13.0 a beat can be a **`remotion` scene**: you describe in words what the scene
shows, Claude Code writes it as a [Remotion](https://www.remotion.dev) component, and MulmoCast
renders it into the beat's video — motion, SVG paths, 3D (three.js), noise and shader effects.

```json
{
  "remotionParams": { "brief": "Deep navy background, off-white text, one cyan accent." },
  "beats": [
    {
      "text": "What the narrator says over this scene.",
      "image": {
        "type": "remotion",
        "prompt": "The title appears in the centre, then three boxes appear left to right, joined by arrows.",
        "fps": 30
      }
    }
  ]
}
```

- `image.prompt` (required) — what the scene shows.
- `image.fps` (optional) — 1 to 60, 30 when left out.
- `remotionParams.brief` (optional) — art direction shared by every scene, so they look like one
  video.

The scene lasts as long as its narration, or as the beat's `duration` when you set a longer one.
The full reference is
[mulmocast's remotion.md](https://github.com/receptron/mulmocast-cli/blob/main/docs/remotion.md).

### 1. Install the packages, in your home directory

They are optional packages of mulmocast and **MulmoTerminal does not install them** — only people
who want these scenes need them. Install them **in your home directory**:

```bash
cd ~
npm install remotion @remotion/bundler @remotion/renderer react react-dom \
  @remotion/three three @react-three/fiber @remotion/effects @remotion/paths @remotion/noise \
  @remotion/shapes @remotion/transitions @remotion/motion-blur @remotion/layout-utils
```

Why there: `npx mulmoterminal@latest` keeps the app in a folder under `~/.npm/_npx/` that is
replaced on every release, so packages installed next to it would be gone after the next upgrade.
Node looks for packages in every parent folder's `node_modules`, so `~/node_modules` is found from
any release.

### 2. Check that MulmoCast can see them

```bash
npx mulmoterminal@latest init
```

The tool list should include:

```
  ✓ remotion — Remotion scenes in MulmoCast videos
```

`○ remotion — optional` means nothing was found; `installed only in part; missing: …` names the
packages still to install.

### 3. Claude Code must be logged in

The scene is written by `claude -p`, started **by the MulmoTerminal server** — not by the cell you
are talking to. So:

- `claude` has to be installed and logged in on the machine the server runs on.
- It runs as the server's own login (your default one). A cell running on
  [another subscription](accounts.html) does not change that, and the usage is counted there.
- Each scene calls it a few times — to write the component, to fix it if it fails to render, and
  to look at frames from the render and improve it. Expect a minute or more per scene.

### 4. Make a video

Agents do not suggest `remotion` beats on their own yet. Ask for one by name — for example
*"make the second beat a remotion scene: …"* — or write the beat into the script yourself, then
render the video from the GUI panel as usual.

The first render downloads a headless Chrome for Remotion (around 90 MB), once.

The code Claude Code wrote is kept next to the beat's images, in `<beat>_remotion/<hash>.tsx`, and
reused as long as nothing it was written from changes: the prompt, the narration's wording, the
brief, the scene's place in the video, and the canvas size and fps. Change any of those — including
adding a beat before it — and the scene is written again. Audio that only got longer or shorter
(another voice, another speed) re-renders the same code without asking Claude Code.

### Things to know

- **The generated code runs on your machine**, in a headless browser that can reach the network —
  the same trust as an `html_tailwind` beat's `script`. Do not render a script you do not trust.
- The install leaves a `package.json` and `node_modules` in your home directory, and those packages
  are then found by **any** Node project under it that does not install its own copy.
- A `remotion` beat cannot also have a `moviePrompt`.
- On Linux without a GPU, three.js scenes may fail to get a WebGL context.
