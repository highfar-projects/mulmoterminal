---
title: Spreadsheets, charts and data analysis in conversation
nav_title: Spreadsheets and charts
layout: default
parent: English
nav_order: 6.7
description: The agent puts a live spreadsheet (presentSpreadsheet) and charts (presentChart) on the Canvas beside its terminal. You change a number, the sheet recalculates, and the agent reads your change back. What it does, how to turn it on, the functions it has, and what to ask for.
---

# Spreadsheets, charts and data analysis in conversation
{: .no_toc }

An agent working in a cell can put a **spreadsheet** on the Canvas beside its terminal. The sheet has
real formulas, so when you change a number the totals, averages and percentages recalculate at once. It
can also draw a **chart** of the same data. You keep talking to the agent in the terminal, and it can
read back what you changed.

Because the agent runs in your terminal, it can get the data itself: a CSV in your project, your git
history, a log file, a command's output. It works the numbers out with the shell and puts the result in
front of you as a table and a chart.

![A shell cell showing sales.csv on the left, and the Canvas on the right with the same data as a spreadsheet: monthly totals, month-on-month change, average, median and standard deviation](../images/spreadsheet-overview.png)

1. TOC
{:toc}

## Turning it on

The spreadsheet (`presentSpreadsheet`) and the chart (`presentChart`) belong to the **Canvas** tool
group (`render`):

- **In the workspace**, a Claude, Codex or Copilot cell has every GUI tool already. Nothing to do.
- **In a project directory**, switch on **Canvas** in the launcher's MCP toggles before you start the
  session. The toggle registers the directory, so it reaches the **next** session started there, not one
  that is already running.
- **Antigravity, Grok, Muse and Cursor** get GUI tools only by registering them, in the workspace too.
  See [Which coding agent](agents.html).

