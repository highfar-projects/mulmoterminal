// @vitest-environment node
import path from "node:path";
import { describe, it, expect } from "vitest";
import { expandHome, folderCandidates, folderHomes, folderPlan, nameCandidates, NAME_TRIES, type Presence } from "../../../server/blueprint/newFolder";

const DIR = path.resolve("/work/new");

describe("folderPlan", () => {
  it.each<[Presence, Presence, ReturnType<typeof folderPlan>]>([
    ["folder", "folder", { ok: true, create: false }],
    ["folder", "absent", { ok: true, create: false }],
    ["absent", "folder", { ok: true, create: true }],
    ["absent", "absent", { ok: false, refusal: { code: "no-parent", dir: path.dirname(DIR) } }],
    ["absent", "other", { ok: false, refusal: { code: "no-parent", dir: path.dirname(DIR) } }],
    ["other", "folder", { ok: false, refusal: { code: "not-a-directory", dir: DIR } }],
  ])("the folder %s, its parent %s", (self, parent, plan) => {
    expect(folderPlan(DIR, self, parent)).toEqual(plan);
  });

  it("refuses a relative path and a filesystem root whatever is there", () => {
    expect(folderPlan("work/new", "folder", "folder")).toEqual({ ok: false, refusal: { code: "not-absolute" } });
    expect(folderPlan(path.parse(DIR).root, "folder", "folder")).toEqual({ ok: false, refusal: { code: "not-absolute" } });
  });
});

describe("folderHomes", () => {
  it("puts the parents of recent builds first, newest first, each once, then the workspace", () => {
    const recent = ["/a/one", "/b/two", "/a/three"].map((dir) => path.resolve(dir));
    expect(folderHomes(recent, path.resolve("/ws"))).toEqual(["/a", "/b", "/ws"].map((dir) => path.resolve(dir)));
    expect(folderHomes([path.resolve("/ws/x")], path.resolve("/ws"))).toEqual([path.resolve("/ws")]);
    expect(folderHomes([], path.resolve("/ws"))).toEqual([path.resolve("/ws")]);
  });
});

describe("nameCandidates", () => {
  it("tries the name, then numbered ones, as many times as allowed", () => {
    expect(nameCandidates("keihi", 3)).toEqual(["keihi", "keihi-2", "keihi-3"]);
    expect(nameCandidates("keihi")).toHaveLength(NAME_TRIES);
    expect(nameCandidates("keihi", 0)).toEqual([]);
  });
});

describe("expandHome", () => {
  const HOME = path.resolve("/home/me");

  it.each([
    ["~", "/", HOME],
    ["~/", "/", HOME],
    ["~/trials/library", "/", path.join(HOME, "trials/library")],
    ["~\\trials", "\\", path.join(HOME, "trials")],
    ["~/trials", "\\", path.join(HOME, "trials")],
  ])("reads %s (separator %s) from the home folder", (input, separator, expanded) => {
    expect(expandHome(input, HOME, separator)).toBe(expanded);
  });

  it.each([
    ["~\\trials", "/"],
    ["~other/trials", "/"],
    ["/abs/~/x", "/"],
    ["trials/~", "/"],
    ["", "/"],
    ["~~/x", "/"],
  ])("leaves %s (separator %s) as it is", (input, separator) => {
    expect(expandHome(input, HOME, separator)).toBe(input);
  });
});

describe("folderCandidates", () => {
  const resolved = (dirs: string[]): string[] => dirs.map((dir) => path.resolve(dir));

  it("puts the recent builds' folders first in their order, then the saved ones, each once", () => {
    expect(folderCandidates(["/w/b", "/w/a", "/w/b"], ["/s/x", "/w/a", "/s/y"], 10)).toEqual(resolved(["/w/b", "/w/a", "/s/x", "/s/y"]));
  });

  it("counts two spellings of one folder once, and leaves out a relative path", () => {
    expect(folderCandidates(["/w/a/", "/w/./a"], ["w/a", "", "/w/a/../a"], 10)).toEqual(resolved(["/w/a"]));
  });

  it("is empty with nothing to offer", () => {
    expect(folderCandidates([], [], 10)).toEqual([]);
  });

  it("takes at most the given number of recent builds' folders, counted after repeats are dropped, and every saved one", () => {
    expect(folderCandidates(["/w/a", "/w/a", "/w/b", "/w/c"], ["/s/x", "/w/c"], 2)).toEqual(resolved(["/w/a", "/w/b", "/s/x", "/w/c"]));
  });
});
