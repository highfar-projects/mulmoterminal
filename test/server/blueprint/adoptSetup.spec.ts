// @vitest-environment node
// Adopting chaff in a folder of documents: the places it watches, and the workflow it leaves behind — which must put
// only new findings on a pull request's lines and take no more rights than reading and reporting need.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { placesIn, workflowProblems } from "../../../blueprints/adopt/checks/setup.mjs";
import { PACKS } from "./docsPackHarness";

const TEMPLATE = readFileSync(join(PACKS, "adopt", "templates", "chaff.yml"), "utf8");
const workflowFor = (places: string) => TEMPLATE.replace("{{PATHS}}", places);

describe("the places chaff watches", () => {
  it("are the answer's lines inside this folder, each once, however written", () => {
    expect(placesIn("docs/\n./login.md\n\ndocs\ndocs\\\\help")).toEqual({ places: ["docs", "login.md", "docs/help"], refused: [] });
  });

  it("refuse a line that leaves the folder", () => {
    expect(placesIn("docs\n../other\n/etc\nC:\\\\x")).toEqual({ places: ["docs"], refused: ["../other", "/etc", "C:\\\\x"] });
    expect(placesIn(undefined)).toEqual({ places: [], refused: [] });
  });
});

describe("the workflow", () => {
  it("passes as the pack's template fills it in", () => {
    expect(workflowProblems(workflowFor("login.md export.md"), ["login.md", "export.md"])).toEqual([]);
  });

  it.each<[string, string, string]>([
    ["not run on pull requests", "  pull_request:\n", "run on pull requests"],
    ["another chaff version", "chaffjs@0.16 ", "run the chaff version the packs are written for"],
    ["no SARIF", "--sarif chaff.sarif", "write the findings as SARIF"],
    ["no upload", "github/codeql-action/upload-sarif@", "upload the SARIF"],
    ["no top-level least privilege", "permissions:\n  contents: read\n\njobs:", "declare least privilege at the top"],
    ["no right to upload findings", "security-events: write", "grant security-events: write"],
    ["a checkout that keeps the token", "persist-credentials: false", "check out without keeping the token"],
  ])("refuses a workflow with %s", (_label, removed, message) => {
    const broken = workflowFor("docs").replace(removed, removed.includes("jobs:") ? "jobs:" : "");
    expect(workflowProblems(broken, ["docs"]).join("\n")).toContain(message);
  });

  it("refuses a top-level permissions block that is not contents: read", () => {
    const other = workflowFor("docs").replace("permissions:\n  contents: read\n\njobs:", "permissions:\n  actions: read\n\njobs:");
    expect(workflowProblems(other, ["docs"]).join("\n")).toContain("declare least privilege at the top");
  });

  it.each(["contents: write", "pull-requests: write", "permissions: write-all"])("refuses a workflow that takes %s", (right) => {
    const greedy = workflowFor("docs").replace("security-events: write", `security-events: write\n      ${right}`);
    expect(workflowProblems(greedy, ["docs"]).join("\n")).toContain(`it takes ${right}`);
  });

  it("refuses a chaff run that leaves out a place, or only names it inside another word", () => {
    expect(workflowProblems(workflowFor("login.md"), ["login.md", "export.md"])).toEqual(["its chaff run does not check export.md"]);
    expect(workflowProblems(workflowFor("docs-old"), ["docs"])).toEqual(["its chaff run does not check docs"]);
  });
});
