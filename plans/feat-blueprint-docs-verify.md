# Document pack: verify — check an itinerary's dates, weekdays, order and totals by machine

Issue: #2323

## Why

An AI that plans a trip or totals an estimate makes mistakes a reader misses: Thursday written beside a date that
is a Friday, a train that leaves before the previous one arrives, a total that is not the sum of its lines. These
are decidable without judgement. The point of this pack is that **the AI's mistake is caught by a machine**. The AI
does the reading (turn prose into a table), and the machine does the deciding. The AI's own reading is checked
too: every value it extracts must be written in the passage it quotes.

## Shape

A usecase on the `docs` base, like `review` and `ask`: `blueprints/verify/` with `manifest.json`,
`hearing.json`, `steps.json`, `skills/`, `checks/`.

Hearing:

- `documents`: the files to check (one per line, in the folder).
- `kind`: 旅程表・行程表 / 見積書・請求書 / 報告書・その他. This decides which tables the extraction fills first.
- `year`: the year for dates written without one (optional; without it, a date with no year and a weekday
  cannot be checked and is reported as such).
- `focus`: anything the person is worried about (optional).

Steps:

1. **extract**: the AI writes `.blueprint/facts.json`:
   ```json
   {
     "events":  [{ "id", "date": "YYYY-MM-DD", "weekday"?, "start"?: "HH:MM", "end"?: "HH:MM", "title", "citation": { "source", "address", "quote" } }],
     "amounts": [{ "id", "label", "value": 12000, "unit": "円", "citation": { … } }],
     "totals":  [{ "id", "label", "value", "unit", "parts": ["amount id", …], "citation": { … } }]
   }
   ```
   The check reads it, and fails on:
   - a malformed entry or a repeated id;
   - a quotation `chaff cite` does not find;
   - **a value that is not in its own quotation**: the month and day, the weekday as written, each time, and each
     amount's digits (after removing thousands separators and converting full-width digits);
   - a total whose parts name an id that is not an amount.

   On a pass, the check records a fingerprint of `facts.json`.
2. **report** (after a `review` gate: a person reads the extracted table first, which is where a missed event
   is caught, since the machine only checks what was extracted): the check refuses `facts.json` if it changed
   since the extract check passed. It then computes the problems itself, with no AI. It writes them to
   `.blueprint/verification.json` and fails until `.blueprint/report.md` names every problem id. The AI explains
   each problem in the document's words and suggests a fix, but it cannot add or drop a problem.

Machine rules (pure functions in `blueprints/verify/checks/rules.mjs`):

- `weekday-mismatch`: the written weekday is not the weekday of the date (ja 月〜日, en Mon–Sun, full or short).
- `out-of-order`: in document order, an event's date and start are earlier than the previous event's.
- `overlap`: on one date, an event starts before the previous one ends.
- `end-before-start`: an event that ends before it starts on the same day.
- `total-mismatch`: a total is not the sum of its parts.
- `unit-mismatch`: a total's parts are in different units, or in a different unit from the total.

## Not in this change

**What a number means is not checked by machine.** The extract check proves each value is *written* in its
quotation, not that it plays the role it was given. A `10/1` in the quote may be a booking deadline rather than
the event's date, and a quote may hold both 小計 and 合計. That is a reading decision, and it is why the report
step sits behind a `review` gate: a person reads the extracted table first.

Which lines a total covers is the same kind of decision: a deposit or an optional extra may rightly be left out
of `parts`, so the machine sums what `parts` names and does not ask why a line is not in it.

A number alone in parentheses, 「(1,200)」, is read as both +1200 and −1200: it may be an accounting negative
or a plain aside, and the quotation cannot say which. A wrong sign there passes the quote check, but still
shows in the total.


Travel time between places, time zones, dates across midnight (an `end` earlier than `start` is read as an error,
not as the next day), and currency conversion. Moving these rules into chaff itself (isamu/lab#142) comes later.
The pack is where they are proved first.

## Verification

- `rules.mjs` is pure and covered both ways: each rule catches its error, and look-alikes do not fire (no weekday,
  a weekday in another language, an event without times, a total with one part).
- The extract check is covered with the pack harness (stand-in chaff): a value missing from its quote, a bad
  citation, and an unknown part id each fail with a message that names the entry.
- A real run through the executor on a sample itinerary with planted errors (a wrong weekday, a reversed pair
  of legs, a wrong total). All three come back as problems, and the report names each.
