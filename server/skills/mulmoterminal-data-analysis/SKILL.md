---
name: mulmoterminal-data-analysis
description: Analyse a CSV or TSV the user names and show the result in MulmoTerminal's Canvas, as a spreadsheet with live formulas (presentSpreadsheet) and charts (presentChart). Reads the file, checks its columns, computes summary statistics with Node, puts what the user may want to change in formulas and the rest in values, picks charts that fit the data, and says where everything was saved. Use when the user asks to analyse, summarise, explore or chart tabular data, or to read a spreadsheet again after editing it. The user writes no code. Works in whatever language the user writes in.
---

# Analyse a table of data

The user hands you rows and columns and wants to understand them. They do not write code and do
not reshape the data themselves; you do, with Node in the terminal, and show the result on the
Canvas. Talk to them in their language, and in words about their data, not about this procedure.

## What you need

- `presentSpreadsheet` and `presentChart`. In a project directory they exist only when **Canvas**
  was switched on before the session started. If you do not have them, say so and stop: tell the
  user to switch on Canvas in the launcher's MCP toggles and start a new session there.
- Node. Scripts are Node only — not Python, not a shell pipeline doing arithmetic.

## 1. Read the file

Do not read a large file into the conversation. Look at its size first, then read only the head
(`head -n 20`). Let a script read the whole file.

Write the scripts in a working directory of their own, never in the user's repository:

```sh
work=$(mktemp -d) && cd "$work" && npm init -y >/dev/null && npm install csv-parse simple-statistics
```

Parse with `csv-parse` rather than splitting on commas, because quoted fields hold commas and line
breaks:

```js
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
const rows = parse(readFileSync(process.argv[2]), { columns: true, skip_empty_lines: true, bom: true });
```

`delimiter: "\t"` reads a TSV. Every value comes back as a string; convert the numeric columns
yourself (strip thousands separators first: `"1,200"` is not a number to `Number`), and count the
ones that do not convert rather than dropping them silently.

Before analysing anything, tell the user what you found:

- the number of rows;
- each column, and whether it holds numbers, dates or categories;
- how many values are empty or unreadable in each column.

If a column's meaning is unclear (`amt`, `v2`), ask once, rather than guessing.

## 2. Summary statistics

Compute them with `simple-statistics` in the script, so the numbers come from code and not from
reading:

| What | Function |
|---|---|
| mean, median, mode | `mean`, `median`, `mode` |
| spread (sample, n-1) | `sampleStandardDeviation`, `sampleVariance` |
| quartiles, interquartile range | `quantile(values, [0.25, 0.5, 0.75])`, `interquartileRange` |
| min, max, sum | `min`, `max`, `sum` |
| two numeric columns | `sampleCorrelation`, `linearRegression`, `linearRegressionLine`, `rSquared` |
| comparing two groups | `tTestTwoSample` |

For a category column, count the rows in each category. For a date column, give its range and look
for gaps.

Point out what looks wrong before what looks interesting: duplicate rows, values far outside the
quartiles, a total that does not add up.

## 3. The spreadsheet

Put the result in `presentSpreadsheet`. Split each number by whether the user may want to change it:

- **Formulas** for whatever the user may change or check: totals, ratios, growth, and the
  assumptions a what-if depends on. A formula recalculates when the user edits a cell.
- **Values** for what the sheet cannot compute. The sheet has no `CORREL`, `SLOPE`, `PERCENTILE`,
  `QUARTILE`, `SUMIFS`, `COUNTIFS` or `RANK`, and any function it lacks shows `#NAME?`. Compute
  these in the script and put the result in as a number. Label them as computed (for example
  "Correlation (computed)"), because a value does not change when the user edits the data.

Use one sheet for the data and another for the summary, so a summary formula reads the data sheet
(`=AVERAGE(Data!C2:C201)`). If the data is too large to show, summarise it in the script first:
show it by month, by category, or the top rows. Say that you did.

## 4. Charts

Use `presentChart`, and choose the chart from the shape of the data:

| Data | Chart |
|---|---|
| a value over time | line; bars if there are only a few periods |
| comparing categories | bar, sorted, unless the categories have an order of their own |
| parts of a whole (few parts) | stacked bar; pie only for a handful of parts |
| two numeric columns | scatter, with the regression line when you computed one |
| the distribution of one column | histogram (bars over bins computed in the script) |
| two categories crossed | heatmap |

Give each chart a title saying what it shows. Give each axis a name, with its unit.

A chart is drawn from the numbers you pass it. **It is not linked to the spreadsheet.**

## 5. Say where everything is

`presentSpreadsheet` and `presentChart` each reply with the absolute path of the file they saved,
under `<workspace>/artifacts/`. Copy your scripts next to them, so the analysis can be run again:

```sh
dest="<workspace>/artifacts/analysis/YYYY/MM/<spreadsheet id>"
mkdir -p "$dest" && cp "$work"/*.mjs "$work"/package.json "$dest"/
```

End by telling the user:

- the spreadsheet's path and the chart's path;
- where the scripts are;
- which figures are formulas and which are computed values.

## When the user edits the spreadsheet

You are not told that the user edited it; they will tell you. Read the spreadsheet file again. It
holds what was typed, **formulas included and their results not**, so you see `=B7+C7`, not a
number. Work out the results in a script. Then:

- recompute the computed values that depended on the edited cells;
- draw the charts again;
- say what changed most.

## Do not

- Do not compute statistics in your head and present them as exact.
- Do not round in the script; let the cell format round for display (`0.00`, `#,##0`, `0.0%`).
- Do not install anything outside the working directory, and do not add a dependency to the user's
  project.
- Do not drop rows quietly. Every row you leave out is counted and reported.
