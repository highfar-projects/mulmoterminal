// @vitest-environment node
// What a directory's `background` resolves to. The image is held to the icon's rules; anything
// unusable drops the whole key, so the settings preview reports it as ignored rather than drawing
// something other than what was written.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dirBackgroundRef, resolveDirBackground } from "../../../server/config/dir-background";
import { DIR_BACKGROUND_DEFAULT_FIT, DIR_BACKGROUND_DEFAULT_OPACITY } from "../../../common/dirBackground";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-bg-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "wall.png"), "x");
  writeFileSync(path.join(dir, "notes.txt"), "x");
  return dir;
}

describe("resolveDirBackground", () => {
  it("reads a bare string as the image with the default opacity and fit", () => {
    const dir = project();
    expect(resolveDirBackground(dir, "wall.png")).toEqual({
      image: { source: "file", path: path.join(dir, "wall.png"), ref: "wall.png", mime: "image/png" },
      opacity: DIR_BACKGROUND_DEFAULT_OPACITY,
      fit: DIR_BACKGROUND_DEFAULT_FIT,
    });
  });

  it("reads the object spelling", () => {
    expect(resolveDirBackground(project(), { image: "wall.png", opacity: 0.4, fit: "contain" })).toMatchObject({ opacity: 0.4, fit: "contain" });
  });

  it("takes a remote image verbatim", () => {
    expect(resolveDirBackground(project(), "https://example.com/wall.jpg")).toMatchObject({ image: { source: "url", url: "https://example.com/wall.jpg" } });
  });

  it("accepts the full range of opacity, 1 included", () => {
    expect(resolveDirBackground(project(), { image: "wall.png", opacity: 1 })).toMatchObject({ opacity: 1 });
    expect(resolveDirBackground(project(), { image: "wall.png", opacity: 0.01 })).toMatchObject({ opacity: 0.01 });
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["false", false],
    ["a number", 3],
    ["an empty string", ""],
    ["a missing file", "gone.png"],
    ["a file that is not an image", "notes.txt"],
    ["a path out of the directory", "../wall.png"],
    ["an object without an image", { opacity: 0.2 }],
    ["an image of false", { image: false }],
    ["zero opacity", { image: "wall.png", opacity: 0 }],
    ["opacity over 1", { image: "wall.png", opacity: 1.5 }],
    ["opacity that is not a number", { image: "wall.png", opacity: "0.2" }],
    ["an unknown fit", { image: "wall.png", fit: "tile" }],
    ["a scheme the browser must not load", "javascript:alert(1)"],
  ])("drops %s", (_label, input) => {
    expect(resolveDirBackground(project(), input)).toBeNull();
  });
});

describe("dirBackgroundRef", () => {
  it("writes a file back as the path as typed, so it resolves again in a worktree", () => {
    const dir = project();
    expect(dirBackgroundRef(resolveDirBackground(dir, { image: "wall.png", opacity: 0.3 }))).toEqual({ image: "wall.png", opacity: 0.3, fit: "cover" });
  });

  it("writes a remote image back verbatim", () => {
    expect(dirBackgroundRef(resolveDirBackground(project(), "https://example.com/w.png"))).toMatchObject({ image: "https://example.com/w.png" });
  });

  it("writes nothing for no background", () => {
    expect(dirBackgroundRef(null)).toBeNull();
  });
});
