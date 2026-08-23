// @vitest-environment node
//
// The disk half. What matters here is not that a write lands — it is what a caller is told when
// one does not, and that a campaign id can never reach outside the directory it names.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendCampaignRecord, campaignFile, campaignsDir, isCampaignId, listCampaigns, readCampaign } from "../../../server/campaign/campaign-store.js";
import { foldCampaignLog, type CampaignRecord } from "../../../server/campaign/campaign-log.js";

let home: string;
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.MULMOTERMINAL_HOME;
  home = mkdtempSync(path.join(tmpdir(), "mt-campaign-"));
  process.env.MULMOTERMINAL_HOME = home;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MULMOTERMINAL_HOME;
  else process.env.MULMOTERMINAL_HOME = saved;
  rmSync(home, { recursive: true, force: true });
});

/** An existing campaign file with its permissions taken away, and the path back to restore them. */
function lockedFile(campaign: string, mode: number): string {
  mkdirSync(campaignsDir(), { recursive: true });
  const file = campaignFile(campaign);
  if (file === null) throw new Error("unreachable");
  writeFileSync(file, "", "utf8");
  chmodSync(file, mode);
  return file;
}

const intent: CampaignRecord = { kind: "intent", at: 1, task: "t1", attempt: 1, event: "accept" };
const settled: CampaignRecord = { kind: "settled", at: 2, task: "t1", attempt: 1, event: "accept", phase: "planned" };

describe("where a campaign lives", () => {
  it("follows MULMOTERMINAL_HOME, like everything else this app persists", () => {
    expect(campaignsDir()).toBe(path.join(home, "campaigns"));
  });

  it("keeps the records outside every clone and outside the repository tree", () => {
    // Not decoration: a task that touches this directory is then outside its claimed paths, so
    // the merge gate rejects it.
    expect(path.relative(home, campaignsDir()).startsWith("..")).toBe(false);
    expect(campaignsDir()).not.toContain(process.cwd());
  });

  it.each(["lint-2026", "a", "a1", "x".repeat(64)])("accepts %s as an id", (id) => {
    expect(isCampaignId(id)).toBe(true);
    expect(campaignFile(id)).toBe(path.join(campaignsDir(), `${id}.jsonl`));
  });

  // The id check is the whole path defence, so it is checked in both directions.
  it.each([
    ["a parent traversal", "../escape"],
    ["an absolute path", "/etc/passwd"],
    ["a nested path", "a/b"],
    ["a windows separator", "a\\b"],
    ["a dot", "a.b"],
    ["a leading hyphen", "-lead"],
    ["an upper-case letter", "Lint"],
    ["a shouted id", "LINT"],
    ["one upper-case letter in the middle", "lintX"],
    ["empty", ""],
    ["too long", "x".repeat(65)],
    ["a null byte", "a\u0000b"],
    ["a newline", "a\nb"],
  ])("refuses %s", (_label, id) => {
    expect(isCampaignId(id)).toBe(false);
    expect(campaignFile(id)).toBeNull();
  });

  it.each([null, undefined, 7, {}, ["a"]])("refuses %o, which is not a string at all", (id) => {
    expect(isCampaignId(id)).toBe(false);
  });
});

// A case-insensitive filesystem — the default on macOS and Windows — is what makes this worth a
// rule rather than a preference: two spellings would be one file, so two campaigns would append
// into one log and `listCampaigns()` would report whichever spelling the directory happened to
// keep. Rejecting the variant outright is the only answer that does not depend on the platform.
describe("case", () => {
  it("admits one spelling of an id, so two campaigns cannot share one log", () => {
    expect(isCampaignId("lint")).toBe(true);
    expect(isCampaignId("Lint")).toBe(false);
    expect(campaignFile("Lint")).toBeNull();
    expect(appendCampaignRecord("Lint", intent)).toBe(false);
  });

  it("leaves a lower-case campaign untouched by a shouted one", () => {
    appendCampaignRecord("lint", intent);
    appendCampaignRecord("LINT", settled);
    expect(readCampaign("lint")).toEqual([intent]);
    expect(listCampaigns()).toEqual(["lint"]);
  });
});

