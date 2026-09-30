import { describe, it, expect } from "vitest";
import {
  backgroundFromValue,
  editForBackground,
  editForIcon,
  iconMode,
  soundChoice,
  soundsFromValue,
  withDirKindSound,
} from "../../../src/components/dirMedia";

describe("icon", () => {
  it.each([
    [undefined, "auto"],
    ["", "auto"],
    [false, "none"],
    ["public/logo.png", "image"],
    [true, "auto"],
  ])("reads %j as %s", (value, mode) => {
    expect(iconMode(value)).toBe(mode);
  });

  it("saves each mode, and waits for the text of an image", () => {
    expect(editForIcon("auto", "x")).toEqual({ set: {}, unset: ["icon"] });
    expect(editForIcon("none", "x")).toEqual({ set: { icon: false }, unset: [] });
    expect(editForIcon("image", " logo.png ")).toEqual({ set: { icon: "logo.png" }, unset: [] });
    expect(editForIcon("image", "  ")).toBeNull();
  });
});

describe("background", () => {
  it("reads both spellings with the defaults filled in", () => {
    expect(backgroundFromValue("wall.jpg")).toEqual({ image: "wall.jpg", opacity: 0.15, fit: "cover", rest: {} });
    expect(backgroundFromValue({ image: "wall.jpg", opacity: 0.4, fit: "contain" })).toEqual({ image: "wall.jpg", opacity: 0.4, fit: "contain", rest: {} });
    expect(backgroundFromValue({ image: "wall.jpg", opacity: 7, fit: "tile" })).toEqual({ image: "wall.jpg", opacity: 0.15, fit: "cover", rest: {} });
  });

  it.each([undefined, "", { opacity: 0.2 }, { image: "  " }, 3])("reads %j as none", (value) => {
    expect(backgroundFromValue(value)).toBeNull();
  });

  it("writes the bare string for the defaults, and only what differs otherwise", () => {
    expect(editForBackground({ image: "wall.jpg", opacity: 0.15, fit: "cover", rest: {} })).toEqual({ set: { backgroundImage: "wall.jpg" }, unset: [] });
    expect(editForBackground({ image: "wall.jpg", opacity: 0.3, fit: "cover", rest: {} })).toEqual({
      set: { backgroundImage: { image: "wall.jpg", opacity: 0.3 } },
      unset: [],
    });
    expect(editForBackground({ image: "wall.jpg", opacity: 0.15, fit: "contain", rest: {} })).toEqual({
      set: { backgroundImage: { image: "wall.jpg", fit: "contain" } },
      unset: [],
    });
    expect(editForBackground(null)).toEqual({ set: {}, unset: ["backgroundImage"] });
  });

  it("carries fields it does not edit through a save, which then keeps the object spelling", () => {
    const read = backgroundFromValue({ image: "wall.jpg", position: "top" });
    expect(read).toEqual({ image: "wall.jpg", opacity: 0.15, fit: "cover", rest: { position: "top" } });
    expect(read && editForBackground({ ...read, fit: "contain" })).toEqual({
      set: { backgroundImage: { position: "top", image: "wall.jpg", fit: "contain" } },
      unset: [],
    });
    expect(read && editForBackground(read)).toEqual({ set: { backgroundImage: { position: "top", image: "wall.jpg" } }, unset: [] });
  });

  it("refuses a picture-less or out-of-range background rather than writing it", () => {
    expect(editForBackground({ image: " ", opacity: 0.2, fit: "cover", rest: {} })).toBeNull();
    expect(editForBackground({ image: "wall.jpg", opacity: 0, fit: "cover", rest: {} })).toBeNull();
  });
});

describe("sounds", () => {
  it("tells a shipped preset from a file", () => {
    expect(soundChoice("preset:coin")).toEqual({ kind: "preset", ref: "preset:coin" });
    expect(soundChoice("sounds/ding.mp3")).toEqual({ kind: "file", path: "sounds/ding.mp3" });
    expect(soundChoice("preset:no-such-preset")).toEqual({ kind: "file", path: "preset:no-such-preset" });
  });

  it("keeps only known kinds with a value", () => {
    expect(soundsFromValue({ waiting: "preset:coin", finished: "", bogus: "a.mp3", "command-done": 3 })).toEqual({ waiting: "preset:coin" });
    expect(soundsFromValue(null)).toEqual({});
  });

  it("sets one kind and keeps the rest, and removes it for an empty value", () => {
    expect(withDirKindSound({ waiting: "a.mp3" }, "finished", "preset:coin")).toEqual({ waiting: "a.mp3", finished: "preset:coin" });
    expect(withDirKindSound({ waiting: "a.mp3", finished: "b.mp3" }, "waiting", "")).toEqual({ finished: "b.mp3" });
  });
});
