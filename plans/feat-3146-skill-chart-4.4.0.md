# feat: the data-analysis skill uses chart-plugin 4.4.0 (#3146)

## Problem

`@mulmoclaude/chart-plugin@4.4.0` (#3145) adds clustering and column boxplot transforms, cross-table
and long-table sources, bundled maps, format objects, several charts side by side, and refuses a
chart it cannot draw. The skill knew none of it.

## Approach

- Chart table: clusters for "which rows are alike", a map for a value per region, a box per column.
- Layout bullets: a box per column straight from the data when each group is a column (sheet
  quartiles stay for groups held in one column); a correlation matrix as a `CORREL` cross table
  with `layout: "matrix"` instead of `n²` rows; clusters on standardised columns when the scales
  differ, since k-means measures in the columns' own units; map names as the map has them.
- Long data drawn with `groupBy`, several ranges with `sources`.
- Format objects next to template strings; `columns` and `height`; a refused chart is fixed and
  presented again.
- The "keep it as a skill" list covers every transform.

## Not used

`groupBy` cannot feed `mulmo:boxplotColumns` for groups held in one column: the long table becomes
a wide one with a blank in every other group's cell, and the transform skips rows with a blank.

## Verified

Against the installed spreadsheet engine and plugin: a workbook with customers (`STANDARDIZE`
columns), a long table, a `CORREL` cross table, prefectures and stores was calculated with
`calculatedRange` and passed through the plugin's server `execute`, whose trial draw accepted the
clustering on standardised columns, the `groupBy` lines, the matrix heatmap, the `japan-ja` map, the
column boxplot and a currency format, and refused a clustering on a missing column with its name.
The plugin's source shaping turned the long table into one column per region (the two rows meeting
in one cell added up) and the cross table into `X | Y | Value` rows.
