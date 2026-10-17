// @vitest-environment node
// Which configured files can be played and where they are, with a fake stat so no file is needed.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { PLAYFUL_MEDIA_MAX_BYTES, PLAYFUL_MEDIA_ROUTE, sanitizePlayfulMedia } from "../../../common/playfulMedia";
import {
  checkMediaFile,
  droppedPathWarnings,
  mediaCatalog,
  publicPlayfulMedia,
  resolveMediaPath,
  type MediaStat,
  type StatOf,
} from "../../../server/config/playful-media";

// Resolved, as the code resolves them: on Windows a POSIX-looking path gains a drive letter.
const HOME = path.resolve("/home/me");
const LAUNCH = path.resolve("/work/project");
const DIRS = { home: HOME, launchDir: LAUNCH };

const file = (size = 1000, mtimeMs = 1700000000123.7): MediaStat => ({ isFile: true, size, mtimeMs });
const statFrom =
  (files: Record<string, MediaStat>): StatOf =>
  (absolute) =>
    files[absolute] ?? null;

describe("resolveMediaPath", () => {
  it("reads ~/ from the home directory, ./ from the launch directory and / as itself", () => {
    expect(resolveMediaPath("~/Pictures/a.gif", DIRS)).toBe(path.join(HOME, "Pictures", "a.gif"));
    expect(resolveMediaPath("./fx/a.gif", DIRS)).toBe(path.join(LAUNCH, "fx", "a.gif"));
    expect(resolveMediaPath("/srv/a.gif", DIRS)).toBe(path.resolve("/srv/a.gif"));
  });

  it("follows .. inside a ./ path from the launch directory, not the server's own", () => {
    expect(resolveMediaPath("./../shared/a.gif", DIRS)).toBe(path.resolve(LAUNCH, "..", "shared", "a.gif"));
  });
});

describe("checkMediaFile", () => {
  const at = path.join(HOME, "a.gif");

  it("plays an existing file of a known type within its limit", () => {
    expect(checkMediaFile("~/a.gif", DIRS, statFrom({ [at]: file() }))).toEqual({
      file: { path: at, kind: "image", mime: "image/gif", version: 1700000000123 },
    });
  });

  it.each([
    ["an unknown type", "~/a.jpg", {}, /is not a GIF/],
    ["a missing file", "~/a.gif", {}, /does not exist/],
    ["a directory", "~/a.gif", { [at]: { isFile: false, size: 0, mtimeMs: 0 } }, /is not a file/],
    ["an image over its limit", "~/a.gif", { [at]: file(PLAYFUL_MEDIA_MAX_BYTES.image + 1) }, /larger than 20 MB/],
  ])("says why it refuses %s", (_label, raw, files, problem) => {
    const result = checkMediaFile(raw, DIRS, statFrom(files));
    expect("problem" in result && result.problem).toMatch(problem);
  });

  it("holds a file at exactly its limit, and a video to the larger one", () => {
    expect("file" in checkMediaFile("~/a.gif", DIRS, statFrom({ [at]: file(PLAYFUL_MEDIA_MAX_BYTES.image) }))).toBe(true);
    const video = path.join(HOME, "a.mp4");
    expect("file" in checkMediaFile("~/a.mp4", DIRS, statFrom({ [video]: file(PLAYFUL_MEDIA_MAX_BYTES.image + 1) }))).toBe(true);
    expect(checkMediaFile("~/a.mp4", DIRS, statFrom({ [video]: file(PLAYFUL_MEDIA_MAX_BYTES.video + 1) }))).toEqual({ problem: "is larger than 50 MB" });
  });
});

describe("mediaCatalog", () => {
  const files = {
    [path.join(HOME, "a.gif")]: file(),
    [path.join(LAUNCH, "b.mp4")]: file(),
    [path.join(HOME, "boom.webm")]: file(),
  };
  const media = sanitizePlayfulMedia({
    files: ["~/missing.gif", "~/a.gif", { file: "./b.mp4", finale: "~/boom.webm" }, { file: "~/a.gif", finale: "~/nope.gif" }],
  });

  it("keeps what plays, in config order, and warns once for each file left out", () => {
    const catalog = mediaCatalog(media, DIRS, statFrom(files));
    expect(catalog.items.map((entry) => [entry.media.path, entry.finale?.path ?? null])).toEqual([
      [path.join(HOME, "a.gif"), null],
      [path.join(LAUNCH, "b.mp4"), path.join(HOME, "boom.webm")],
      [path.join(HOME, "a.gif"), null],
    ]);
    expect(catalog.warnings).toEqual([
      '[playfulMedia] file "~/missing.gif" does not exist, so it is not used.',
      '[playfulMedia] finale "~/nope.gif" does not exist, so it is not used.',
    ]);
  });

  it("is empty, with nothing to warn about, when nothing is listed", () => {
    expect(mediaCatalog(sanitizePlayfulMedia(undefined), DIRS, statFrom(files))).toEqual({ items: [], warnings: [] });
  });
});

describe("publicPlayfulMedia", () => {
  const media = sanitizePlayfulMedia({ builtIn: false, files: ["~/a.gif", { file: "./b.mp4", finale: "~/boom.webm" }] });
  const catalog = mediaCatalog(
    media,
    DIRS,
    statFrom({ [path.join(HOME, "a.gif")]: file(), [path.join(LAUNCH, "b.mp4")]: file(10, 5), [path.join(HOME, "boom.webm")]: file(10, 6) }),
  );

  it("names each file by its index under our own route, never by its path", () => {
    expect(publicPlayfulMedia(media, catalog.items)).toEqual({
      builtIn: false,
      items: [
        { media: { kind: "image", url: `${PLAYFUL_MEDIA_ROUTE}/0?v=1700000000123` }, finale: null },
        { media: { kind: "video", url: `${PLAYFUL_MEDIA_ROUTE}/1?v=5` }, finale: { kind: "video", url: `${PLAYFUL_MEDIA_ROUTE}/1/finale?v=6` } },
      ],
    });
    expect(JSON.stringify(publicPlayfulMedia(media, catalog.items))).not.toContain(HOME);
  });
});

describe("droppedPathWarnings", () => {
  it("names each path in a form that is not read, for a file and for a finale", () => {
    expect(droppedPathWarnings({ files: ["fire.gif", { file: "~/ok.gif", finale: "boom.gif" }, { file: 3 }, "~/fine.gif"] })).toEqual([
      '[playfulMedia] "fire.gif" does not start with "/", "~/" or "./" (or a drive letter on Windows), so it is not used.',
      '[playfulMedia] "boom.gif" does not start with "/", "~/" or "./" (or a drive letter on Windows), so it is not used.',
      '[playfulMedia] 3 does not start with "/", "~/" or "./" (or a drive letter on Windows), so it is not used.',
    ]);
  });

  it("says nothing for an absent finale, and nothing when there is no list", () => {
    expect(droppedPathWarnings({ files: [{ file: "~/a.gif" }, { file: "~/b.gif", finale: null }] })).toEqual([]);
    [undefined, null, {}, { files: "x" }].forEach((raw) => expect(droppedPathWarnings(raw)).toEqual([]));
  });
});
