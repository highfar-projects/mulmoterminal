# A verify example for an estimate (#2760)

verify's only example was an itinerary; the kind 「見積書・請求書」 had none. This adds a self-written estimate.

- `presets/mitsumori/mitsumori.md`: three lines whose amounts are right and add up to the subtotal (810,000円), tax
  81,000円, and a grand total of 901,000円 where the parts make 891,000円. Of three dated lines, the delivery date
  says 木 for a Friday (2026-11-20); the other two weekdays are right.
- Answers: 「見積書・請求書」, no year (every date has one), focus 「合計の金額」.

A real build from the example finished: both planted mistakes were reported, nothing else was, and the report named
what it could not check (unit price × quantity, the tax rate).
