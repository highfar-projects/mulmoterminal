// @vitest-environment node
//
// The `defaultAgent` setting (#2082), and — more importantly — the line it must not cross.
//
// "The default agent" names two things in this codebase. One is a PREFERENCE (what a new session
// starts as) and one is a STORAGE FORMAT (an absent `agent` on a stored cell means claude). This
// file pins both, and pins that changing the first does not move the second: the failure that
// would cause is silent and total — every saved Claude cell relaunching as something else.
import { describe, it, expect } from "vitest";
import { FALLBACK_AGENT, newSessionAgent, sanitizeDefaultAgent } from "../../common/defaultAgent.js";
import { storedCellAgent } from "../../src/components/gridTabs.js";
import { asTerminalAgent, TERMINAL_AGENTS } from "../../common/sessionAgent.js";

describe("sanitizeDefaultAgent", () => {
  it.each([...TERMINAL_AGENTS])("accepts %s", (agent) => {
    expect(sanitizeDefaultAgent(agent)).toBe(agent);
  });

  // Everything a config file written before this setting existed contains, plus what a newer or
  // older server could put on the wire.
  it.each([[undefined], [null], [""], ["clyde"], [5], [{}], [[]], [true]])("reads %j as unconfigured", (input) => {
    expect(sanitizeDefaultAgent(input)).toBeNull();
  });
});

describe("newSessionAgent", () => {
  it("starts a new session on the configured agent", () => {
    expect(newSessionAgent("codex")).toBe("codex");
  });

  it("falls back to claude when nothing is configured", () => {
    expect(newSessionAgent(null)).toBe("claude");
    expect(FALLBACK_AGENT).toBe("claude");
  });
});

describe("the storage format is NOT the preference", () => {
  // THE GUARD THIS FILE EXISTS FOR.
  //
  // `storedCellAgent` decides how a cell is written to disk, and claude is written as the ABSENCE
  // of the key so that a cell saved before the field existed reads the same as a Claude cell. If
  // this ever consulted the configured default, every one of those absent-agent cells would come
  // back as whatever the user last set `defaultAgent` to.
  it("still writes claude as an absent field, whatever the default agent is", () => {
    expect(storedCellAgent("claude")).toBeUndefined();
    TERMINAL_AGENTS.filter((a) => a !== "claude").forEach((agent) => {
      expect(storedCellAgent(agent), `${agent} is stored explicitly`).toBe(agent);
    });
  });

  // The read side of the same rule. `asTerminalAgent` is what a persisted cell's `agent` goes
  // through, and an absent one has to resolve to claude — NOT to newSessionAgent(configured).
  it("still reads an absent stored agent as claude", () => {
    expect(asTerminalAgent(undefined)).toBe("claude");
    expect(asTerminalAgent(null)).toBe("claude");
  });

  // Stated as a round trip, because that is the property that actually matters: a cell written as
  // claude comes back as claude, on a machine configured for something else entirely.
  it("round-trips a Claude cell as Claude even when the default agent is codex", () => {
    expect(newSessionAgent("codex")).toBe("codex"); // the preference really is codex here
    expect(asTerminalAgent(storedCellAgent("claude"))).toBe("claude"); // and the stored cell is untouched
  });
});
