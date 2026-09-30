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
  return {
    places: [...new Set(lines.map(inside).filter((path) => path !== null))],
    refused: lines.filter((line) => inside(line) === null),
  };
};

const linesOf = (text) => text.split("\n").map((line) => line.trimEnd());
const has = (pattern) => (text) => pattern.test(text);
const onPullRequest = (text) => linesOf(text).some((line) => line.trim() === "pull_request:");
// The top-level permissions block, and the line right under it.
const readOnlyAtTop = (text) => {
  const lines = linesOf(text);
  const at = lines.indexOf("permissions:");
  return (
    at >= 0 &&
    lines
      .slice(at + 1)
      .find((line) => line.trim() !== "")
      ?.trim() === "contents: read"
  );
};

// Each thing the workflow must hold, and why a reader would care it is there.
const REQUIRED = [
  [onPullRequest, "run on pull requests"],
  [has(/npx -y chaffjs@0\.16 /u), "run the chaff version the packs are written for (npx -y chaffjs@0.16)"],
  [has(/--sarif chaff\.sarif/u), "write the findings as SARIF (--sarif chaff.sarif)"],
  [has(/uses: github\/codeql-action\/upload-sarif@/u), "upload the SARIF so each finding lands on its line (github/codeql-action/upload-sarif)"],
  [has(/sarif_file: chaff\.sarif/u), "upload chaff.sarif"],
  [readOnlyAtTop, "declare least privilege at the top (permissions: contents: read)"],
  [has(/security-events: write/u), "grant security-events: write, which the upload needs"],
  [has(/persist-credentials: false/u), "check out without keeping the token (persist-credentials: false)"],
];
// Rights the workflow must not take: it only reads the documents and reports.
const FORBIDDEN = [
  [/contents: write/u, "contents: write"],
  [/pull-requests: write/u, "pull-requests: write"],
  [/permissions: write-all/u, "permissions: write-all"],
];

/** What `workflow` (a GitHub Actions file's text) lacks, or takes that it should not, to report on `places`. */
export const workflowProblems = (workflow, places) => {
  const text = String(workflow);
  const run = text.split("\n").find((line) => line.includes("npx -y chaffjs@")) ?? "";
  return [
    ...REQUIRED.filter(([holds]) => !holds(text)).map(([, what]) => `it does not ${what}`),
    ...FORBIDDEN.filter(([pattern]) => pattern.test(text)).map(([, what]) => `it takes ${what}, which it does not need`),
    ...places.filter((place) => !run.split(/\s+/u).includes(place)).map((place) => `its chaff run does not check ${place}`),
  ];
};
