// @vitest-environment node
//
// The ground truth for #3173: a real tmux, a real client attached to it through a PTY, and the bytes
// that client receives fed to xterm counting with the measured table. Where each row's marker lands
// in xterm must be where tmux itself put it (`#{cursor_x}`). A comparison of the provider with its
// own predictions would only show that the two share their assumptions.
//
// Everything runs on a throwaway server named by an absolute `-S` socket, with `$TMUX` removed, so
// the live `-L mulmoterminal` server is never reached. Skipped where there is no tmux.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pty from "node-pty";
import headless from "@xterm/headless";
import { measureTmuxWidths } from "../../../../server/infra/process/tmuxWidthProbe";
import { spawnCapture } from "../../../../server/infra/process/spawnCapture";
import { TMUX_UNICODE_VERSION, tmuxUnicodeProvider } from "../../../../common/tmuxUnicodeProvider";
import type { TmuxWidthTable } from "../../../../common/tmuxWidthTable";

const hasTmux = process.platform !== "win32" && spawnCapture("tmux", ["-V"]).status === 0;

const COLUMNS = 120;
const ROWS = 10;
const POLL_MS = 20;
const POLL_LIMIT = 150;
const SETTLE_MS = 150;
const RANDOM_SEED = 3173;
const RANDOM_SAMPLES = 20;
const CHARACTERS_PER_RANDOM_SAMPLE = 6;
const RANDOM_CODEPOINT_SPAN = 0x1fa00;

const FIXED_SAMPLES = [
  "[✅]",
  "⏺ done",
  "│ ✅ │ ok │",
  "\u{1f468}‍\u{1f469}‍\u{1f467}",
  "\u{1f1ef}\u{1f1f5}\u{1f1fa}",
  "\u{1f44d}\u{1f3fd}\u{1f3fd}",
  "a\u{1f3fd}",
  "☺️x",
  "✅︎x",
  "a‍\u{1f469}b",
  "\u{1f468}‍a",
  "각",
  "あい",
  "\u{1fae0}x",
  "\u{1f93b}x",
  "é́",
  "1️⃣",
  "ℹ️ i",
  "\u{1f3f3}️‍\u{1f308}",
  "\u{1f9d1}\u{1f3fd}‍\u{1f4bb}",
];

// A small fixed-seed generator, so a failing random sample is the same one on every run.
function seededSamples(seed: number): string[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
  return Array.from({ length: RANDOM_SAMPLES }, () =>
    String.fromCodePoint(
      ...Array.from({ length: CHARACTERS_PER_RANDOM_SAMPLE }, () => 0xa0 + Math.floor(next() * RANDOM_CODEPOINT_SPAN)).filter(
        (codepoint) => codepoint < 0xd800 || codepoint > 0xdfff,
      ),
    ),
  );
}

const octalEscaped = (text: string): string =>
  Array.from(Buffer.from(text, "utf8"))
    .map((byte) => `\\${byte.toString(8).padStart(3, "0")}`)
    .join("");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const probeTempDirs = () => readdirSync(os.tmpdir()).filter((name) => name.startsWith("mt-w-"));

describe.skipIf(!hasTmux)("the measured table against a real tmux", () => {
  let table: TmuxWidthTable | null = null;
  const leftBefore = hasTmux ? probeTempDirs() : [];

  beforeAll(async () => {
    table = await measureTmuxWidths(() => {});
  }, 60_000);

  it("measures something, and leaves no server or directory behind", () => {
    expect(table).not.toBeNull();
    expect(probeTempDirs()).toEqual(leftBefore);
  });

  describe("rows drawn through an attached client", () => {
    const dir = hasTmux ? mkdtempSync(path.join(os.tmpdir(), "mt-truth-")) : "";
    // Filtered rather than set to undefined: node-pty would pass "undefined" on as a value.
    const env: NodeJS.ProcessEnv = {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "TMUX" && name !== "TMUX_PANE")),
      TERM: "xterm-256color",
    };
    const tmux = (args: string[]) => spawnCapture("tmux", ["-S", path.join(dir, "s"), ...args], { env });

    afterAll(() => {
      tmux(["kill-server"]);
      rmSync(dir, { recursive: true, force: true });
    });

    it(`puts every marker where tmux did (random seed ${RANDOM_SEED})`, async () => {
      if (!table) throw new Error("nothing was measured");
      tmux(["-f", "/dev/null", "new-session", "-d", "-x", String(COLUMNS), "-y", String(ROWS), "exec sleep 600"]);
      tmux(["set-option", "-g", "status", "off"]);
      const term = new headless.Terminal({ cols: COLUMNS, rows: ROWS, allowProposedApi: true });
      term.unicode.register(tmuxUnicodeProvider(table));
      term.unicode.activeVersion = TMUX_UNICODE_VERSION;
      const client = pty.spawn("tmux", ["-S", path.join(dir, "s"), "attach"], { name: "xterm-256color", cols: COLUMNS, rows: ROWS, env });
      client.onData((data) => term.write(data));
      try {
        const disagreements: string[] = [];
        for (const [index, sample] of [...FIXED_SAMPLES, ...seededSamples(RANDOM_SEED)].entries()) {
          const marker = `#${index}#`;
          tmux(["respawn-pane", "-k", `env printf '${octalEscaped(sample + marker)}'; exec sleep 600`]);
          const tmuxColumn = await markerColumnInTmux(tmux, marker);
          await sleep(SETTLE_MS);
          await new Promise<void>((resolve) => term.write("", resolve));
          const xtermColumn = markerColumnInXterm(term, marker);
          if (xtermColumn !== tmuxColumn) disagreements.push(`${JSON.stringify(sample)}: tmux ${tmuxColumn}, xterm ${xtermColumn}`);
        }
        expect(disagreements).toEqual([]);
      } finally {
        client.kill();
        term.dispose();
      }
    }, 120_000);
  });
});

async function markerColumnInTmux(tmux: (args: string[]) => { stdout: string }, marker: string): Promise<number | null> {
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    if (tmux(["capture-pane", "-p", "-S", "0", "-E", "0"]).stdout.trimEnd().endsWith(marker)) {
      return Number(tmux(["display-message", "-p", "#{cursor_x}"]).stdout.trim()) - marker.length;
    }
    await sleep(POLL_MS);
  }
  return null;
}

function markerColumnInXterm(term: InstanceType<typeof headless.Terminal>, marker: string): number | null {
  const buffer = term.buffer.active;
  const line = buffer.getLine(buffer.viewportY);
  if (!line) return null;
  const cells = Array.from({ length: COLUMNS }, (_, column) => line.getCell(column)?.getChars() ?? "");
  const column = cells.findIndex((_, start) => cells.slice(start, start + marker.length).join("") === marker);
  return column === -1 ? null : column;
}
