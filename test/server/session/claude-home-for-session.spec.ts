// @vitest-environment node
//
// Which `~/.claude`-shaped directory a session's transcript actually lives under (project-dir.ts).
// Getting this wrong for a session on a configured account (common/accounts.ts) is not cosmetic:
// every transcript read below it — sessionExistsOnDisk, readSessionSummary — looks in the wrong
// place, which for the resume decision specifically means a real, on-disk conversation reads as
// "not there yet" and a brand new session is minted in its place, discarding it entirely.
import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import type { Account } from "../../../common/accounts.js";

// vi.mock's factory is hoisted above every other statement, so the state it closes over has to be
// too — a plain top-level `const` here reproduces the exact TDZ bug this same fix just found (and
// corrected) in ws-restart-reattach.spec.ts.
const mocks = vi.hoisted(() => ({
  accountSessions: new Map<string, string>(),
  configuredAccounts: [] as Account[],
}));

vi.mock("../../../server/session/registry.js", () => ({ accountSessions: mocks.accountSessions }));
vi.mock("../../../server/config/config-routes.js", () => ({ getAccounts: () => mocks.configuredAccounts }));

const { claudeHomeForSession } = await import("../../../server/session/project-dir.js");

const WORK: Account = { id: "work", label: "Work", configDir: "~/.claude-work" };

beforeEach(() => {
  mocks.accountSessions.clear();
  mocks.configuredAccounts = [];
});

describe("claudeHomeForSession", () => {
  it("is undefined for a session on no account, so callers fall back to the plain default", () => {
    expect(claudeHomeForSession("11111111-1111-4111-8111-111111111111")).toBeUndefined();
  });

  it("expands a configured account's own configDir, tilde and all", () => {
    mocks.accountSessions.set("s1", "work");
    mocks.configuredAccounts = [WORK];
    expect(claudeHomeForSession("s1")).toBe(path.join(os.homedir(), ".claude-work"));
  });

  it("is undefined when the recorded account no longer exists in the config", () => {
    mocks.accountSessions.set("s1", "deleted");
    mocks.configuredAccounts = [];
    expect(claudeHomeForSession("s1")).toBeUndefined();
  });

  it("does not confuse one session's account with another's", () => {
    mocks.accountSessions.set("s1", "work");
    mocks.configuredAccounts = [WORK];
    expect(claudeHomeForSession("s2")).toBeUndefined();
  });
});
