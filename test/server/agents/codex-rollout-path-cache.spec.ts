// @vitest-environment node
//
// The remembered rollout path (#2122).
//
// Resolving an id walks every day directory under $CODEX_HOME/sessions with readdirSync — 11 ms
// over the 84 day directories on the machine this was measured on, synchronous, on the event loop.
// /api/session/:id asks for the same id every few seconds per codex cell, so the repetition is what
// costs, not the first answer.
//
// What is pinned here is the part that is NOT obvious from the cache working: that a miss is never
// remembered (a rollout codex has not written yet must not read as absent forever), that a pruned
// rollout stops resolving rather than being served from memory, and that the map is bounded.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearRolloutPathCache, codexRolloutPath, pathCacheSize } from "../../../server/agents/codex-sessions";

const ID = "01a0b1ce-52ce-7ee3-96b3-6ae19313a77b";
let root = "";

const dayDir = (day: string) => path.join(root, "2026", "09", day);
const rolloutIn = (day: string, id: string = ID) => path.join(dayDir(day), `rollout-2026-09-${day}T08-58-04-${id}.jsonl`);

async function writeRollout(day: string, id: string = ID): Promise<string> {
  await fs.mkdir(dayDir(day), { recursive: true });
  const file = rolloutIn(day, id);
  await fs.writeFile(file, `${JSON.stringify({ type: "session_meta", payload: { id } })}\n`);
  return file;
}

beforeEach(async () => {
  clearRolloutPathCache();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "mt-rollout-cache-"));
});
afterEach(async () => {
  clearRolloutPathCache();
  await fs.rm(root, { recursive: true, force: true });
});

describe("codexRolloutPath", () => {
  it("finds the rollout, and answers the same path again", async () => {
    const file = await writeRollout("18");
    expect(codexRolloutPath(root, ID)).toBe(file);
    expect(codexRolloutPath(root, ID)).toBe(file);
  });

  // The assertion that the second answer came from MEMORY rather than from a second walk. A rescan
  // would find the newer day first (dayDirsDesc), so the remembered path is the only way to get the
  // older one back. Two rollouts sharing an id cannot really happen — codex mints them — so this is
  // a probe, and it documents which answer the memo gives if it ever did.
  it("answers from memory rather than walking the store again", async () => {
    const first = await writeRollout("10");
    expect(codexRolloutPath(root, ID)).toBe(first);
    await writeRollout("20");
    expect(codexRolloutPath(root, ID)).toBe(first);
  });

  // The failure `rolloutMeta` in the same file records twice: a session whose rollout codex has not
  // written YET is the ordinary state of a cell that has just started, and remembering "absent"
  // would hide that conversation until the process restarted.
  it("never remembers a miss, so a rollout written later is still found", async () => {
    expect(codexRolloutPath(root, ID)).toBeNull();
    expect(pathCacheSize()).toBe(0);
    const file = await writeRollout("18");
    expect(codexRolloutPath(root, ID)).toBe(file);
  });

  // codex prunes rollouts and whole day directories. A remembered path is re-checked, not trusted.
  it("stops answering once the rollout is pruned", async () => {
    const file = await writeRollout("18");
    expect(codexRolloutPath(root, ID)).toBe(file);
    await fs.rm(file);
    expect(codexRolloutPath(root, ID)).toBeNull();
  });

  // And re-resolves rather than staying null, if the same id turns up again.
  it("re-resolves after a prune when the id reappears", async () => {
    await writeRollout("18");
    codexRolloutPath(root, ID);
    await fs.rm(rolloutIn("18"));
    expect(codexRolloutPath(root, ID)).toBeNull();
    const again = await writeRollout("19");
    expect(codexRolloutPath(root, ID)).toBe(again);
  });

  it("stays bounded — nothing here prunes, so the map must not grow with every id ever resolved", async () => {
    const hex = (n: number) => n.toString(16).padStart(12, "0");
    for (let i = 0; i < 600; i++) {
      const id = `01a0b1ce-52ce-7ee3-96b3-${hex(i)}`;
      await writeRollout("18", id);
      expect(codexRolloutPath(root, id)).not.toBeNull();
    }
    expect(pathCacheSize()).toBeLessThanOrEqual(512);
  });

  it("keys on the root, so two stores cannot answer for each other", async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "mt-rollout-cache-other-"));
    try {
      const file = await writeRollout("18");
      expect(codexRolloutPath(root, ID)).toBe(file);
      expect(codexRolloutPath(other, ID)).toBeNull();
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });
});
