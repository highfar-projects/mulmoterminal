// @vitest-environment node
// The emulator answers the application's queries on the input channel, and those answers look
// exactly like typing. Counting them as typing refused every answer from the question pane after
// any attach, resize or theme read (#1693). The samples below were CAPTURED from a real cell.
import { describe, it, expect } from "vitest";
import { isTerminalReplyOnly } from "../../common/terminalReplies";

const ESC = "\u001b";

describe("isTerminalReplyOnly", () => {
  it("recognises the replies a real cell sent before a single button press", () => {
    expect(isTerminalReplyOnly(`${ESC}[?1;2c`)).toBe(true); // primary device attributes
    expect(isTerminalReplyOnly(`${ESC}[>0;276;0c`)).toBe(true); // secondary device attributes
    expect(isTerminalReplyOnly(`${ESC}]10;rgb:1b1b/2424/3030${ESC}\\`)).toBe(true); // foreground colour
    expect(isTerminalReplyOnly(`${ESC}]11;rgb:f4f4/f6f6/fbfb${ESC}\\`)).toBe(true); // background colour
  });

  it("recognises focus and cursor-position reports", () => {
    expect(isTerminalReplyOnly(`${ESC}[I`)).toBe(true);
    expect(isTerminalReplyOnly(`${ESC}[O`)).toBe(true);
    expect(isTerminalReplyOnly(`${ESC}[24;80R`)).toBe(true);
  });

  // A mouse report looks the same on the wire but is the USER: a click can select an option, so an
  // answer already being typed has to yield to it exactly as it yields to a keystroke.
  it("does not excuse mouse reports", () => {
    expect(isTerminalReplyOnly(`${ESC}[<0;12;34M`)).toBe(false);
    expect(isTerminalReplyOnly(`${ESC}[M\u0020\u0021\u0022`)).toBe(false);
  });

  // The other half, and the one that must not slip: these ARE the user answering.
  it("does not excuse anything a person could have typed", () => {
    expect(isTerminalReplyOnly("a")).toBe(false);
    expect(isTerminalReplyOnly("\r")).toBe(false);
    expect(isTerminalReplyOnly("おした")).toBe(false);
    expect(isTerminalReplyOnly(`${ESC}[B`)).toBe(false); // Down, normal cursor mode
    expect(isTerminalReplyOnly(`${ESC}OB`)).toBe(false); // Down, application cursor mode — captured
    expect(isTerminalReplyOnly(ESC)).toBe(false);
  });

  it("does not excuse a chunk that also carries a keystroke", () => {
    expect(isTerminalReplyOnly(`${ESC}[?1;2cx`)).toBe(false);
  });

  it("has nothing to excuse in an empty chunk", () => {
    expect(isTerminalReplyOnly("")).toBe(false);
  });
});
