// Detect file-path tokens in a line of terminal text so they can be linkified. Pure —
// no filesystem, no DOM. Returns half-open [start, end) UTF-16 string-index ranges.
//
// A token is a maximal run of path characters (everything except whitespace, quotes,
// ASCII + full-width brackets, `:`, and separating punctuation incl. `、。`) that:
//   - is not part of a URL (no leading `//`, not preceded by `:`; URLs are the
//     WebLinksAddon's job),
//   - contains at least one separator — `/`, or `\` for a Windows path, and
//   - ends in a file extension holding at least one letter — so `hero.gif` / `a.tar.gz`
//     match but a fraction like `1/2.5` does not.
// A trailing `.` (a sentence period clinging to the token) is trimmed off the end.
//
// A Windows drive letter is the one `:` a path may carry: `C:\x\a.md` splits at the colon
// into `C` and `\x\a.md`, so the second half is reclaimed together with its `C:` when that
// letter stands alone (nothing path-like before it) and the rest starts at the root.

export interface FilePathLink {
  start: number; // inclusive UTF-16 index
  end: number; // exclusive UTF-16 index
  text: string;
}

const PATH_TOKEN = /[^\s"'`()[\]{}<>（）「」【】:,;、。]+/g;
// A trailing file extension: a dot then 1-10 alnum at end-of-string.
const TRAILING_EXTENSION = /\.([A-Za-z0-9]{1,10})$/;
const HAS_LETTER = /[A-Za-z]/;
const SEPARATOR = /[/\\]/;
const DRIVE_LETTER = /^[A-Za-z]$/;
const TOKEN_BREAK = /[\s"'`()[\]{}<>（）「」【】:,;、。]/;

// True when the `X:` just before `start` is a drive letter standing on its own, so the token
// at `start` is the rest of a `X:\...` / `X:/...` path rather than a `file:line` or a scheme.
function followsDriveLetter(line: string, start: number, text: string): boolean {
  if (start < 2 || line[start - 1] !== ":" || !DRIVE_LETTER.test(line[start - 2] ?? "")) return false;
  if (start > 2 && !TOKEN_BREAK.test(line[start - 3] ?? "")) return false;
  return (text.startsWith("\\") || text.startsWith("/")) && !text.startsWith("//");
}

// Where the path holding the token at `start` begins — two earlier for a drive letter — or
// null when the token is part of a URL or a `file:line` rather than a path.
function pathStart(line: string, start: number, text: string): number | null {
  if (followsDriveLetter(line, start, text)) return start - 2;
  if (text.startsWith("//")) return null; // protocol-relative URL, not a path
  if (start > 0 && line[start - 1] === ":") return null; // scheme (`http:`) or `file:line`
  return start;
}

// True when `text` ends in a file extension holding at least one letter — so `hero.gif`
// / `a.tar.gz` qualify but a fraction like `1/2.5` does not.
function endsInFileExtension(text: string): boolean {
  const ext = TRAILING_EXTENSION.exec(text);
  return ext?.[1] !== undefined && HAS_LETTER.test(ext[1]);
}

export function findFilePathLinks(line: string): FilePathLink[] {
  const links: FilePathLink[] = [];
  for (const match of line.matchAll(PATH_TOKEN)) {
    // No `undefined` guard: matchAll requires a global regex and the spec sets `index` on every
    // match it yields, which is why the type is `number` rather than `number | undefined`.
    let text = match[0];
    let end = match.index + text.length;
    while (text.endsWith(".")) {
      text = text.slice(0, -1);
      end -= 1;
    }
    const start = pathStart(line, match.index, text);
    if (start === null) continue;
    text = line.slice(start, end);
    if (!SEPARATOR.test(text)) continue;
    if (!endsInFileExtension(text)) continue;
    links.push({ start, end, text });
  }
  return links;
}
