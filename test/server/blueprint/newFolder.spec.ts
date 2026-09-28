// @vitest-environment node
import path from "node:path";
import { describe, it, expect } from "vitest";
import { folderHomes, folderPlan, nameCandidates, NAME_TRIES, type Presence } from "../../../server/blueprint/newFolder";

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
