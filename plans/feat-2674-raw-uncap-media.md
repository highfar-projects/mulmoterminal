# feat: stop capping PDF, audio and video on `/api/files/raw` (#2674, part 3)

## Why

`rawServingPlan` answered 413 past 500 MiB for audio/video and past 25 MiB for a PDF. The route
streams every response (`streamFileToResponse`, Range for media), so the size never reaches server
memory, and the caps arrived with #50 with no stated reason. A screen recording passes 500 MiB
routinely, and a scanned PDF passes 25 MiB — both then open nowhere.

## Change

- `server/backends/rawServingPlan.ts`: PDF, `audio/*` and `video/*` are uncapped. Everything else
  keeps the 25 MiB cap — those are what a tab renders whole (an image, a text file).
- The spec pins both sides: the capped kinds still 413 past 25 MiB, the uncapped ones never do.

## Left out

- Showing these kinds in the Files pane (parts 1, 2 and 4 of #2674) — a separate PR.
- A phone reaching the server over LAN can now pull a large file whole. Accepted: it is the user's
  own file on the user's own server, and the browser asks for ranges when it plays media.
