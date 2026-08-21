# Guide videos

The launch demo, embedded at the top of both language indexes (`../en/index.md`, `../ja/index.md`)
and — the English one — in the repository README under `## Demo`.

Captured from the same **throwaway demo instance** the screenshots use — a scratch `HOME` and
neutral demo projects (`acme-web`, `acme-api`, `acme-docs` under `mt-demo`), so no personal session
data appears. Read every frame before committing a new one; the rules and the traps are
in [`../images/README.md`](../images/README.md).

| File | Length | Size | Shows |
|---|---|---|---|
| `launch-demo-en.mp4` | 1:32 | 3.3 MB | One agent, then a grid of them — **working / done / needs you** in colour, the cockpit roster holding what each session asked and answered, and picking whichever cell is lit. English narration |
| `launch-demo-ja.mp4` | 1:34 | 3.4 MB | The same footage, Japanese narration. The screen is the English one — only the voice differs |

Both are 1280x720, h264 + aac.

**The same two cuts are also GitHub user-attachments**, which is what the repository README
embeds (`0b8dd582-…` for English, `055daa6b-…` for Japanese — the URLs are in
[#1827](https://github.com/receptron/mulmoterminal/issues/1827)). GitHub renders such a URL as an
inline player from a bare line of Markdown; a `<video>` tag pointed at a file in this directory is
what works on the Pages site. Re-cut the video and **both** copies need replacing.

The copies here are **not byte-identical to the attachments**: they were remuxed with
`ffmpeg -c copy -movflags +faststart`, which moves `moov` to the front so a browser can draw the
first frame without first range-requesting the tail of the file. Same streams, same frames, same
byte count — only the atom order differs. Do that to any replacement too:

```bash
ffmpeg -i <cut>.mp4 -c copy -movflags +faststart docs/guide/videos/launch-demo-<lang>.mp4
```
