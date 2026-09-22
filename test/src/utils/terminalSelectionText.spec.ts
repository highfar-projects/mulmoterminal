import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Terminal } from "@xterm/xterm";
import { dewrappedSelection } from "../../../src/utils/terminalSelectionText";

// xterm's Terminal.open() reaches for browser APIs jsdom omits; stub the few it needs (same
// stub as terminalMouseInput.spec.ts, which opens a real xterm for the same reason).
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// A real, DOM-attached Terminal: dewrappedSelection reads xterm's own SelectionService
// (getSelection/getSelectionPosition), which only exists once a terminal has been opened — a
// headless one (as headlessScreen.spec.ts uses server-side) has no selection support at all.
let term: Terminal | undefined;

const write = (t: Terminal, data: string) => new Promise<void>((resolve) => t.write(data, resolve));

const openTerminal = async (cols: number, buffer: string): Promise<Terminal> => {
  term = new Terminal({ cols, rows: 10 });
  term.open(document.createElement("div"));
  await write(term, buffer);
  return term;
};

afterEach(() => {
  term?.dispose();
  term = undefined;
});

describe("dewrappedSelection", () => {
  it("leaves a single-row selection untouched", async () => {
    const t = await openTerminal(20, "hello world");
    t.select(0, 0, 5);
    expect(dewrappedSelection(t)).toBe("hello");
  });

  // A genuine terminal autowrap: the row is marked isWrapped, and xterm's own text already
  // joins it with nothing — this must keep working exactly as before.
  it("keeps xterm's own join for a real hardware wrap", async () => {
    const t = await openTerminal(5, "abcdefghij"); // wraps after 5 cols with no CR/LF at all
    t.select(0, 0, 10);
    expect(dewrappedSelection(t)).toBe("abcdefghij");
  });

  // The bug this exists to fix: a CLI that computes its own wrap and sends a real CR/LF, with
  // no space to eat, right where a row happened to be full. That row is NOT marked isWrapped by
  // xterm (a real line break was sent), so xterm's own getSelection() would join with "\n" — the
  // literal newline the user reported.
  it("drops the newline where a hard-wrapped row ran flush to the terminal's width", async () => {
    const t = await openTerminal(10, "0123456789\r\nabcde"); // row 0 fills all 10 columns, then a REAL break
    t.select(0, 0, 15); // row 0 (10, full) + "abcde" (5) on row 1
    expect(dewrappedSelection(t)).toBe("0123456789abcde");
  });

  // A genuine paragraph break must still read as one: the row above it did NOT run to the
  // terminal's edge, so there was room to spare — the CLI chose to break there, not forced to.
  it("keeps a real line break when the row above had room to spare", async () => {
    const t = await openTerminal(20, "short line\r\nnext line");
    t.select(0, 0, 29); // row 0 (20, counted in full) + "next line" (9) on row 1

    expect(dewrappedSelection(t)).toBe("short line\nnext line");
  });

  // Three rows: a hard wrap into a real line break, immediately followed by an intentional
  // blank-line-free paragraph break — each boundary must be judged on its own row.
  it("judges each wrap boundary independently across more than two rows", async () => {
    const t = await openTerminal(10, "0123456789\r\nshort\r\nend");
    t.select(0, 0, 23); // row 0 (10, full) + row 1 (10, counted in full) + "end" (3) on row 2
    expect(dewrappedSelection(t)).toBe("0123456789short\nend");
  });
});
