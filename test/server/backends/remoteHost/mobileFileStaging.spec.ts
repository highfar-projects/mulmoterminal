// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createMobileFileStager, MOBILE_FILE_TTL_MS, type StagingStorage } from "../../../../server/backends/remoteHost/mobileFileStaging";

function harness(options: { uid?: string | null; listed?: { storagePath: string; createdAtMs: number }[]; failRemove?: boolean } = {}) {
  const clock = { now: 1_000_000 };
  const uploads: string[] = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  const timers: { run: () => void; delayMs: number }[] = [];
  let ids = 0;
  let lists = 0;
  const storage: StagingStorage = {
    upload: async (storagePath) => {
      uploads.push(storagePath);
    },
    remove: async (storagePath) => {
      if (options.failRemove) throw new Error("denied");
      removed.push(storagePath);
    },
    list: async () => {
      lists += 1;
      return options.listed ?? [];
    },
  };
  const stager = createMobileFileStager({
    storage,
    uid: () => (options.uid === undefined ? "user-1" : options.uid),
    now: () => clock.now,
    newId: () => `id-${++ids}`,
    schedule: (run, delayMs) => timers.push({ run, delayMs }),
    warn: (message) => warnings.push(message),
  });
  return { stager, clock, uploads, removed, warnings, timers, lists: () => lists };
}

const key = { absolutePath: "/p/output/a.pdf", modifiedAtMs: 1, bytes: 3 };
const read = async () => new Uint8Array([1, 2, 3]);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createMobileFileStager", () => {
  it("uploads under the owner's downloads prefix with a random name, and arms deletion at the TTL", async () => {
    const { stager, uploads, timers, clock } = harness();
    const staged = await stager.stage(key, read, "application/pdf");
    expect(staged).toEqual({ storagePath: "users/user-1/downloads/id-1", expiresAtMs: clock.now + MOBILE_FILE_TTL_MS });
    expect(uploads).toEqual(["users/user-1/downloads/id-1"]);
    expect(timers.map((timer) => timer.delayMs)).toEqual([MOBILE_FILE_TTL_MS]);
  });

  it("never puts the file's name or path into Storage", async () => {
    const { stager, uploads } = harness();
    await stager.stage(key, read, "application/pdf");
    expect(uploads.join()).not.toContain("a.pdf");
  });

  it("refuses when the host is not signed in", async () => {
    const { stager, uploads } = harness({ uid: null });
    await expect(stager.stage(key, read, "application/pdf")).rejects.toThrow(/not connected/);
    expect(uploads).toEqual([]);
  });

  it("hands out the same object while it has life left, and a new one near expiry", async () => {
    const { stager, uploads, clock } = harness();
    await stager.stage(key, read, "application/pdf");
    clock.now += MOBILE_FILE_TTL_MS / 2;
    await stager.stage(key, read, "application/pdf");
    expect(uploads).toHaveLength(1);
    clock.now += MOBILE_FILE_TTL_MS / 2 - 1000;
    await stager.stage(key, read, "application/pdf");
    expect(uploads).toHaveLength(2);
  });

  it("treats a changed file as a different object", async () => {
    const { stager, uploads } = harness();
    await stager.stage(key, read, "application/pdf");
    await stager.stage({ ...key, modifiedAtMs: 2 }, read, "application/pdf");
    expect(uploads).toHaveLength(2);
  });

  it("deletes the object when its timer fires, and then uploads afresh", async () => {
    const { stager, uploads, removed, timers } = harness();
    await stager.stage(key, read, "application/pdf");
    timers[0]?.run();
    await settle();
    expect(removed).toEqual(["users/user-1/downloads/id-1"]);
    await stager.stage(key, read, "application/pdf");
    expect(uploads).toHaveLength(2);
  });

  it("sweeps only what is past its hour, and not more often than its interval", async () => {
    const { stager, removed, clock, lists } = harness({
      listed: [
        { storagePath: "users/user-1/downloads/old", createdAtMs: 1_000_000 - MOBILE_FILE_TTL_MS },
        { storagePath: "users/user-1/downloads/fresh", createdAtMs: 1_000_000 - 1 },
        { storagePath: "users/user-1/downloads/unknown", createdAtMs: Number.NaN },
      ],
    });
    await stager.sweepExpired();
    expect(removed).toEqual(["users/user-1/downloads/old"]);
    await stager.sweepExpired();
    expect(lists()).toBe(1);
    clock.now += MOBILE_FILE_TTL_MS;
    await stager.sweepExpired();
    expect(lists()).toBe(2);
  });

  it("warns rather than throws when a delete is refused", async () => {
    const { stager, warnings, timers } = harness({ failRemove: true });
    await stager.stage(key, read, "application/pdf");
    timers[0]?.run();
    await settle();
    expect(warnings.join()).toMatch(/could not delete/);
  });
});
