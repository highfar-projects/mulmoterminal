// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createHeadlessMirror } from "../../../server/session/headlessMirror.js";

const ESC = String.fromCharCode(0x1b);

// Same CJS/ESM interop trap headlessScreen.ts documents and guards against — see its own spec.
describe("headlessMirror module shape", () => {
  it("imports the emulator as a default, which is what real Node ESM can resolve", () => {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../server/session/headlessMirror.ts"), "utf-8");
    expect(source).toMatch(/import headless from "@xterm\/headless"/);
    expect(source).not.toMatch(/import \{[^}]*Terminal[^}]*\} from "@xterm\/headless"/);
  });
});

describe("createHeadlessMirror", () => {
  it("serializes back what it was fed", async () => {
    const mirror = createHeadlessMirror(40, 5);
    mirror.feed("hello");
    expect(await mirror.serialize()).toContain("hello");
    mirror.dispose();
  });

  // The whole point of this mirror over the bounded replay tail: a TUI paints a row ONCE via
  // cursor addressing, then spends the rest of the session rewriting a different row (a status
  // line) — exactly the pattern plans/fix-1073-redraw-after-reattach.md describes. A byte tail
  // loses the header once its write falls out of the tail's window; the mirror never drops it,
  // because it holds the SCREEN, not the bytes that produced it.
  it("still shows a row painted once, long before a later serialize() call", async () => {
    const mirror = createHeadlessMirror(40, 5);
    mirror.feed("\x1b[1;1Hheader");
    for (let i = 0; i < 50; i++) mirror.feed(`\x1b[3;1Hstatus ${i}`);
    const screen = await mirror.serialize();
    expect(screen).toContain("header");
    expect(screen).toContain("status 49");
    mirror.dispose();
  });

  // Queued writes are processed strictly in order, so the state serialize() reads back is
  // whatever the LAST feed() left, not a race between them.
  it("reflects feeds in the order they were made", async () => {
    const mirror = createHeadlessMirror(40, 5);
    mirror.feed("\x1b[2J\x1b[Hone");
    mirror.feed("\x1b[2J\x1b[Htwo");
    const screen = await mirror.serialize();
    expect(screen).toContain("two");
    expect(screen).not.toContain("one");
    mirror.dispose();
  });

  // A stale bounded-tail replay may have already drawn scrollback, colors or an alternate-buffer
  // switch into the browser's terminal; the reset wipes that clean before the real screen redraws.
  it("prefixes the serialized screen with a hard reset", async () => {
    const mirror = createHeadlessMirror(40, 5);
    mirror.feed("x");
    expect(await mirror.serialize()).toMatch(new RegExp(`^${ESC}c`));
    mirror.dispose();
  });

  it("keeps geometry in step after a resize", async () => {
    const mirror = createHeadlessMirror(10, 5);
    mirror.feed("a".repeat(10) + "b"); // wraps to a second row at 10 columns
    mirror.resize(20, 5);
    mirror.feed("\x1b[2J\x1b[H" + "c".repeat(15)); // now fits on one row at 20 columns
    const screen = await mirror.serialize();
    expect(screen).toContain("c".repeat(15));
    mirror.dispose();
  });

  it("disposes without throwing", () => {
    const mirror = createHeadlessMirror(40, 5);
    mirror.feed("x");
    expect(() => mirror.dispose()).not.toThrow();
  });
});
