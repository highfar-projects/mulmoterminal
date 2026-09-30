// A folder's chaff.yaml as a check reads it without a YAML parser: what a usecase may add to it, and what it must keep.

/** The lines of chaff.yaml that say something (not blank, not a comment), as written. */
export const settingLines = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));

/** The lines `before` had that `after` no longer has: a change that was meant to add must lose none. */
export const lostLines = (before, after) => (before === null ? [] : settingLines(before).filter((line) => !settingLines(after).includes(line)));
