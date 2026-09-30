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
    expect(placesIn("help pages/login.md\ndocs")).toEqual({ places: ["docs"], refused: ["help pages/login.md"] });
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
    ["a checkout that keeps the token", "persist-credentials: false", "check out without keeping the token"],
  ])("refuses a workflow with %s", (_label, removed, message) => {
    expect(workflowProblems(workflowFor("docs").replace(removed, ""), ["docs"]).join("\n")).toContain(message);
  });

  it("reads a permission with a comment after it as the permission", () => {
    const commented = workflowFor("docs").replace("      security-events: write", "      security-events: write # the upload needs it");
    expect(workflowProblems(commented, ["docs"])).toEqual([]);
  });

  it("refuses an upload not pinned to a commit", () => {
    const tagged = workflowFor("docs").replace(/upload-sarif@[0-9a-f]{40}/u, "upload-sarif@v4");
    expect(workflowProblems(tagged, ["docs"]).join("\n")).toContain("pinned to a commit");
  });

  it.each<[string, (text: string) => string]>([
    ["no top-level block", (text) => text.replace("permissions:\n  contents: read\n\njobs:", "jobs:")],
    ["a top-level block granting something else", (text) => text.replace("permissions:\n  contents: read\n\njobs:", "permissions:\n  actions: read\n\njobs:")],
    ["write at the top", (text) => text.replace("permissions:\n  contents: read\n\njobs:", "permissions:\n  contents: write\n\njobs:")],
    ["an extra right in the job", (text) => text.replace("      security-events: write", "      security-events: write\n      id-token: write")],
    ["pull-requests: write in the job", (text) => text.replace("      security-events: write", "      security-events: write\n      pull-requests: write")],
    ["write-all on one line", (text) => text.replace("permissions:\n  contents: read\n\njobs:", "permissions: write-all\n\njobs:")],
    ["the upload right only in a comment", (text) => text.replace("      security-events: write", "      # security-events: write")],
    ["no job block", (text) => text.replace("    permissions:\n      contents: read\n      security-events: write\n", "")],
  ])("refuses permissions with %s", (_label, change) => {
    expect(workflowProblems(change(workflowFor("docs")), ["docs"]).join("\n")).toContain("grant only contents: read at the top");
  });

  it("refuses a chaff run that leaves out a place, or only names it inside another word", () => {
    expect(workflowProblems(workflowFor("login.md"), ["login.md", "export.md"])).toEqual(["its chaff run does not check export.md"]);
    expect(workflowProblems(workflowFor("docs-old"), ["docs"])).toEqual(["its chaff run does not check docs"]);
  });
});
