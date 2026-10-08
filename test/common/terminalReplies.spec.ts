// @vitest-environment node
// The emulator answers the application's queries on the input channel, and those answers look
// exactly like typing. Counting them as typing refused every answer from the question pane after
// any attach, resize or theme read (#1693). The samples below were CAPTURED from a real cell.
import { describe, it, expect } from "vitest";
import { scanForUserInput } from "../../common/terminalReplies";

const ESC = "\u001b";
const scan = (data: string, pending = "") => scanForUserInput(pending, data);

describe("scanForUserInput", () => {
  it("does not read the replies a real cell sent before a single button press as typing", () => {
    expect(scan(`${ESC}[?1;2c`).fromUser).toBe(false); // primary device attributes
    expect(scan(`${ESC}[>0;276;0c`).fromUser).toBe(false); // secondary device attributes
    expect(scan(`${ESC}]10;rgb:1b1b/2424/3030${ESC}\\`).fromUser).toBe(false); // foreground colour
    expect(scan(`${ESC}]11;rgb:f4f4/f6f6/fbfb${ESC}\\`).fromUser).toBe(false); // background colour
  });

  it("does not read focus or cursor-position reports as typing", () => {
    expect(scan(`${ESC}[I`).fromUser).toBe(false);
    expect(scan(`${ESC}[O`).fromUser).toBe(false);
    expect(scan(`${ESC}[24;80R`).fromUser).toBe(false);
  });

  // Every other reply xterm.js 6 writes from `triggerDataEvent`, spelled the way it writes them.
  it("does not read the rest of xterm.js's replies as typing", () => {
    [
      `${ESC}[?24;80R`, // DEC private cursor position
      `${ESC}[0n`, // device status
      `${ESC}[?2026;2$y`, // private mode report
      `${ESC}[4;2$y`, // ANSI mode report
      `${ESC}[4;600;800t`, // text area in pixels
      `${ESC}[6;17;9t`, // cell in pixels
      `${ESC}[8;24;80t`, // text area in cells
      `${ESC}]4;1;rgb:cdcd/3131/3131${ESC}\\`, // palette colour
      `${ESC}P1$r0m${ESC}\\`, // setting report: SGR
      `${ESC}P1$r2 q${ESC}\\`, // setting report: cursor style
      `${ESC}P0$r${ESC}\\`, // setting report: invalid request
    ].forEach((reply) => expect(scan(reply)).toEqual({ fromUser: false, pending: "" }));
  });

  it("holds a mode report split before its final letter", () => {
    const first = scan(`${ESC}[?2026;2$`);
    expect(first).toEqual({ fromUser: false, pending: `${ESC}[?2026;2$` });
    expect(scan("y", first.pending)).toEqual({ fromUser: false, pending: "" });
  });

  it("still reads keys that share a reply's first bytes as typing", () => {
    [`${ESC}[1;5C`, `${ESC}[3~`, `${ESC}[15;2~`, `${ESC}[27;5;9~`, `${ESC}[97;5u`, `${ESC}P`, `${ESC}[200~text${ESC}[201~`].forEach((key) =>
      expect(scan(key).fromUser).toBe(true),
    );
  });

  // The other half, and the one that must not slip: these ARE the user answering.
  it("reads anything a person could have typed as typing", () => {
    expect(scan("a").fromUser).toBe(true);
    expect(scan("\r").fromUser).toBe(true);
    expect(scan("おした").fromUser).toBe(true);
    expect(scan(`${ESC}[B`).fromUser).toBe(true); // Down, normal cursor mode
    expect(scan(`${ESC}OB`).fromUser).toBe(true); // Down, application cursor mode — captured
  });

  // A click can select an option, so it is the user answering — however much it looks like a report.
  it("reads mouse reports as the user", () => {
    expect(scan(`${ESC}[<0;12;34M`).fromUser).toBe(true);
    expect(scan(`${ESC}[M\u0020\u0021\u0022`).fromUser).toBe(true);
  });

  it("reads a chunk that carries both a reply and a keystroke as typing", () => {
    expect(scan(`${ESC}[?1;2cx`).fromUser).toBe(true);
  });

  // THE SPLIT. The socket breaks where it likes, and half a reply matches nothing — which is how
  // this same false alarm comes back through the back door.
  it("holds an unfinished reply instead of calling it typing", () => {
    const first = scan(`${ESC}[?1`);
    expect(first).toEqual({ fromUser: false, pending: `${ESC}[?1` });

    expect(scan(";2c", first.pending)).toEqual({ fromUser: false, pending: "" });
  });

  it("holds an unfinished colour reply across three chunks", () => {
    const a = scan(`${ESC}]11;rgb:f4f4`);
    expect(a.fromUser).toBe(false);
    const b = scan("/f6f6/fbfb", a.pending);
    expect(b.fromUser).toBe(false);
    expect(scan(`${ESC}\\`, b.pending)).toEqual({ fromUser: false, pending: "" });
  });

  // Held only while it could still BECOME a reply: a key that already carries its final letter is
  // finished, and waiting for more would let a real answer slip past unnoticed.
  it("does not hold a keystroke that merely starts like one", () => {
    expect(scan(`${ESC}[B`).pending).toBe("");
    expect(scan("x", `${ESC}[?1`).fromUser).toBe(true); // the tail turned out not to be a reply
  });

  // Escape is how the dialog is CANCELLED. Holding it would let a paced answer carry on typing into
  // a question the user had just dismissed.
  it("reads a lone Escape as the user, never as an unfinished reply", () => {
    expect(scan(ESC)).toEqual({ fromUser: true, pending: "" });
  });

  it("has nothing to report for an empty chunk", () => {
    expect(scan("")).toEqual({ fromUser: false, pending: "" });
  });
});
