// @vitest-environment node
//
// GET /api/dir-suggest against a real directory tree: `exists` must agree with the rule the spawn
// refuses by, and the suggestions are the subdirectories only.
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appRequest } from "../../helpers/appRequest.js";
import { makeTempDir } from "../../support/tempDir";
import { mountDirSuggestRoute } from "../../../server/files/dir-suggest-route.js";
import { DIR_SUGGEST_ROUTE, isDirSuggestResponse } from "../../../common/dirSuggest.js";
import { existingWorkspace } from "../../../server/config/workspace.js";

// A file symlink needs a privilege on Windows that a directory junction does not.
const FILE_LINKS = process.platform !== "win32";

let home: string;
let request: ReturnType<typeof appRequest>;

beforeAll(() => {
  home = makeTempDir("mt-dir-suggest-");
  mkdirSync(path.join(home, "projects", "alpha"), { recursive: true });
  mkdirSync(path.join(home, "projects", "alps"));
  mkdirSync(path.join(home, "projects", ".hidden"));
  writeFileSync(path.join(home, "projects", "almanac.txt"), "");
  symlinkSync(path.join(home, "projects", "alpha"), path.join(home, "projects", "alias"), "junction"); // a directory link Windows makes without admin
  if (FILE_LINKS) symlinkSync(path.join(home, "projects", "almanac.txt"), path.join(home, "projects", "alfile"));
  const app = express();
  mountDirSuggestRoute(app, home);
  request = appRequest(app);
});

const ask = async (typed: string) => {
  const response = await request(`${DIR_SUGGEST_ROUTE}?path=${encodeURIComponent(typed)}`);
  const body: unknown = await response.json();
  if (!isDirSuggestResponse(body)) throw new Error(`unexpected body ${JSON.stringify(body)}`);
  return body;
};

describe("GET /api/dir-suggest", () => {
  it("offers the subdirectories, a linked one included, and no files", async () => {
    const projects = path.join(home, "projects");
    expect(await ask(`${projects}/al`)).toEqual({ exists: false, suggestions: [`${projects}/alias`, `${projects}/alpha`, `${projects}/alps`] });
  });

  it("says an existing directory exists, and lists its children", async () => {
    const projects = path.join(home, "projects");
    expect(await ask(`${projects}/`)).toEqual({ exists: true, suggestions: [`${projects}/alias`, `${projects}/alpha`, `${projects}/alps`] });
  });

  it("answers in the ~ spelling it was asked in", async () => {
    expect(await ask("~/projects/alp")).toEqual({ exists: false, suggestions: ["~/projects/alpha", "~/projects/alps"] });
    expect((await ask("~/projects")).exists).toBe(true);
  });

  it.each([["a missing directory", "projects/nope"], ["a file", "projects/almanac.txt"], ...(FILE_LINKS ? [["a link to a file", "projects/alfile"]] : [])])(
    "says %s does not exist",
    async (_case, rel) => {
      expect(await ask(path.join(home, rel))).toEqual({ exists: false, suggestions: [] });
    },
  );

  it.each([
    ["", false],
    ["relative/dir", false],
  ])("does not call %j launchable", async (typed, exists) => {
    expect(await ask(typed)).toEqual({ exists, suggestions: [] });
  });

  // The form must not disagree with the spawn about what can be started.
  it.each(["projects", "projects/", "projects/alias", "projects/nope", "projects/almanac.txt", ...(FILE_LINKS ? ["projects/alfile"] : [])])(
    "agrees with the spawn's rule for %s",
    async (rel) => {
      const typed = path.join(home, rel);
      expect((await ask(typed)).exists).toBe(existingWorkspace(typed, home) !== null);
    },
  );

  it.each([
    ["no path", DIR_SUGGEST_ROUTE],
    ["a repeated path", `${DIR_SUGGEST_ROUTE}?path=/a&path=/b`],
  ])("refuses %s", async (_case, url) => {
    expect((await request(url)).status).toBe(400);
  });
});
