// What claude is told about a file a plugin saved, made readable from the cell it runs in.
//
// A plugin only knows the artifacts area through `files.artifacts`, so it reports a saved
// file as `artifacts/spreadsheets/…json` — relative to the WORKSPACE. MulmoClaude always
// runs in the workspace, where that resolves; a MulmoTerminal project cell runs in its own
// directory, where it names nothing, and `presentSpreadsheet`'s "read that file for the
// current values" fails there. The shapescript STL / USDZ tools rewrite their own path for
// the same reason; this does it once, for every plugin's narration.
//
// Only the narration: the GUI `data` keeps the relative path, which is what the View loads
// and saves through.
import path from "node:path";

// A path starts at the beginning, or after whitespace or an opening quote/bracket — never
// after `/`, so an already-absolute `/…/artifacts/x` is left alone. It runs to the next
// whitespace, quote, bracket or list punctuation.
const RELATIVE_ARTIFACT_PATH = /(^|[\s`'"(<[])artifacts\/([^\s`'"()<>[\];,]+)/g;
// Sentence punctuation directly after a path ("Saved to artifacts/a.json.") is not part of it.
const SENTENCE_PUNCTUATION = new Set([".", ":", "!", "?"]);

function withoutTrailingPunctuation(rest: string): string {
  const chars = [...rest];
  const punctuationAtEnd = [...chars].reverse().findIndex((char) => !SENTENCE_PUNCTUATION.has(char));
  if (punctuationAtEnd === -1) return "";
  return chars.slice(0, chars.length - punctuationAtEnd).join("");
}

function absolutize(rest: string, artifactsRoot: string): string | null {
  const relative = withoutTrailingPunctuation(rest);
  const trailing = rest.slice(relative.length);
  const segments = relative.split("/");
  // Plugins write artifact paths with `/` only. A `\` would be a separator to Windows' path.join,
  // so `artifacts/a\..\..\x` would climb out of the root past the `..` check.
  if (relative === "" || relative.includes("\\") || segments.includes("..")) return null;
  return path.join(artifactsRoot, ...segments) + trailing;
}

// The root is asked for only when the narration names a path: most tool results carry none.
export function absolutizeArtifactPaths(narration: string, artifactsRoot: () => string): string {
  return narration.replace(RELATIVE_ARTIFACT_PATH, (whole: string, lead: string, rest: string) => {
    const absolute = absolutize(rest, artifactsRoot());
    return absolute === null ? whole : `${lead}${absolute}`;
  });
}