describe("reading and appending", () => {
  it("reads a campaign nobody has written as empty", () => {
    expect(readCampaign("fresh")).toEqual([]);
  });

  it("reads back what it appended, in order", () => {
    expect(appendCampaignRecord("c1", intent)).toBe(true);
    expect(appendCampaignRecord("c1", settled)).toBe(true);
    expect(readCampaign("c1")).toEqual([intent, settled]);
  });

  it("creates the directory on the first append", () => {
    expect(existsSync(campaignsDir())).toBe(false);
    appendCampaignRecord("c1", intent);
    expect(existsSync(campaignsDir())).toBe(true);
  });

  it("refuses an id that is not one, rather than writing somewhere unintended", () => {
    expect(appendCampaignRecord("../escape", intent)).toBe(false);
    expect(readCampaign("../escape")).toEqual([]);
    expect(existsSync(path.join(home, "..", "escape.jsonl"))).toBe(false);
  });

  // The difference from `postToRoom`, which tolerates a failed append: a lost message is a lost
  // message, while a lost intent is a side effect nobody can reconcile afterwards.
  //
  // Not on Windows, and not as root, for the reason rooms.spec.ts records (#1484): chmod there
  // moves the read-only attribute and nothing else, and root ignores the bit — so the write this
  // test needs to fail simply succeeds.
  it.skipIf(process.platform === "win32")("reports a failed append, so a caller can decline to cause the effect", () => {
    const file = lockedFile("locked", 0o400);
    try {
      if (process.getuid?.() !== 0) expect(appendCampaignRecord("locked", intent)).toBe(false);
    } finally {
      chmodSync(file, 0o600);
    }
  });

  // Different answers for different questions: "nothing has been recorded" and "I could not find
  // out" must not look alike, or a restart resumes a campaign whose tasks are really mid-flight.
  it.skipIf(process.platform === "win32")("throws when a campaign exists but cannot be read", () => {
    const file = lockedFile("unreadable", 0o000);
    try {
      if (process.getuid?.() !== 0) expect(() => readCampaign("unreadable")).toThrow();
    } finally {
      chmodSync(file, 0o600);
    }
  });

  it("survives a file that was cut off mid-append", () => {
    appendCampaignRecord("c1", intent);
    const file = campaignFile("c1");
    if (file === null) throw new Error("unreachable");
    const whole = readFileSync(file, "utf8");
    writeFileSync(file, whole + '\n{"kind":"settled","at":2,"task', "utf8");
    expect(readCampaign("c1")).toEqual([intent]);
  });
});

