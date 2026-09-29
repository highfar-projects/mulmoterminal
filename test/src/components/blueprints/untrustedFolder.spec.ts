// Where a stopped step asks the person to answer Claude Code's trust prompt: the folder its notice names, from either
// place a notice is kept, and nowhere for any other reason.
import { describe, it, expect } from "vitest";
import { untrustedFolder } from "../../../../src/components/blueprints/stepNoticeText";
import type { StepState } from "../../../../common/blueprint/state";

const failed = (extra: Partial<StepState>): StepState => ({ status: "failed", approved: false, answers: [], ...extra });
const check = (notice: StepState["reasonNotice"]): StepState["lastCheck"] => ({ ok: false, output: "English", atMs: 1, ...(notice ? { notice } : {}) });

describe("untrustedFolder", () => {
  it("is the folder a failed check's notice names", () => {
    expect(untrustedFolder(failed({ lastCheck: check({ code: "untrusted", dir: "/w/a" }) }))).toBe("/w/a");
  });

  it("is the folder a stop reason's notice names, even when the check says something else", () => {
    expect(untrustedFolder(failed({ reasonNotice: { code: "untrusted", dir: "/w/b" }, lastCheck: check({ code: "session-lost" }) }))).toBe("/w/b");
    expect(untrustedFolder(failed({ reasonNotice: { code: "session-lost" }, lastCheck: check({ code: "untrusted", dir: "/w/c" }) }))).toBe("/w/c");
  });

  it("is null for any other notice, a check without one, no state at all", () => {
    expect(untrustedFolder(failed({ lastCheck: check({ code: "folder-busy", runId: "run-1" }) }))).toBeNull();
    expect(untrustedFolder(failed({ lastCheck: check(undefined) }))).toBeNull();
    expect(untrustedFolder(failed({}))).toBeNull();
    expect(untrustedFolder(undefined)).toBeNull();
  });
});
