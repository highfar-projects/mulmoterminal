# feat: a filter box on the resume list (#3230)

The resume list (`data-testid="cell-resume"` in `CellLaunchForm.vue`) holds up to the server's
past-session limit, and finding one conversation in it means scanning every title.

## Decisions (the open questions of the issue)

- **When the box shows**: from `RESUME_FILTER_MIN_ROWS` rows. Below that the whole list is in view
  and a box is in the way.
- **What it matches**: the title only, because the row shows only the title; matching text the
  person cannot see would return rows for no visible reason. Every space-separated word must be in
  the title, in any order, case-insensitive, as plain text (no pattern syntax).
- **Nothing matches**: a one-line message in place of the rows, so an empty list is not mistaken for
  a failed load.
- **Lifetime**: the query is blank again when the directory or the agent changes (it belongs to the
  list on show), and kept when the same list reloads, as after stopping a session. A list that
  shrinks under the minimum is shown whole, since its box is gone.

## Change

Pure `filterResumable` in `src/components/resumeFilter.ts`, used by `CellLaunchForm.vue`. Three
strings in the five locale bundles. The list is filtered on the client; the fetch is unchanged.

## Left out

Matching the last prompt (not shown on the row); keyboard navigation from the box into the rows.
