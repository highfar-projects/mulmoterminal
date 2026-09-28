# feat: translate the cell's tooltips and aria-labels (#2408, part 1 of 4)

## Problem

#2316 / #2317 moved every `title` onto `data-tip` and the shared hover tip, but the words stayed
hard-coded English. With the UI in Japanese (or zh-CN / zh-TW / ko), hovering a cell's buttons
still shows English, and the `aria-label` beside each tip reads English to a screen reader.

#2408 splits the work by surface. This is the first: the cell's header and buttons.

## Change

- `src/i18n/*.ts`: a `tips.cell` section in all five bundles.
- The tips and aria-labels in `TerminalCell`, `CellShell`, `CellChromeButtons`, `CommandCell`,
  `LauncherCell`, `Terminal`, `TerminalGrid` (resize handles), `CellTidyPrompt`,
  `WorkCommentNotice`, `IssueStartButton` (its label), `PinToggle`, `AccountMark`,
  `CollectionMark` go through `t()`. Sentences built in script (`usageTitle`, `voiceTitle`,
  `parkTitle`, the commit / push / PR states) become one message each with named placeholders —
  word order differs by language, so a sentence is never assembled from fragments.
- `CellShell`'s `moveNoun` becomes `"command" | "launcher"`, picking a full aria sentence per noun
  rather than interpolating an untranslated noun.
- `workCommentNotice.ts`: the hover is a message key per cause (`titleKey`) instead of English.

## Not translated (user data or proper nouns)

Paths (`cwd`, `dirName`, `paneCwd`), chip and header-button labels from config, the agent's name,
session titles and prompts in the roster, `git push -u origin` (a command), worktree env
`NAME=value`.

## Deliberately left for later

- **Visible text** in these components ("No other terminal to read", "Copy as prompt", the
  work-comment chip's own label) — #2408 is about tips and aria-labels.
- **`IssueStartButton`'s blocked reason**: `issueStartBlockedReason` in `common/` builds the same
  sentence the server returns as a row error (`unknownForgeReason`), and its spec pins which reason
  each plan gets. Translating it means reshaping that shared function; its label is translated.

## Verification

- A spec in the style of `attentionStatusWords.spec.ts`: every `tips.cell.*` key these components
  name resolves to a string in all five bundles, read from the component sources so a new key
  cannot be missed; and none of these files keeps a literal English `data-tip="…"` / `aria-label="…"`.
- The existing component specs select by English `aria-label` under the pinned `en` locale, so
  they keep passing only if the English wording is unchanged.
- Run the app, switch the UI to Japanese, hover the cell buttons.
