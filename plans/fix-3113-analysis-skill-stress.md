# fix: what the data-analysis stress test found (#3113)

Fifteen Japanese analysis requests were run through `claude -p` against an isolated server, with
the bundled `mulmoterminal-data-analysis` skill. Every task reached correct figures; the problems
were in the workbooks handed over and in when the skill was used at all.

## Found, and where each is fixed

| Found | Fixed in |
|---|---|
| Two sheets that read each other (Data ↔ Settings) recalculated each other whole; workbook functions ran out of time and cells came back `#NUM!` | plugin #134 (4.2.1) |
| A workbook whose functions ran out of time aborted the shared QuickJS module, so later reads threw | plugin #131 (4.2.1) |
| Agents handed over workbooks with error cells, unaware — the saved file holds formulas, not results | plugin #131 (4.2.1): `presentSpreadsheet` names erroring cells; skill: fix them before saying it is ready |
| `VLOOKUP` / `HLOOKUP` / `INDEX` over `$` ranges gave errors | plugin #133 (4.2.1) |
| Questions ("is B better than A", "what comes next month") did not trigger the skill | skill description |
| An `.xlsx` task was handled, but the skill named only CSV / TSV | skill: Excel via `exceljs` |
| A collection written to the wrong place was never picked up, and the agent did not notice | skill: check with `getSchema`, then fall back |

## Change here

- `@gui-chat-plugin/spreadsheet` `^4.2.0` → `^4.2.2` (4.2.1: the fixes above and eight more
  calculation fixes; 4.2.2: parentheses and text in arithmetic).
- `server/skills/mulmoterminal-data-analysis/SKILL.md` as in the table.

## Verified by

Re-running the tasks that failed (T07, T08, T10, T11, T12) against this branch, graded by
recalculating every workbook they produced and counting error cells (`scratchpad` harness, not
committed).

- The last workbook each task handed over calculates without an error cell. Earlier versions in the
  same run had errors; the agent read them from the `presentSpreadsheet` reply and fixed them.
- T08 and T11 (questions) used the skill and produced a spreadsheet and charts — but only with the
  machine's other plugins switched off. With their thousands of skills listed beside it, the skill
  was not chosen under either wording of its description; that is this machine, not a user's.
- Two engine gaps the agents worked around, filed against the plugin: `ROW()` / `COLUMN()` give
  `#NAME?`, and an unquoted non-ASCII sheet name (`=基準!B1`) is not read as a reference.
