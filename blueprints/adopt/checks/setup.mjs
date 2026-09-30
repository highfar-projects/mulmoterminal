// What adopting chaff in a folder of documents has to leave behind: the places chaff watches, and the workflow that
// reports on them. The workflow is the pack's template filled in with the places, exactly: a workflow is judged
// by being that one known file, not by reading arbitrary YAML for what might be unsafe in it.
import { posix } from "node:path";

// A place goes into the workflow's command line unquoted, so only characters with no meaning to a shell are allowed:
// letters and digits of any script, and . _ - / — never a leading - (it would read as an option).
const SAFE = /^[\p{L}\p{N}._/-]+$/u;

/** The places the answer names, one a line, as paths inside this folder; a line that leaves it or is unsafe is `refused`. */
export const placesIn = (answer) => {
  const lines = String(answer ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const inside = (line) => {
    const path = posix.normalize(line.replaceAll("\\", "/"));
    if (posix.isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path === ".." || path.startsWith("../")) return null;
    const trimmed = path.replace(/\/$/u, "") || ".";
    return SAFE.test(trimmed) && !trimmed.startsWith("-") ? trimmed : null;
  };
  return {
    places: [...new Set(lines.map(inside).filter((path) => path !== null))],
    refused: lines.filter((line) => inside(line) === null),
  };
};

/** The workflow the pack writes for `places`: its template with the places in the chaff run. */
export const workflowFor = (template, places) => String(template).replace("{{PATHS}}", places.join(" "));

// Line endings and trailing spaces aside (a line's trailing \r goes with its spaces): an editor's habits are not a different workflow.
const normalized = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();

/** What is wrong with `workflow`: anything but the template filled in with `places`. */
export const workflowProblems = (workflow, template, places) => {
  if (normalized(workflow) === normalized(workflowFor(template, places))) return [];
  const expected = normalized(workflowFor(template, places)).split("\n");
  const actual = normalized(workflow).split("\n");
  const at = expected.findIndex((line, index) => actual[index] !== line);
  const line = at < 0 ? expected.length + 1 : at + 1;
  return [`it is not the pack's template filled in with the places (first difference at line ${line}): copy the template again`];
};
