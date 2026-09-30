// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimSeenVersion, readLastSeenVersion } from "../../../server/whatsNew/state.js";

let home: string;
let savedHome: string | undefined;

beforeEach(() => {
  savedHome = process.env.MULMOTERMINAL_HOME;
  home = mkdtempSync(path.join(os.tmpdir(), "whats-new-home-"));
  process.env.MULMOTERMINAL_HOME = home;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.MULMOTERMINAL_HOME;
  else process.env.MULMOTERMINAL_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
});

const stateFile = () => path.join(home, "whats-new.json");

describe("whats-new state", () => {
  it("is null before anything was recorded", async () => {
    expect(await readLastSeenVersion()).toBeNull();
  });

  it("answers null on the first claim and records the version", async () => {
    expect(await claimSeenVersion("7.1.0")).toBeNull();
    expect(await readLastSeenVersion()).toBe("7.1.0");
    expect(JSON.parse(readFileSync(stateFile(), "utf-8"))).toEqual({ lastSeenVersion: "7.1.0" });
  });

  it("answers what was recorded before, moving forward and never back", async () => {
    await claimSeenVersion("7.1.0");
    expect(await claimSeenVersion("7.0.0")).toBe("7.1.0");
    expect(await readLastSeenVersion()).toBe("7.1.0");
    expect(await claimSeenVersion("7.2.0")).toBe("7.1.0");
    expect(await claimSeenVersion("7.2.0")).toBe("7.2.0");
  });

  it("keeps the newest version when writers race", async () => {
    const RACES = 20;
    const race = async (): Promise<string | null> => {
      rmSync(stateFile(), { force: true });
      await Promise.all([claimSeenVersion("7.2.0"), claimSeenVersion("7.1.0"), claimSeenVersion("7.0.0")]);
      return readLastSeenVersion();
    };
    // One race at a time, each from an empty file.
    const outcomes = await Array.from({ length: RACES }).reduce<Promise<Array<string | null>>>(
      async (done) => [...(await done), await race()],
      Promise.resolve([]),
    );
    expect(new Set(outcomes)).toEqual(new Set(["7.2.0"]));
  });

  it("lets exactly one of several simultaneous claims see the older version", async () => {
    const RACES = 20;
    const race = async (): Promise<number> => {
      writeFileSync(stateFile(), JSON.stringify({ lastSeenVersion: "7.0.0" }));
      const answers = await Promise.all([claimSeenVersion("7.1.0"), claimSeenVersion("7.1.0"), claimSeenVersion("7.1.0")]);
      return answers.filter((answer) => answer === "7.0.0").length;
    };
    const counts = await Array.from({ length: RACES }).reduce<Promise<number[]>>(async (done) => [...(await done), await race()], Promise.resolve([]));
    expect(new Set(counts)).toEqual(new Set([1]));
  });

  it.each([["not json"], ["[]"], ['{"lastSeenVersion": 7}'], ["null"]])("treats %j as nothing recorded", async (content) => {
    writeFileSync(stateFile(), content);
    expect(await readLastSeenVersion()).toBeNull();
  });

  it("overwrites a corrupt file", async () => {
    writeFileSync(stateFile(), "not json");
    await claimSeenVersion("7.1.0");
    expect(await readLastSeenVersion()).toBe("7.1.0");
  });
});
