# feat: a bundled skill to edit a video by talking about it (#3159)

## Goal

The pane plays video (#2674). Let the user edit one in conversation — cut, join, speed, sound,
vertical, subtitles from speech, telops — without writing a command. First step: a bundled skill
only, as `mulmoterminal-data-analysis` was (#3091). No app code changes.

## Approach

- `server/skills/mulmoterminal-video-edit/SKILL.md`, listed in `BUNDLED_SKILL_NAMES`. It is not
  a settings skill, so it joins `notSettings` in the router spec.
- ffmpeg / ffprobe for every edit. The original is never changed: a new file beside it, or in the
  working directory when the original is outside it, so `showInPane` can open it.
- Encoding flags are a shell ARRAY (`ENC=(…)`, `"${ENC[@]}"`): a string reaches ffmpeg as one
  argument under zsh, which is the shell a cell runs.
- Subtitles from speech: `whisper-cli` from `whisper-cpp` (the package voice input's
  `whisper-server` comes from), with the model voice input already keeps in
  `<workspace>/models`. The agent asks before installing or downloading. The agent corrects the
  transcript and saves `.srt` beside the video for the user to edit.
- Burn-in through libass (`subtitles`, `ass`), with a font `fc-list :lang=ja` lists. Soft
  subtitles (`mov_text`) are offered with the warning that the pane does not show them.
- Telops as an ASS file sized to the video (`PlayResX/Y`). Saved beside the video.

## Verified

Every command in the skill was run on generated clips: cut, both kinds of join (including a
silent clip, which needs silence of its own length), speed, loudness, music replaced and mixed,
vertical crop, still frame, burned subtitles, soft subtitles, the sample telop file, and
subtitles plus telops together. Japanese renders with Hiragino Sans. `whisper-cli`'s flags and
output name were checked against its source; it was not run here.

## Out of scope

- A view that shows the video beside its subtitle list, synced, for editing.
- An edit-decision file and a timeline view.
- Transcription on Windows / Linux beyond "works if `whisper-cli` is installed".
