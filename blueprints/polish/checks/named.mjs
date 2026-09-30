// The documents the person named: every Markdown or text file at or under each line of the answer `targets`.
// What the survey may leave out is decided against this list, so it is built here rather than taken from the agent.
import { normalize } from "node:path";

export const TEXT_FILE = /\.(?:md|markdown|txt)$/u;
// A folder the build or a tool owns: never a document the person meant.
const SKIPPED_DIRS = new Set([".blueprint", ".git", "node_modules"]);

const lines = (answer) =>
  String(answer ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

const withoutTrailingSlash = (line) => {
  const end = [...line].findLastIndex((char) => char !== "/");
  return line.slice(0, end + 1);
};

/**
 * The text files under `answer`'s lines, each once, in a stable order. `fs` reads the folder: `kindOf(path)` is
 * "file", "dir" or null, and `entries(dir)` lists a folder's names.
 */
export const namedTextFiles = (answer, fs) => {
  const walk = (path) => {
    const kind = fs.kindOf(path);
    if (kind === "file") return TEXT_FILE.test(path) ? [normalize(path)] : [];
    if (kind !== "dir") return [];
    return fs
      .entries(path)
      .filter((name) => !SKIPPED_DIRS.has(name))
      .flatMap((name) => walk(path === "." ? name : `${path}/${name}`));
  };
  return [...new Set(lines(answer).flatMap((line) => walk(withoutTrailingSlash(line) || ".")))].sort();
};