You do not have to name the tools. Ask in plain words ("put this in a spreadsheet", "chart it"). See
[What to ask for](#what-to-ask-for).

## What you get

**A spreadsheet with formulas.** The agent writes each total, average or percentage as a formula, not
as a number it worked out. Change a value and everything that depends on it changes with it.

- **Several sheets** in one spreadsheet, as tabs. A formula can refer to another sheet
  (`=Sales!D7`), so an "Assumptions" or "What-if" tab can feed the main one.
- **Number formats**: thousands separators, currency, percentages, dates.
- **Excel** (top right) downloads the spreadsheet as an `.xlsx` file.

**A chart.** `presentChart` draws charts with ECharts: line, bar, area, scatter, pie, heatmap,
candlestick, sankey and more. Several charts can be shown together. **PNG** on each chart downloads it as
an image.

![The chart card: monthly coffee and pastry sales as lines, with the monthly total as bars](../images/spreadsheet-chart.png)

**A chart can follow the spreadsheet.** When the agent draws a chart from a range of the sheet, the
chart shows that range calculated, and draws itself again when the sheet is saved: change a number and
the chart moves with it. The card says which range it comes from ("From the spreadsheet: Summary!A1:C13").
A chart the agent drew from numbers it passed directly (a histogram, a fitted line) does not follow the
sheet; ask the agent to draw it again (see [Changing the numbers yourself](#changing-the-numbers-yourself)).

## Changing the numbers yourself

![The spreadsheet with cell C7 selected and changed to 260,000. Total, month-on-month change, average and standard deviation have recalculated. The edit bar at the bottom shows C7, String / Formula, the value, the format and Update](../images/spreadsheet-edit.png)

1. **Click a cell.** A bar opens at the bottom of the spreadsheet with the cell's name (`C7`).
2. Choose **String** for plain text, or **Formula** for a number or a formula. For a formula, start
   with `=`, for example `=SUM(B2:B7)`. The second box is the format, for example `#,##0` or `0.0%`.
3. Press **Update** (or Enter). The sheet recalculates, and the change is **saved** at once.
4. Close the bar with the cross.

To change a lot at once, open **Edit Spreadsheet Data** under the sheet. It shows the whole spreadsheet
as JSON. Edit it and press **Apply Changes**.

The Canvas beside a cell is narrow. When you edit, widen it with the expand button at the top of the
Canvas, so the edit bar fits.

### Letting the agent see what you changed

The agent is not told when you edit. Tell it, in the terminal:

> I changed the September pastry figure in the spreadsheet. Read it again and redraw the chart.

When the agent creates a spreadsheet, it is told where the file is saved and that you may edit it. Ask
it to read the sheet again, and it reads that file. The agent is given the file's full path, so this
works in a project directory too.

The file holds what you typed, **formulas included, not the results**. So the agent sees `=B7+C7`, not
`749,000`. To use a result, it works the formula out itself. For a long or intricate sheet, ask it to
compute the numbers with a script, rather than in its head.

## Where the files are

| What | Where |
|---|---|
| Spreadsheets | `<workspace>/artifacts/spreadsheets/YYYY/MM/<id>.json` |
| Charts | `<workspace>/artifacts/charts/YYYY/MM/<name>.chart.json` |

The workspace is `~/mulmoclaude` unless you have set `CLAUDE_CWD`. These are plain JSON files. Back them
up or keep them in git like any other file.

## Functions you can use

These are the functions the spreadsheet calculates, as of `@gui-chat-plugin/spreadsheet` 4.1.0. Any other
function shows `#NAME?` in its cell.

| Kind | Functions |
|---|---|
| Totals and statistics | `SUM` `AVERAGE` `MIN` `MAX` `COUNT` `COUNTA` `MEDIAN` `MODE` `STDEV` `STDEVP` `VAR` `VARP` `COUNTIF` `COUNTIFS` `SUMIF` `SUMIFS` `AVERAGEIF` `AVERAGEIFS` |
| Analysis | `CORREL` `SLOPE` `INTERCEPT` `RSQ` `PERCENTILE` `QUARTILE` `LARGE` `SMALL` `RANK` |
| Maths | `ROUND` `ROUNDUP` `ROUNDDOWN` `FLOOR` `CEILING` `INT` `TRUNC` `ABS` `SIGN` `POWER` `SQRT` `MOD` `PI` `EXP` `LN` `LOG` `LOG10` |
| Logic | `IF` `IFS` `AND` `OR` `NOT` `IFERROR` `IFNA` `TRUE` `FALSE` |
| Lookup | `VLOOKUP` `HLOOKUP` `XLOOKUP` `INDEX` `MATCH` |
| Text | `CONCATENATE` `CONCAT` `LEFT` `RIGHT` `MID` `LEN` `UPPER` `LOWER` `PROPER` `TRIM` `SUBSTITUTE` `REPLACE` `FIND` `SEARCH` `TEXT` `VALUE` `EXACT` |
| Dates and times | `TODAY` `NOW` `DATE` `TIME` `YEAR` `MONTH` `DAY` `HOUR` `MINUTE` `SECOND` `DATEDIF` |
| Finance | `PMT` `PV` `FV` `NPV` `IRR` `RATE` `NPER` `IPMT` `PPMT` |

`STDEV` and `VAR` are the sample versions (divide by n-1); `STDEVP` and `VARP` divide by n. `PERCENTILE`
and `QUARTILE` interpolate the way Excel's `PERCENTILE.INC` and `QUARTILE.INC` do.

**Not available**, though Excel has them: the `.INC` / `.EXC` spellings, working-day and month-end dates
(`WORKDAY`, `NETWORKDAYS`, `EDATE`, `EOMONTH`), and anything that needs more than one formula, such as a
t-test. For these, have the agent compute the result with a script and put it in as a value. See
[Statistics the sheet does not have](#statistics-the-sheet-does-not-have).

## What to ask for

Ask in plain words. Some ways of working that come from the agent having a shell beside the Canvas:

### A file in your project, as a table and a chart

> Read sales.csv, put it in a spreadsheet with monthly totals and the change from last month, and chart
> the trend.

The agent reads the file, builds the sheet with formulas, and draws the chart. The screenshots on this
page are this request. It works for any data the agent can read: CSV, JSON, a log, an export from
another tool.

### Analyse a CSV from start to finish

> /mulmoterminal-data-analysis orders.csv

The bundled `mulmoterminal-data-analysis` skill carries the whole procedure:

1. It checks the columns and the empty values, and tells you what it found.
2. It computes the summary statistics with a Node script.
3. It puts figures you may want to change in formulas, and the statistics the sheet does not have
   in as values marked as computed.
4. It picks charts that fit the data.
5. It tells you where the spreadsheet, the charts and its scripts were saved.

The scripts go in `<workspace>/artifacts/analysis/`, never in your repository. You do not have to
name the skill. Asking "analyse orders.csv" is usually enough. The statistics are formulas and the
charts follow the sheet, so editing the sheet updates both. Only when the sheet holds values a script
computed does asking the agent to read it again bring back a new spreadsheet: edit that one from then on.

### Your own repository

> Count commits per week for the last three months from git log, by top-level directory, and show it
> as a spreadsheet and a stacked bar chart.

> Run the test suite with timing, and put the twenty slowest test files in a spreadsheet with their
> share of the total.

The agent runs the commands, sums the output, and shows you the result. Nothing has to be exported by
hand first.

### Change the assumptions, then ask again

> Make a three-year plan for the café: an Assumptions tab with price, cups per day, growth and costs,
> and a Plan tab that uses them.

Change a growth rate or a price yourself and watch the plan recalculate. When you have a version you
like, ask:

> I changed the assumptions. Read the spreadsheet again, tell me what moved most, and redraw the chart.

### Statistics the sheet does not have

> Test whether weekday and weekend sales differ, with a script, and put the result in the spreadsheet.

Correlation, a linear trend, percentiles and ranks are formulas now (see
[Functions you can use](#functions-you-can-use)). For what no function gives, such as a t-test or a
non-linear fit, the agent works it out in Python or Node in the terminal, where nothing limits which
functions it can use. Values that come from a script do not recalculate when you edit the sheet;
formulas do.

### Have the numbers checked

> When the report is ready, give me a checklist to confirm the totals.

The agent posts a checklist (`requestCheck`, see [The agent drives your right pane](pane-tools.html)).
Mark each line OK or NG, and your notes come back as the agent's next task.

## Limits

- The spreadsheet's buttons and labels are in English.
- Only the functions in [Functions you can use](#functions-you-can-use). Anything else is `#NAME?`.
- The saved file holds formulas, not their results. The agent has to work the results out.
- A chart follows the spreadsheet only when the agent drew it from a range of the sheet. Ask for any other chart to be drawn again.
- The agent is not told about your edits. Tell it in the terminal.

More: [Feature reference](features.html) · [The agent drives your right pane](pane-tools.html)
