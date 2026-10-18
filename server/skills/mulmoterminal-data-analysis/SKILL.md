---
name: mulmoterminal-data-analysis
description: Analyse a CSV or TSV the user names and show the result in MulmoTerminal's Canvas, as a spreadsheet with live formulas (presentSpreadsheet) and charts (presentChart). Reads the file, checks its columns, computes summary statistics with Node, puts what the user may want to change in formulas and the rest in values, picks charts that fit the data, and says where everything was saved. Use when the user asks to analyse, summarise, explore or chart tabular data, to read a spreadsheet again after editing it, or to keep an analysis as a skill of their own to run on the next file of the same kind. The user writes no code. Works in whatever language the user writes in.
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

`quantile` interpolates the way Excel's `QUARTILE.INC` and `PERCENTILE.INC` do. Say so when you
show quartiles, because other tools (Python's `statistics.quantiles` by default) give slightly
different numbers.

For a category column, count the rows in each category. For a date column, give its range and look
for gaps.

Point out what looks wrong before what looks interesting: duplicate rows, values far outside the
quartiles, a total that does not add up.

## 3. The spreadsheet

Put the result in `presentSpreadsheet`. Split each number by whether the user may want to change it:

- **Formulas** for everything the sheet can compute: totals, ratios, growth, the assumptions a
  what-if depends on, and the statistics. A formula recalculates when the user edits a cell. The
  sheet has `AVERAGE`, `MEDIAN`, `STDEV` / `STDEVP`, `VAR` / `VARP`, `CORREL`, `SLOPE`,
  `INTERCEPT`, `RSQ`, `PERCENTILE`, `QUARTILE`, `LARGE`, `SMALL`, `RANK`, `COUNTIF(S)`,
  `SUMIF(S)` and `AVERAGEIF(S)`; `PERCENTILE` and `QUARTILE` interpolate like the script's
  `quantile`. Check a formula against the script's number before you present it.
- **Values** only for what no function gives (a t-test, a non-linear fit, anything that needs a
  loop). A function the sheet lacks shows `#NAME?`. Compute these in the script and put the
  result in as a number. Label them as computed (for example "t-test p (computed)"), because a
  value does not change when the user edits the data.

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
| the distribution of one column | histogram (bins counted in the script, passed inline) |
| two categories crossed | heatmap |

Give each chart a title saying what it shows. Give each axis a name, with its unit.

**Draw a chart of sheet data from the sheet**, so it follows the user's edits. Give the chart a
`source` and leave the data out of `option`:

```json
{ "title": "Sales by month", "source": { "spreadsheet": "<the path presentSpreadsheet reported>", "range": "Summary!A1:C13" },
  "option": { "xAxis": { "type": "category", "name": "Month" }, "yAxis": { "name": "Sales (JPY)" },
              "series": [{ "type": "bar" }, { "type": "bar" }] } }
```

The range's first row is the header (it names the series) and its first column the categories,
so lay the summary sheet out that way: one row per category, one column per series. The chart is
drawn from the calculated range, and drawn again whenever the sheet is saved. If `presentChart`
says it cannot read the range, fix the range rather than falling back.

Pass data inline in `option` only for what is not in the sheet: histogram bins, the points of a
fitted line. Such a chart does **not** follow the sheet; say which charts do and which do not.

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
- which figures are formulas and which are computed values;
- which charts follow the sheet and which do not.

## 6. Offer to keep the analysis as a skill

When the user is happy with the result, ask once whether to keep this analysis as a skill of their
own, so the next file of the same kind (next month's export, another store) gets the same
spreadsheet and charts from one request. If they say yes:

**Ask where it should live**, and say what each means:

- for every terminal: the agent's user skills directory — for Claude Code `~/.claude/skills/`, or
  `$CLAUDE_CONFIG_DIR/skills/` when that is set;
- for this project only: `.claude/skills/` in the working directory.

**Name it** after the data and the question, in lowercase words joined by hyphens
(`cafe-sales-weekday-temperature`). Never start the name with `mulmoterminal-`: those names belong
to the skills MulmoTerminal ships, and an update would overwrite a skill of that name. If the
directory already exists, ask before replacing it.

**Make the scripts reusable before copying them** into `<skill>/scripts/` with `package.json`:

- the CSV path is an argument, never written into a script;
- every range, row count and sheet size comes from the data (`Data!A1:G${rows.length + 1}`), never
  from the file you analysed;
- the spreadsheet path the charts point at is an argument (it changes on every run);
- titles name the data kind, not this file's dates.

**Write `<skill>/SKILL.md`**, in the user's language:

- `name` and a `description` that says what data it is for, naming the columns it needs, so the
  agent picks it for a file of that shape and not for any CSV;
- the columns it expects, exactly as the header spells them. If a file lacks one, the skill stops
  and says which, rather than guessing;
- the steps to run it: copy `scripts/` into a fresh `mktemp -d`, `npm install`, run the scripts on
  the file the user names, present the spreadsheet, then the charts from the reported spreadsheet
  path;
- what to tell the user afterwards: the same findings as this analysis, which figures are formulas
  and which computed, which charts follow the sheet, and where everything was saved;
- the date it was made and the file it was made from.

Do not put a file named `schema.json` in the skill directory: MulmoTerminal reads a skill directory
holding one as a collection.

**Run it once before you hand it over**: follow the new SKILL.md yourself, from a fresh temporary
directory, on the file you just analysed, and check the spreadsheet comes out the same. Fix the
skill until it does. Then tell the user its name, where it is, and how to use it ("analyse
next-month.csv with cafe-sales-weekday-temperature", or `/cafe-sales-weekday-temperature
next-month.csv`). A new skill is picked up by sessions started after it was written.

## When the user edits the spreadsheet

Formulas recalculate in the sheet, and charts drawn from it (`source`) redraw on their own. You
are not told that the user edited it; they will tell you. Read the spreadsheet file again. It
holds what was typed, **formulas included and their results not**, so you see `=B7+C7`, not a
number. Work out the results in a script, and say what changed most.

If the sheet holds no computed values, and every chart follows it, that is all: do not present it
again. Otherwise the computed values and the inline charts are now stale. Then:

- recompute the computed values that depended on the edited cells;
- call `presentSpreadsheet` again with the whole spreadsheet: the user's edits, the formulas, and
  the new computed values;
- draw the charts again, with their `source` pointing at the **new** spreadsheet;
- copy the scripts as in step 5, into the folder named after the **new** spreadsheet id;
- say what changed most, and give the new spreadsheet's, chart's and scripts' paths.

**Never write the spreadsheet file yourself.** The open Canvas does not read it again, so it keeps
showing the old values, and the user's next edit there saves the whole old sheet back over yours.

The new `presentSpreadsheet` is a new file. The old spreadsheet, its chart and its scripts stay as
they were, and nothing links them to the new ones. So tell the user to edit the new spreadsheet
from now on, and that edits to the old one are not part of this analysis. The next time they ask
you to read it again, read the newest spreadsheet you presented; if they name the old one, ask
which they mean.

## Do not

- Do not compute statistics in your head and present them as exact.
- Do not round in the script; let the cell format round for display (`0.00`, `#,##0`, `0.0%`).
- Do not install anything outside the working directory, and do not add a dependency to the user's
  project.
- Do not drop rows quietly. Every row you leave out is counted and reported.
