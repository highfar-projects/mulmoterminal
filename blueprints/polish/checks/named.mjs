// The documents the person named: every Markdown or text file at or under each line of the answer `targets`.
// What the survey may leave out is decided against this list, so it is built here rather than taken from the agent.
// Only this folder's own files count: a line that leaves it, and a symbolic link met on the way, are reported
// instead of followed, so a check built on this list refuses rather than trusts what it could not read.
import { posix } from "node:path";

export const TEXT_FILE = /\.(?:md|markdown|txt)$/u;
// A folder the build or a tool owns: never a document the person meant.
const SKIPPED_DIRS = new Set([".blueprint", ".git", "node_modules"]);

const lines = (answer) =>
  String(answer ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

// A line as a path inside this folder ("." for the folder itself), or null for one that leaves it.
export const insidePath = (line) => {
  const path = posix.normalize(line.replaceAll("\\", "/"));
  if (posix.isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path === ".." || path.startsWith("../")) return null;
  return path.endsWith("/") ? path.slice(0, -1) || "." : path;
};

/**
 * The text files under `answer`'s lines, each once, in a stable order, and what could not be read as this folder's
 * own (`refused`: a line outside it, a symbolic link). `fs` reads the folder: `kindOf(path)` is "file", "dir",
 * "link" or null, and `entries(dir)` lists a folder's names.
 */
export const namedTextFiles = (answer, fs) => {
  const walk = (path) => {
    const kind = fs.kindOf(path);
    if (kind === "link") return { files: [], refused: [path] };
    if (kind === "file") return { files: TEXT_FILE.test(path) ? [path] : [], refused: [] };
    if (kind !== "dir") return { files: [], refused: [] };
    const below = fs
      .entries(path)
      .filter((name) => !SKIPPED_DIRS.has(name))
      .map((name) => walk(path === "." ? name : `${path}/${name}`));
    return { files: below.flatMap((part) => part.files), refused: below.flatMap((part) => part.refused) };
  };
  const parts = lines(answer).map((line) => {
    const path = insidePath(line);
    return path === null ? { files: [], refused: [line] } : walk(path);
  });
  return {
    files: [...new Set(parts.flatMap((part) => part.files))].sort(),
    refused: [...new Set(parts.flatMap((part) => part.refused))].sort(),
  };
};
