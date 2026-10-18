// The user's own playfulEffects files: which config entries are kept, which file types play, what
// the browser accepts off the wire, and which picture a session ends up with.
import { describe, it, expect } from "vitest";
import { HEAT_PATTERNS, patternFor } from "../../common/playfulEffects";
import {
  PLAYFUL_MEDIA_ROUTE,
  heatPickFor,
  isPlayfulMediaPath,
  parsePublicPlayfulMedia,
  playfulMediaType,
  sanitizePlayfulMedia,
  type PublicPlayfulMedia,
} from "../../common/playfulMedia";

const item = (index: number, withFinale = false) => ({
  media: { kind: "image" as const, url: `${PLAYFUL_MEDIA_ROUTE}/${index}?v=1` },
  finale: withFinale ? { kind: "video" as const, url: `${PLAYFUL_MEDIA_ROUTE}/${index}/finale?v=1` } : null,
});
const withItems = (count: number, builtIn = true): PublicPlayfulMedia => ({ builtIn, items: Array.from({ length: count }, (_, index) => item(index)) });
const NONE = withItems(0);

// Seeded, so a failure names the id it failed on and reruns the same way.
const sessionIds = Array.from({ length: 500 }, (_, index) => `${(index * 2654435761) >>> 0}-${index.toString(36)}`);

describe("isPlayfulMediaPath", () => {
  it.each(["/abs/fire.gif", "~/Pictures/fire.gif", "./fx/cat.webp", "./a", "C:\\fx\\fire.gif", "d:/fx/fire.gif"])("reads %s", (value) => {
    expect(isPlayfulMediaPath(value)).toBe(true);
  });

  it.each(["fire.gif", "../fx/cat.gif", "~fire.gif", ".fire.gif", "", "/", "~", "C:fire.gif", "https://example.com/a.gif", 3, null, undefined, {}])(
    "refuses %j",
    (value) => {
      expect(isPlayfulMediaPath(value)).toBe(false);
    },
  );
});

describe("sanitizePlayfulMedia", () => {
  it("is the built-in pictures and none of the user's when unset or not an object", () => {
    [undefined, null, "random", [], 1].forEach((input) => expect(sanitizePlayfulMedia(input)).toEqual({ builtIn: true, files: [] }));
  });

  it("takes a bare path and an object with a finale, in order", () => {
    expect(sanitizePlayfulMedia({ files: ["~/a.gif", { file: "./b.mp4", finale: "/c.gif" }] })).toEqual({
      builtIn: true,
      files: [
        { file: "~/a.gif", finale: null },
        { file: "./b.mp4", finale: "/c.gif" },
      ],
    });
  });

  it("drops entries whose file is not a readable path, and a finale that is not one", () => {
    const sanitized = sanitizePlayfulMedia({ files: ["a.gif", 3, null, { file: "b.gif" }, { finale: "/c.gif" }, { file: "/d.gif", finale: "e.gif" }] });
    expect(sanitized.files).toEqual([{ file: "/d.gif", finale: null }]);
  });

  it("leaves the built-in pictures out only for an explicit false", () => {
    expect(sanitizePlayfulMedia({ builtIn: false }).builtIn).toBe(false);
    ["no", 0, null, undefined].forEach((builtIn) => expect(sanitizePlayfulMedia({ builtIn }).builtIn).toBe(true));
  });

  it("treats a files value that is not an array as none", () => {
    expect(sanitizePlayfulMedia({ files: "~/a.gif" }).files).toEqual([]);
  });
});

describe("playfulMediaType", () => {
  it.each([
    ["a.gif", "image", "image/gif"],
    ["a.PNG", "image", "image/png"],
    ["a.apng", "image", "image/apng"],
    ["a.webp", "image", "image/webp"],
    ["a.avif", "image", "image/avif"],
    ["a.svg", "image", "image/svg+xml"],
    ["a.mp4", "video", "video/mp4"],
    ["a.webm", "video", "video/webm"],
  ])("%s plays as %s", (file, kind, mime) => {
    expect(playfulMediaType(`/x/${file}`)).toEqual({ kind, mime });
  });

  it.each(["a.jpg", "a.mov", "a", "a.gif.txt", "/dir.gif/file"])("%s does not play", (file) => {
    expect(playfulMediaType(file)).toBeNull();
  });
});

