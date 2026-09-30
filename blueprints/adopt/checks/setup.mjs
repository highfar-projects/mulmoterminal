// What adopting chaff in a folder of documents has to leave behind, as rules a check can apply to text: the places
// chaff watches, and a workflow that reports only what is new, on the line it is about, with no more rights than that.
import { posix } from "node:path";

/** The places the answer names, one a line, as paths inside this folder; a line that leaves it is `refused`. */
export const placesIn = (answer) => {
  const lines = String(answer ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const inside = (line) => {
    const path = posix.normalize(line.replaceAll("\\", "/"));
    return posix.isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path === ".." || path.startsWith("../") ? null : path.replace(/\/$/u, "") || ".";
  };
  // A place with a space in its name cannot be written unquoted into the workflow's command line: refused, not guessed.
  const usable = (line) => inside(line) !== null && !/\s/u.test(line);
  return {
    places: [...new Set(lines.filter(usable).map(inside))],
    refused: lines.filter((line) => !usable(line)),
  };
};

const linesOf = (text) => text.split("\n").map((line) => line.trimEnd());
const has = (pattern) => (text) => pattern.test(text);
const onPullRequest = (text) => linesOf(text).some((line) => line.trim() === "pull_request:");
// The top-level permissions block, and the line right under it.
// Every permissions block, with how deep it sits and what it grants: the `key: value` lines under it, comments aside.
// A value written on the block's own line (read-all, write-all) grants nothing listed, so it is refused as not exact.
const permissionBlocks = (text) => {
  const lines = linesOf(text).map((line) => line.split("#")[0].trimEnd());
  const depth = (line) => line.length - line.trimStart().length;
  return lines.flatMap((line, at) => {
    if (line.trim().split(":")[0] !== "permissions") return [];
    const under = lines.slice(at + 1);
    const end = under.findIndex((next) => next.trim() !== "" && depth(next) <= depth(line));
    const grants = under
      .slice(0, end < 0 ? under.length : end)
      .filter((next) => next.trim() !== "")
      .map((next) =>
        next
          .trim()
          .split(":")
          .map((part) => part.trim()),
      );
    return [{ top: depth(line) === 0, grants: Object.fromEntries(grants) }];
  });
};

const exactly = (grants, wanted) => JSON.stringify(Object.entries(grants).sort()) === JSON.stringify(Object.entries(wanted).sort());
// What the workflow may grant, and nothing more: reading at the top, and uploading findings in the job.
const TOP = { contents: "read" };
const JOB = { contents: "read", "security-events": "write" };
const leastPrivilege = (text) => {
  const blocks = permissionBlocks(text);
  const tops = blocks.filter((block) => block.top);
  const jobs = blocks.filter((block) => !block.top);
  return tops.length === 1 && jobs.length > 0 && exactly(tops[0].grants, TOP) && jobs.every((block) => exactly(block.grants, JOB));
};

// Each thing the workflow must hold, and why a reader would care it is there.
const REQUIRED = [
  [onPullRequest, "run on pull requests"],
  [has(/npx -y chaffjs@0\.16 /u), "run the chaff version the packs are written for (npx -y chaffjs@0.16)"],
  [has(/--sarif chaff\.sarif/u), "write the findings as SARIF (--sarif chaff.sarif)"],
  [has(/uses: github\/codeql-action\/upload-sarif@[0-9a-f]{40}\b/u), "upload the SARIF with github/codeql-action/upload-sarif pinned to a commit"],
  [has(/sarif_file: chaff\.sarif/u), "upload chaff.sarif"],
  [leastPrivilege, "grant only contents: read at the top, and only contents: read with security-events: write in the job"],
  [has(/persist-credentials: false/u), "check out without keeping the token (persist-credentials: false)"],
];
/** What `workflow` (a GitHub Actions file's text) lacks, or takes that it should not, to report on `places`. */
export const workflowProblems = (workflow, places) => {
  const text = String(workflow);
  const run = text.split("\n").find((line) => line.includes("npx -y chaffjs@")) ?? "";
  return [
    ...REQUIRED.filter(([holds]) => !holds(text)).map(([, what]) => `it does not ${what}`),
    ...places.filter((place) => !run.split(/\s+/u).includes(place)).map((place) => `its chaff run does not check ${place}`),
  ];
};
