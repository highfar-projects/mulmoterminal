# fix: an English document's headings are named in Japanese corner brackets (#2631)

An ask build over English documents wrote `Where it is written: notifications.md, 「If nothing arrives」`
into `FAQ.md`, while its own `replies.md` used `"If nothing arrives"`.

- `blueprints/docs/checks/places.mjs` named every Markdown section `「heading」`. The name is shown in the
  verify and review views too, so English reports had the same brackets. A heading is now quoted the way
  its language quotes: 「」 when it holds kana or kanji, `"…"` otherwise.
- The keep SKILL (ask) and the report SKILLs (verify, review) said 「」 without the English case the
  answer SKILL already had; they now say `"…"` for an English FAQ or report.

The checks already accept either mark (`namesPlace` looks for 「」, `""` and `“”`), so nothing that
passed before fails now.
