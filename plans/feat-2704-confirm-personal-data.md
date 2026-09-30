# Confirm once before a build copies personal data (#2704)

Decided 2026-09-30 (part of #2480, `plans/feat-blueprint-from-collection.md` "決めていないこと"): a build that would copy
personal data out of its source asks once first.

## What counts

- With the records: every `email` field, and every `string` / `text` field whose key or label names a person's name,
  mail, phone, address, birth date or postal code (`common/blueprint/personalData.ts`). Keys are split into words
  (`homePhone`, `phone_number`, `home-address`), so a word that only contains one (`nameless`, `hotel`) is not counted.
  Japanese labels are matched by phrase. The list leans wide: a false alarm costs one confirmation.
- Always, for a shared app: the email addresses its `app.json` roster is keyed by, since the declaration is copied
  whether or not the records are.

## Flow

1. The copy is taken (`collectionSnapshot.ts`) and reports `personal: { fields, members }`.
2. `POST /api/blueprints/runs` refuses with 409 `personal-data` (the fields and the member count) unless the request
   carries `personalDataConfirmed: true`. Nothing is placed and no run is made.
3. The form words the refusal with the list and shows "確かめたので、写して始める", which sends the same answers again
   with the confirmation. Changing an answer or the pair withdraws the offer.

## Not done

- Choosing fields to leave out, and masking values (considered, not chosen).
