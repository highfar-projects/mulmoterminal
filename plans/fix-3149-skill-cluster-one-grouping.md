# fix: the data-analysis skill groups rows once (#3149)

## Problem

A real agent run clustered stores twice: its script ran its own k-means for a "group (computed)"
column on the sheet, and the chart grouped them again with `mulmo:clustering`. Different algorithms
and numbering, never reconciled. The skill invited it ("each row's cluster as numbers, compute them
in the script").

## Approach

One grouping per analysis. To show the groups: the transform, and no group column on the sheet.
For each row's group as data: the script computes it into a computed column, and the scatter is
coloured by that column (`visualMap` `dimension`) with no transform, so the sheet and the chart
agree. The column joins the computed values redone after an edit.

## Verified

A sheet with a computed group column, drawn from its range with a piecewise `visualMap` on that
column, passed the plugin's server trial draw, and ECharts gave each point its group's colour.
