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
import { measureTmuxWidths, settledTmuxWidthTable } from "../../../../server/infra/process/tmuxWidthProbe";
import { spawnCapture } from "../../../../server/infra/process/spawnCapture";
import { TMUX_UNICODE_VERSION, tmuxUnicodeProvider } from "../../../../common/tmuxUnicodeProvider";
import type { TmuxWidthTable } from "../../../../common/tmuxWidthTable";
import { FIXED_WIDTH_SAMPLES, RANDOM_SEED, seededWidthSamples } from "../../../helpers/widthSamples";

const hasTmux = process.platform !== "win32" && spawnCapture("tmux", ["-V"]).status === 0;

const COLUMNS = 120;
const ROWS = 10;
const POLL_MS = 20;
const POLL_LIMIT = 150;
const SETTLE_MS = 150;
const octalEscaped = (text: string): string =>
  Array.from(Buffer.from(text, "utf8"))
    .map((byte) => `\\${byte.toString(8).padStart(3, "0")}`)
    .join("");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const probeTempDirs = () => readdirSync(os.tmpdir()).filter((name) => name.startsWith("mt-w-"));

describe.skipIf(!hasTmux)("the measured table against a real tmux", () => {
  let table: TmuxWidthTable | null = null;
  const probeLog: string[] = [];
  const leftBefore = hasTmux ? probeTempDirs() : [];
  let settledWhileMeasuring: Promise<TmuxWidthTable | null> = Promise.resolve(null);

  beforeAll(async () => {
    const measuring = measureTmuxWidths(
      (line) => probeLog.push(line),
      async () => ({ running: false }),
    );
    settledWhileMeasuring = settledTmuxWidthTable(60_000);
    table = await measuring;
  }, 60_000);

  it("hands a request made while measuring the table it ends with", async () => {
    expect(await settledWhileMeasuring).toEqual(table);
  });

  it("measures something, and leaves no server or directory behind", () => {
    expect(table).not.toBeNull();
    expect(probeTempDirs()).toEqual(leftBefore);
  });

  it("keeps nothing when the running server is another tmux", async () => {
    const log: string[] = [];
    const ownVersion = spawnCapture("tmux", ["-V"])
      .stdout.trim()
      .replace(/^tmux /, "");
    await expect(
      measureTmuxWidths(
        (line) => log.push(line),
        async () => ({ running: true, version: "2.9" }),
      ),
    ).resolves.toBeNull();
    expect(log.join("\n")).toContain(`measured tmux ${ownVersion} but the running server is 2.9`);
    table = await measureTmuxWidths(
      () => undefined,
      async () => ({ running: true, version: ownVersion }),
    );
    expect(table).not.toBeNull();
  }, 60_000);

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
        for (const [index, sample] of [...FIXED_WIDTH_SAMPLES, ...seededWidthSamples(RANDOM_SEED)].entries()) {
          const marker = `#${index}#`;
          tmux(["respawn-pane", "-k", `env printf '${octalEscaped(sample + marker)}'; exec sleep 600`]);
          const tmuxColumn = await markerColumnInTmux(tmux, marker);
          await sleep(SETTLE_MS);
          await new Promise<void>((resolve) => term.write("", resolve));
          const xtermColumn = markerColumnInXterm(term, marker);
          if (xtermColumn !== tmuxColumn) disagreements.push(`${JSON.stringify(sample)}: tmux ${tmuxColumn}, xterm ${xtermColumn}`);
        }
        expect(disagreements, `${spawnCapture("tmux", ["-V"]).stdout.trim()}, folding ${table.folding}; probe: ${probeLog.join(" / ")}`).toEqual([]);
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
