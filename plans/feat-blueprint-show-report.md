# Show a finished build's report in the run view

Issue: #2356

## Why

A finished build said only 「すべての工程が完了しました。」. For the document blueprints (and refactor), what was
found, checked and left sits in a report under the hidden `.blueprint/` folder, which an ordinary user never opens.

## Shape

- A usecase manifest may name its report: `"report": ".blueprint/<name>.md"`. The schema accepts only a Markdown file
  directly under `.blueprint/`, because a pack can come from the market.
- `executor.reportView(runId)` reads it from the project. `GET /api/blueprints/runs/:id/report` returns
  `{ path, markdown }`, with nulls when the usecase names no report or it was not written.
- Project files (spec, reply, report) are read by `server/blueprint/projectFiles.ts`. It reads a file only when its
  real path is inside the project and every folder on the way is a real folder. It opens the file once, without
  following a link, judges it by the handle, and applies a size limit.
- The run view, once every step has passed, fetches the report and renders it with the sanitised `MarkdownProse`,
  in the framed container the spec review uses, with the file's path.
- review, verify, polish, write, style, refactor and ask (its replies page) name their reports. A spec requires
  every usecase whose checks write a `.blueprint/*-report.md` to name it.

## Verification

- Specs cover the manifest pattern, `reportView`, the route, `readProjectFile` (links, climbing paths, folders,
  size), the pack rule, and the run view (shown when finished, not asked for while running, none when absent).
- A mutation sweep over every new decision.
- The real app: a finished review run from the contract example, opened in a browser, shows its report readably.
