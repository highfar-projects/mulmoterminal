// Pure parsing rules that were trapped behind `gh` / `git` spawns, so no test reached them.

import { splitLines } from "../infra/split-lines.js";

// The PR URL from `gh pr create` output: the LAST http(s) line. gh prints the PR URL last,
// after any tips or notices — so a tip that happens to contain an http line must not win, and
// the last one is taken rather than the first. Empty output → null (the caller falls back to
// the compare URL).
export function lastGhUrl(stdout: string): string | null {
  const urls = splitLines(stdout)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http"));
  return urls[urls.length - 1] ?? null;
}

export interface NumstatEntry {
  path: string;
  additions: number;
  deletions: number;
}

// A `git diff --numstat` line: <adds>\t<dels>\t<path>. A binary file reports "-" for its
// counts, which becomes -1 (the badge shows "binary" rather than a bogus +/-). The path is
// rejoined with tabs so a path that itself contains a tab survives.
export function parseNumstatLine(line: string, toCount: (s: string) => number): NumstatEntry {
  const [add, del, ...rest] = line.split("\t");
  const num = (s: string) => (s === "-" ? -1 : toCount(s));
  return { path: rest.join("\t"), additions: num(add ?? "-"), deletions: num(del ?? "-") };
}

// Cap a diff patch so a huge one does not bloat the payload over the socket; `truncated` tells
// the client it is showing a prefix.
export function capPatch(full: string, limit: number): { patch: string; truncated: boolean } {
  return full.length > limit ? { patch: full.slice(0, limit), truncated: true } : { patch: full, truncated: false };
}

export interface PorcelainV2 {
  branch: string | null; // null when detached, or when git printed no branch header
  detached: boolean;
  dirty: number;
  ahead: number;
  behind: number;
  upstream: boolean;
}

const DETACHED_HEAD = "(detached)";

// `# <key> <value>` → value, for the headers `--branch` prepends. Compared by prefix rather
// than split on whitespace: only the key is fixed-width, and taking the remainder verbatim
// keeps a value that contains spaces intact.
const headerValue = (line: string, key: string): string | null => (line.startsWith(`# ${key} `) ? line.slice(key.length + 3) : null);

// `+2 -3` → ahead 2, behind 3. The signs are the FORMAT, not the numbers: parsing "-3" as
// written would report behind as negative, so each side is read as a magnitude.
const magnitude = (s: string): number => Math.abs(Number.parseInt(s, 10)) || 0;

// One pass over `git status --porcelain=v2 --branch`, which answers in a single spawn
// everything gitStatus used to spawn `rev-parse --show-toplevel`, `symbolic-ref` and
// `rev-list --left-right --count` for alongside it. Measured on a 43.5k-file repo: the
// `--branch` headers cost nothing over a bare status (~7s either way) while the separate
// rev-list was another 4.3-4.9s of its own — see git-status.ts for why that mattered.
//
// The headers are `branch.oid`, `branch.head`, and (only when HEAD tracks something)
// `branch.upstream` and `branch.ab`. Every other non-blank line is one uncommitted entry:
// `1 `/`2 ` tracked, `u ` unmerged, `? ` untracked. Ignored files are absent unless asked
// for, and a rename is one line, so counting them reports the same number `--porcelain` v1
// did from the same working tree.
//
// An unborn branch (`git init`, nothing committed) still names itself in `branch.head` with
// `branch.oid (initial)` — which is why this can replace `symbolic-ref`, the one thing
// `rev-parse --abbrev-ref HEAD` could not do.
export function parsePorcelainV2(stdout: string, lines: (text: string) => string[]): PorcelainV2 {
  const out: PorcelainV2 = { branch: null, detached: false, dirty: 0, ahead: 0, behind: 0, upstream: false };
  for (const line of lines(stdout)) {
    if (!line.trim()) continue;
    if (!line.startsWith("# ")) {
      out.dirty += 1;
      continue;
    }
    const head = headerValue(line, "branch.head");
    if (head !== null) {
      out.detached = head === DETACHED_HEAD;
      out.branch = out.detached ? null : head;
      continue;
    }
    if (headerValue(line, "branch.upstream") !== null) {
      out.upstream = true;
      continue;
    }
    const ab = headerValue(line, "branch.ab");
    if (ab !== null) {
      const [ahead, behind] = ab.split(" ");
      out.ahead = magnitude(ahead ?? "");
      out.behind = magnitude(behind ?? "");
    }
  }
  return out;
}
