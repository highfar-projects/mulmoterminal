# fix: keep keymap entries this version does not recognise (#2650)

## Problem
`loadAppConfigResult` sanitizes `keymap`, dropping any entry whose action this build does not know.
The next write serializes the sanitized keymap, so a newer version's binding (or a typo the startup
warning is pointing at) is deleted by any config write — the keys skill's `POST /api/config`, or
Settings' Recommended keys. `unknownConfigKeys` already carries unknown TOP-level keys for this reason
(#966); keymap entries one level down had no such carry.

## Approach
- `unrecognisedKeymapEntries(input)` in `common/keymap.ts` (pure): the entries named neither a known
  action nor `send`.
- `unknownConfigKeys` adds them under `keymap` in what a writer carries from its load to its save.
- `serializableAppConfig` writes this build's keymap, then the carried entries it does not itself hold.
  Every writer already passes `unknownKeysOf(loaded)`, so none of them changes.

## Deliberately not covered
- Malformed bindings for KNOWN actions, and malformed `send` entries, are still dropped: they are this
  build's to judge, and a malformed known binding already stops the server at startup.
- A carried entry cannot be removed through the API — the same as a top-level unknown key. To remove
  a typo, edit the file (the startup warning names it). The keys skill says so.

## Verification
- Specs: the pure function (normal and malformed input, `__proto__`), carry through a keymap rewrite,
  through saves that do not touch the keymap, and the preset route keeping a future action's entry.
- Differential: the pre-change `serializableAppConfig` copied beside the new one over generated
  configs — identical output whenever there is nothing to carry.
