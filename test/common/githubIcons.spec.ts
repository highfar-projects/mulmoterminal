// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GITHUB_ICON_PATHS, githubIconOf, type GithubIconName } from "../../common/githubIcons";

const NAMES: GithubIconName[] = ["repo", "issue-opened", "git-pull-request", "play"];

describe("githubIconOf", () => {
  it("resolves each shipped name behind the github: prefix", () => {
    for (const name of NAMES) expect(githubIconOf(`github:${name}`)).toBe(name);
  });

  it("leaves Material Symbols names alone", () => {
    for (const icon of ["merge", "repo", "play", "bolt"]) expect(githubIconOf(icon)).toBeNull();
  });

  it("refuses a github: name it does not ship, and anything malformed", () => {
    for (const icon of ["github:", "github:mark-github", "GitHub:repo", "github:repo ", " github:repo", "github:REPO", "github:git-pull-request-16"]) {
      expect(githubIconOf(icon)).toBeNull();
    }
  });

  // An own-property check, not `in`: a config value must not reach the object's prototype.
  it("does not treat inherited object keys as icons", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__"]) expect(githubIconOf(`github:${name}`)).toBeNull();
  });

  it("answers null for an absent icon", () => {
    expect(githubIconOf(undefined)).toBeNull();
    expect(githubIconOf(null)).toBeNull();
    expect(githubIconOf("")).toBeNull();
  });
});

describe("GITHUB_ICON_PATHS", () => {
  it("ships exactly the four names, each with path data", () => {
    expect(Object.keys(GITHUB_ICON_PATHS).sort()).toEqual([...NAMES].sort());
    for (const paths of Object.values(GITHUB_ICON_PATHS)) {
      expect(paths.length).toBeGreaterThan(0);
      for (const d of paths) expect(d).toMatch(/^M[\d.]/);
    }
  });
});
