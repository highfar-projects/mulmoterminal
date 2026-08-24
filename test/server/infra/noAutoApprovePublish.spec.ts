// @vitest-environment node
//
// `manageSharedApp` publishes to the internet, rewrites the roster, and hands the roster live
// records. The agent that calls it is reading untrusted text out of the same repository — skill
// files, collection notes, survey copy somebody pasted. So it keeps the permission prompt on
// every session, and these tests are what keep it there.
import { describe, it, expect } from "vitest";
import { allowedToolNames, autoAllowedToolNames } from "../../../server/infra/plugins-registry.js";
import { AUTO_ALLOWED_TOOLS, NEVER_AUTO_APPROVED_TOOLS, groupOfTool } from "../../../common/toolGroups.js";

describe("auto-approval never covers manageSharedApp", () => {
  // The workspace passes the WHOLE list to --allowedTools. That is the session a shared app is
  // actually built in, so it is the one that mattered — and the one that used to wave it through.
  it("keeps it out of the workspace's --allowedTools", () => {
    const names = allowedToolNames();
    expect(names).toContain("mcp__mt__presentChart");
    expect(names.some((name) => name.endsWith("__manageSharedApp"))).toBe(false);
  });

  // The OTHER half of the pair, and the one CI would not have missed if it had been dropped from
  // the list: `useSharedApp` moves records in an app somebody else published, and `withdraw`
  // deletes a person's row with no undo. Same prompt, and — because the model is one tool with many
  // `action`s — approving it once covers `describe` and `withdraw` alike.
  it("keeps useSharedApp out of both lists as well", () => {
    expect(groupOfTool("useSharedApp")).toBe("external");
    expect(allowedToolNames().some((name) => name.endsWith("__useSharedApp"))).toBe(false);
    expect(allowedToolNames("external").some((name) => name.endsWith("__useSharedApp"))).toBe(false);
    expect(autoAllowedToolNames().some((name) => name.endsWith("__useSharedApp"))).toBe(false);
    // The group is still reachable — its other tools are listed.
    expect(allowedToolNames("external").some((name) => name.endsWith("__google"))).toBe(true);
  });

  it("keeps it out of every per-group list too", () => {
    const group = groupOfTool("manageSharedApp");
    expect(group).toBe("data");
    const names = allowedToolNames("data");
    // The group is still reachable — its other tools are listed.
    expect(names.some((name) => name.endsWith("__manageCollection"))).toBe(true);
    expect(names.some((name) => name.endsWith("__manageSharedApp"))).toBe(false);
  });

  it("keeps it out of a grid cell's list", () => {
    expect(autoAllowedToolNames().some((name) => name.endsWith("__manageSharedApp"))).toBe(false);
  });

  // The two lists answer different questions and must not overlap: one names what may run
  // unattended, the other what may never.
  it("never lists a tool as both auto-allowed and never-auto-approved", () => {
    for (const name of NEVER_AUTO_APPROVED_TOOLS) {
      expect(AUTO_ALLOWED_TOOLS).not.toContain(name);
    }
  });
});