// The return value is a promise to the caller: `true` means "this will be here after a restart",
// and the caller acts on it by causing a side effect nobody can undo. `CampaignRecord` is looser
// than the file format, so the promise has to be checked rather than assumed.
describe("what append refuses to promise", () => {
  // Typed as `CampaignRecord` so the compiler agrees these are records a caller could really hand
  // over: the point is that the TYPE admits them and the FORMAT does not.
  const unwritable: [string, CampaignRecord][] = [
    ["attempt zero", { kind: "intent", at: 1, task: "t1", attempt: 0, event: "accept" }],
    ["a fractional attempt", { kind: "intent", at: 1, task: "t1", attempt: 1.5, event: "accept" }],
    ["a timestamp JSON cannot carry", { kind: "intent", at: Number.POSITIVE_INFINITY, task: "t1", attempt: 1, event: "accept" }],
    ["a NaN timestamp", { kind: "intent", at: Number.NaN, task: "t1", attempt: 1, event: "accept" }],
  ];

  it.each(unwritable)("refuses %s rather than writing something the reader drops", (_label, record) => {
    expect(appendCampaignRecord("c1", record)).toBe(false);
    expect(readCampaign("c1")).toEqual([]);
  });

  it("promises only what comes back identical", () => {
    expect(appendCampaignRecord("c1", intent)).toBe(true);
    expect(readCampaign("c1")).toEqual([intent]);
  });

  // Durability itself is not unit-testable — it needs a power cut — so what is pinned here is the
  // reachability of the path that provides it: the first append creates two directories and must
  // still succeed, on every platform, with the record readable afterwards.
  it("still succeeds on the append that creates the directories", () => {
    expect(existsSync(campaignsDir())).toBe(false);
    expect(appendCampaignRecord("c1", intent)).toBe(true);
    expect(readCampaign("c1")).toEqual([intent]);
  });

  // MULMOTERMINAL_HOME can itself be several levels of nothing. Every one of those is a name this
  // append created, so every one is walked — and the walk has to terminate at the first directory
  // that already existed rather than at the root.
  it("still succeeds when the whole home directory had to be created", () => {
    process.env.MULMOTERMINAL_HOME = path.join(home, "deep", "er", "still");
    expect(appendCampaignRecord("c1", intent)).toBe(true);
    expect(readCampaign("c1")).toEqual([intent]);
    expect(listCampaigns()).toEqual(["c1"]);
  });
});

describe("listing what a restart has to reconcile", () => {
  it("lists nothing before any campaign exists", () => {
    expect(listCampaigns()).toEqual([]);
  });

  it("lists the campaigns on disk", () => {
    appendCampaignRecord("c1", intent);
    appendCampaignRecord("c2", intent);
    expect(listCampaigns().sort()).toEqual(["c1", "c2"]);
  });

  it("ignores files that are not campaigns", () => {
    mkdirSync(campaignsDir(), { recursive: true });
    writeFileSync(path.join(campaignsDir(), "notes.txt"), "hello", "utf8");
    writeFileSync(path.join(campaignsDir(), "..sneaky.jsonl"), "", "utf8");
    appendCampaignRecord("real", intent);
    expect(listCampaigns()).toEqual(["real"]);
  });

  // A directory named like a campaign would otherwise be listed and then fail to read as one.
  it("ignores a directory whose name ends in .jsonl", () => {
    mkdirSync(path.join(campaignsDir(), "impostor.jsonl"), { recursive: true });
    appendCampaignRecord("real", intent);
    expect(listCampaigns()).toEqual(["real"]);
  });

  // The half `existsSync` collapses. An empty list here reads as "no campaigns", and a restart
  // that believes it skips reconciliation for tasks that are really mid-flight.
  it.skipIf(process.platform === "win32")("throws when the campaigns directory cannot be read", () => {
    mkdirSync(campaignsDir(), { recursive: true });
    chmodSync(campaignsDir(), 0o000);
    try {
      if (process.getuid?.() !== 0) expect(() => listCampaigns()).toThrow();
    } finally {
      chmodSync(campaignsDir(), 0o700);
    }
  });

  it.skipIf(process.platform === "win32")("throws when a campaign's directory cannot be traversed", () => {
    appendCampaignRecord("c1", intent);
    chmodSync(campaignsDir(), 0o000);
    try {
      if (process.getuid?.() !== 0) expect(() => readCampaign("c1")).toThrow();
    } finally {
      chmodSync(campaignsDir(), 0o700);
    }
  });
});

describe("the round trip a restart actually makes", () => {
  it("recovers an outstanding intent from disk", () => {
    appendCampaignRecord("c1", intent);
    appendCampaignRecord("c1", settled);
    const pending: CampaignRecord = { kind: "intent", at: 3, task: "t1", attempt: 2, event: "lease" };
    appendCampaignRecord("c1", pending);

    const fold = foldCampaignLog(readCampaign("c1"));
    expect(fold.rejected).toEqual([]);
    expect(fold.tasks).toEqual([{ task: "t1", phase: "planned", pending, attempt: 2 }]);
  });
});
