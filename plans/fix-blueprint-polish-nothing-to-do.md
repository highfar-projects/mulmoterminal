# fix: polish can end when there is nothing to polish (#2651)

A polish build whose named documents have no chaff finding had no clean way to end. The survey's check refused an
empty list, and the polish step repeats with a check that asks for one more finished file each round, which an
empty list can never give. On the real run (a report measured as `business/report`, zero findings) the agent asked
the person how to go on twice and finally listed the file as "skipped" to get through.

## Change

- The survey may write `{ "targets": [] }` — but only when it is true. The check builds the list of named
  documents itself (`checks/named.mjs`: every `.md` / `.markdown` / `.txt` at or under each line of the answer
  `targets`, leaving out `.blueprint`, `.git` and `node_modules`) and measures each again with the build's genre.
  An empty list is refused while any of them, other than a file listed in `avoided`, has a warning or an error.
- `avoided` (optional, also on a non-empty list) names the files left alone because the answer `avoid` asked; the
  check refuses one that is not among the named documents.
- With an empty list, `progress` passes with nothing to do, `verify` passes, and `more` says there is no more.
  The gate shows 「整える文書はありません」 instead of an empty page.
- The survey, polish and report skills say what to do with nothing to polish, and that it is an answer rather
  than a question for the person.

The executor still starts one polish round (a repeating step always runs once) and still stops at the review
gate; the round sees an empty list and stops. Skipping the step altogether would be an executor change, left out.
