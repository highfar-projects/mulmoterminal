# feat: the data-analysis skill draws curves and histograms with ecStat transforms (#3142)

## Problem

`@mulmoclaude/chart-plugin@4.3.0` (#3140) registers `ecStat:regression` and `ecStat:histogram`,
which compute from the raw rows of a chart's `source`, so the chart follows edits. The skill still
passed a non-linear fit inline and taught a histogram only as `COUNTIFS` on the sheet.

## Approach

- Two numeric columns: a straight line stays a `TREND` column on the sheet; a curve uses
  `ecStat:regression` with the data sheet's range as the `source`.
- Histogram: `ecStat:histogram` when the bins can be chosen automatically; `COUNTIFS` when the user
  wants bins of their own or the counts on the sheet.
- Inline data only for a fit the transform does not have.
- A curve's coefficients are not on the sheet; when wanted they are a computed value.

## Verified

A data sheet `Date | Temp | Sales` (Sales an exact exponential of Temp, plus a row with a blank
Sales and a row with text Temp) was calculated with `calculatedRange` from the installed
`@gui-chat-plugin/spreadsheet`, applied to the recipes through the installed plugin's source
handling, and drawn with ECharts and the two transforms. The fit skipped the two bad rows and lay on
the exact curve; the histogram's bins matched a hand count. A text column outside `dimensions`
(the dates) did not disturb either.