describe("parsePublicPlayfulMedia", () => {
  it("keeps items whose URLs are under our own route", () => {
    expect(parsePublicPlayfulMedia({ builtIn: false, items: [item(0, true)] })).toEqual({ builtIn: false, items: [item(0, true)] });
  });

  it("drops an item pointing anywhere else, and a finale that does", () => {
    const foreign = { media: { kind: "image", url: "https://example.com/a.gif" }, finale: null };
    const badFinale = { media: item(1).media, finale: { kind: "image", url: "javascript:alert(1)" } };
    expect(parsePublicPlayfulMedia({ items: [foreign, badFinale] }).items).toEqual([{ media: item(1).media, finale: null }]);
  });

  it("drops an item with an unknown kind, and treats junk as the empty list", () => {
    expect(parsePublicPlayfulMedia({ items: [{ media: { kind: "audio", url: `${PLAYFUL_MEDIA_ROUTE}/0` } }] }).items).toEqual([]);
    [null, "x", [], { items: "x" }].forEach((raw) => expect(parsePublicPlayfulMedia(raw)).toEqual(expect.objectContaining({ items: [] })));
  });

  it("does not take a URL that merely starts with the route's name", () => {
    expect(parsePublicPlayfulMedia({ items: [{ media: { kind: "image", url: `${PLAYFUL_MEDIA_ROUTE}-evil/0` } }] }).items).toEqual([]);
  });
});

describe("heatPickFor", () => {
  it("is nothing when switched off, whatever the user listed", () => {
    expect(heatPickFor("s1", "off", withItems(3), false)).toBeNull();
  });

  it("uses a named built-in picture everywhere, ignoring the user's files", () => {
    sessionIds.slice(0, 50).forEach((id) => expect(heatPickFor(id, "kettle", withItems(3), false)).toEqual({ type: "builtIn", pattern: "kettle" }));
  });

  // Nobody's picture moves when this ships: with no files of their own, every session keeps the one
  // patternFor gave it.
  it("gives every session the picture it had before, when the user lists nothing", () => {
    sessionIds.forEach((id) => expect(heatPickFor(id, "random", NONE, false)).toEqual({ type: "builtIn", pattern: patternFor(id, "random") }));
  });

  it("draws from the built-in pictures and the user's files together", () => {
    const picks = sessionIds.map((id) => heatPickFor(id, "random", withItems(3), false));
    expect(picks.some((pick) => pick?.type === "media")).toBe(true);
    expect(picks.some((pick) => pick?.type === "builtIn")).toBe(true);
    expect(new Set(picks.map((pick) => (pick?.type === "media" ? pick.item.media.url : pick?.type)))).toEqual(
      new Set(["builtIn", ...withItems(3).items.map((entry) => entry.media.url)]),
    );
  });

  it("draws only from the user's files with the built-in pictures left out", () => {
    sessionIds.forEach((id) => expect(heatPickFor(id, "random", withItems(2, false), false)?.type).toBe("media"));
  });

  it("is nothing with the built-in pictures left out and no files", () => {
    expect(heatPickFor("s1", "random", withItems(0, false), false)).toBeNull();
  });

  // A browser cannot hold a GIF still, so reduced motion falls back to the built-in pictures.
  it("leaves the user's files out when motion is reduced", () => {
    sessionIds.forEach((id) => expect(heatPickFor(id, "random", withItems(3), true)).toEqual({ type: "builtIn", pattern: patternFor(id, "random") }));
    expect(heatPickFor("s1", "random", withItems(3, false), true)).toBeNull();
  });

  it("keeps a session's pick across calls", () => {
    sessionIds.slice(0, 50).forEach((id) => expect(heatPickFor(id, "random", withItems(4), false)).toEqual(heatPickFor(id, "random", withItems(4), false)));
  });

  it("covers every built-in picture", () => {
    const patterns = new Set(sessionIds.map((id) => heatPickFor(id, "random", NONE, false)).map((pick) => (pick?.type === "builtIn" ? pick.pattern : null)));
    expect(patterns).toEqual(new Set(HEAT_PATTERNS));
  });
});
