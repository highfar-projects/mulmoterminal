// The way back from a language you cannot read (#2204).
//
// The app's chrome can be in any of five languages, and the three things that lead to the language
// picker — the Settings sidebar entry, the picker's own label, and the `auto` option — are all
// written in whichever one is up. So somebody who lands in Korean by accident has to find `언어`
// among a sidebar of Korean entries before the picker's endonyms can help them.
//
// English is put beside them, and NOT because it is a language everyone reads. It is the one
// string this screen can spell identically whatever the UI language is, so it is an ANCHOR: you do
// not have to read it to recognise it in the same place twice.
//
// What this deliberately does NOT do is replace the endonyms in the picker itself. A speaker scans
// for what they call their own language (see `UI_LOCALES` in composables/uiLanguage.ts), and that
// is the first thing that works; this is the second one, for the reader who does not know the name
// of the language they are looking for.

/** `localized`, with `english` in brackets after it — or `localized` alone when there would be
 *  nothing to read twice.
 *
 *  Two cases produce no bracket, and they are the same case seen from two sides: the UI is already
 *  English, or this particular string is spelled the same in both. `English (English)` is the one
 *  the second guard is for, and leaving it in would make the entry a reader is looking for the
 *  noisiest one in the list. */
export const withEnglish = (localized: string, english: string, uiLocale: string): string =>
  uiLocale === "en" || localized === english ? localized : `${localized} (${english})`;
