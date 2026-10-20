# feat: the data-analysis skill's charts use the chart plugin's recipes (#3121)

## Problem

`mulmoterminal-data-analysis`'s chart section named six chart shapes, and taught a histogram as bins
counted in the script and passed inline, so editing the sheet left it behind. The chart plugin
(`@mulmoclaude/chart-plugin@4.2.0`, receptron/mulmoclaude#3525) now carries a recipe for each chart
an analysis asks for, in `presentChart`'s `option` description.

## Approach

The skill points at the recipes rather than repeating them: the agent reads the recipe in the tool
it calls, and the skill keeps what the recipe cannot say, which is how to lay the sheet out so the
chart follows edits.

- The chart table grows by the cases the recipes cover: boxplot per group, two value axes, Pareto,
  waterfall, correlation matrix, log scale, time axis, many points, and marking an average line, a
  highest point or a span.
- The sheet layout for the five that need computing: histogram counts with `COUNTIFS`, boxplot
  five numbers with `MIN` / `QUARTILE` / `MEDIAN` / `MAX`, Pareto cumulative share as 0–100,
  waterfall Base / Up / Down, correlation pairs with `CORREL`.
- Inline data is left for what the sheet cannot hold (a non-linear fit). The guide's examples of a
  chart that does not follow the sheet change from a histogram to a fitted curve.

## Findings

- The sheet has no way to filter a range by group, so per-group quartiles need the data sorted by
  group (or a column per group).
- The Pareto recipe's second axis runs to 100: a cumulative share formatted as a percentage is
  stored as a fraction, which a chart reads as its number, so the share must be 0–100.
- ECharts' `boxplot` transform reads rows, not columns, so it cannot box a sheet's columns; the issue's
  first suggestion does not hold (see receptron/mulmoclaude#3516).

## Verified

Each layout was built as a workbook, calculated with `calculatedRange` from the installed
`@gui-chat-plugin/spreadsheet`, and drawn with the installed plugin's recipe through ECharts'
server-side renderer, with the numbers compared against a hand calculation.

## Out of scope

Statistical transforms (receptron/mulmoclaude#3516) and formatter options (receptron/mulmoclaude#3517):
the skill is rewritten for those when the plugin has them.
