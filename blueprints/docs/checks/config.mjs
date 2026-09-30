// A folder's chaff.yaml as a check reads it without a YAML parser: what a usecase may add to it, and what it must keep.

/** The lines of chaff.yaml that say something (not blank, not a comment), as written. */
export const settingLines = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));

// A top-level `key:` line of chaff.yaml, as its key.
const topKey = (line) => (/^\S/u.test(line) ? line.split(":")[0].trim() : null);

/**
 * The lines `before` had that `after` no longer has: a change that was meant to add must lose none — except the
 * top-level keys in `replaceable`, which the change sets on purpose (adopting a folder sets its `genre`).
 */
export const lostLines = (before, after, replaceable = []) =>
  before === null ? [] : settingLines(before).filter((line) => !replaceable.includes(topKey(line)) && !settingLines(after).includes(line));
