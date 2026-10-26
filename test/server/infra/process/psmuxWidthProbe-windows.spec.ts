// @vitest-environment node
//
// The ground truth for #3180, on Windows with psmux on PATH (skipped everywhere else): psmux's own grid
// draws each row, `#{cursor_x}` says where it ended, and the table the boot probe keeps must predict
// that column. Everything runs on a throwaway server named by `-S`, so the user's psmux is never reached.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { rowWidthOf } from "../../../../common/tmuxClusters";
import type { TmuxWidthTable } from "../../../../common/tmuxWidthTable";
import { psmuxSampleWidth } from "../../../../server/infra/process/psmuxWidthProbe";
import { isPsmuxVersion } from "../../../../server/infra/process/psmux";
import { spawnCapture } from "../../../../server/infra/process/spawnCapture";
import { throwawayTmux } from "../../../../server/infra/process/throwawayTmux";
import { measureTmuxWidths } from "../../../../server/infra/process/tmuxWidthProbe";
import { FIXED_WIDTH_SAMPLES, RANDOM_SEED, seededWidthSamples } from "../../../helpers/widthSamples";

const version = spawnCapture("tmux", ["-V"]);
const hasPsmux = process.platform === "win32" && version.status === 0 && isPsmuxVersion(version.stdout);

describe.skipIf(!hasPsmux)("the psmux table against psmux's own grid", () => {
  let table: TmuxWidthTable | null = null;
  const probeLog: string[] = [];
  const dir = hasPsmux ? mkdtempSync(path.join(os.tmpdir(), "mt-psmux-truth-")) : "";
  const tmux = throwawayTmux(dir);

  beforeAll(async () => {
    table = await measureTmuxWidths(
      (line) => probeLog.push(line),
      async () => ({ running: false }),
      "psmux",
    );
    await tmux.run(["-f", "NUL", "new-session", "-d", "-s", "mt-truth-hold", "-x", "200", "-y", "5", "ping -n 600 127.0.0.1"]);
  }, 120_000);

  afterAll(async () => {
    await tmux.run(["kill-server"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the psmux table", () => {
    expect(table?.folding, probeLog.join(" / ")).toBe("psmux");
  });

  it(`predicts every row where psmux ends it (random seed ${RANDOM_SEED})`, async () => {
    if (!table) throw new Error(`nothing was kept: ${probeLog.join(" / ")}`);
    const kept = table;
    const samples = [...FIXED_WIDTH_SAMPLES, ...seededWidthSamples(RANDOM_SEED)];
    const measured = await Promise.all(samples.map((sample, index) => psmuxSampleWidth(tmux, sample, index)));
    const disagreements = samples.flatMap((sample, index) => {
      const predicted = rowWidthOf(kept, sample);
      return measured[index] === predicted ? [] : [`${JSON.stringify(sample)}: psmux ${measured[index]}, predicted ${predicted}`];
    });
    expect(disagreements, version.stdout.trim()).toEqual([]);
  }, 180_000);
});
