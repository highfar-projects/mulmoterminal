---
title: Your own pictures behind a busy terminal
nav_title: Your own heat pictures
layout: default
parent: English
nav_order: 25
description: Add your own animated GIFs, images and short videos to the pictures MulmoTerminal shows behind a terminal that has been working hard for a while.
---

# Your own pictures behind a busy terminal
{: .no_toc }

Now and then a picture appears behind a terminal: a fizzing bomb, a kettle, a sumo bout. It is
MulmoTerminal's small theatre for a session that has been working hard for a while. It ships with
nine pictures, and you can add your own: an animated GIF, a still image or a short video. Each
session picks one at random, from the built-in pictures and yours together.

There is no control for this in Settings. It is set in the config file only.

1. TOC
{:toc}

## How a picture is shown

Knowing this is most of what makes a picture work well:

- **It grows stronger in four steps** while the session stays busy. Your picture is used at every
  step: it starts faint, gets more solid, and at the last step it shakes and the terminal washes
  red. You do not make four pictures; MulmoTerminal does that with one.
- **When the session calms down after a big run, there is a finale.** For a few seconds the picture
  is shown at full strength, then it goes. You can give a separate file for that moment, such as an
  explosion. Without one, your picture simply disappears.
- **It sits behind the text and lets it show through.** On a dark theme the picture is blended so
  that black disappears and bright parts glow. On a light theme white disappears and dark parts
  show. It is never fully opaque except during the finale.
- **It is fitted into the terminal**, centred, at most a little under the terminal's height, with its
  proportions kept.
- **Each session keeps its picture.** The pick comes from the session's id, so a session shows the
  same picture every time it heats up. Adding or removing a file changes which session gets which.

## What makes a good picture

- **A transparent background.** It works on both dark and light themes. Second best is a black
  background if you use a dark theme, or a white one for a light theme. Any other background colour
  shows as a tinted box.
- **Bold shapes and strong contrast.** The picture starts at about a third of its strength, so fine
  detail and soft photos disappear. Think of a sticker, not a photograph.
- **Square, around 400 × 400 pixels.** Other shapes work; they are fitted with their proportions
  kept. Much larger costs memory for nothing.
- **A loop that joins up.** A GIF or video plays on a loop for as long as a step lasts, which can be
  minutes. A seamless loop looks calm; a jump at the end draws the eye every few seconds.
- **No text.** It is translucent and behind the terminal's own text, so it will not be readable.
- **For the finale, about two seconds.** It is cut off after a few seconds whatever its length. It is
  shown once, at full strength, so this is where a bigger, brighter moment belongs.

### File types

| | types | at most |
|---|---|---|
| Images | GIF, APNG, WebP, PNG, AVIF, SVG | 20 MB |
| Videos | MP4, WebM | 50 MB |

Videos always play **muted** and on a loop. Keep them short and small. A few seconds and a few MB is
plenty, and every busy terminal plays its own copy.

## Setting it up

1. Put your files anywhere on the computer that runs MulmoTerminal.
2. Open `~/.mulmoterminal/config.json` and add `playfulMedia`:

   ```json
   {
     "playfulMedia": {
       "files": [
         "~/Pictures/heat/fire.gif",
         { "file": "~/Pictures/heat/rocket.mp4", "finale": "~/Pictures/heat/boom.gif" },
         "./effects/cat.webp"
       ]
     }
   }
   ```

   Each entry is either a path, or an object with `file` and, optionally, `finale`.
3. In Settings, press **Reload config file**. No restart is needed.

### How a path is read

| starts with | means | example |
|---|---|---|
| `/` | an absolute path | `/Users/me/heat/fire.gif` |
| `~/` | your home directory | `~/Pictures/heat/fire.gif` |
| `./` | the directory MulmoTerminal was started in | `./effects/cat.webp` |

Anything else is ignored, so a bare `fire.gif` is not looked up anywhere. A `./` path depends on
where you ran `npx mulmoterminal`; use `~/` when you start it from different places.

### Only your own pictures

To leave the nine built-in pictures out, add `"builtIn": false`:

```json
{ "playfulMedia": { "builtIn": false, "files": ["~/Pictures/heat/fire.gif"] } }
```

### How it fits with `playfulEffects`

`playfulEffects` still decides whether anything appears at all:

| `playfulEffects` | what appears |
|---|---|
| `"random"` (the default) | one picture per session, from the built-in ones and your files |
| one built-in name, such as `"kettle"` | that picture everywhere; your files are not used |
| `"off"` | nothing, your files included |

## Checking that it worked

- **A file was skipped:** it is named in MulmoTerminal's log (the terminal you started it from) with the
  reason. The usual reasons are a path that does not exist, a type not in the table, a file over the
  size limit, or a path that does not start with `/`, `~/` or `./`. The other files still work.
- **To see your picture without waiting:** set `"builtIn": false` and list only that file. Every
  session then uses it, and the next long build or test run will show it.

## When motion is reduced

If your system asks apps to reduce motion (macOS: System Settings → Accessibility → Display → Reduce
motion), your files are not used, because a browser cannot hold a GIF still. The built-in pictures
appear instead, standing still, and there is no finale. With `"builtIn": false` nothing appears.
