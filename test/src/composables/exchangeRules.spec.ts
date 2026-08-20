import { describe, it, expect } from "vitest";
import { outcomeMessage } from "../../../src/composables/exchangeRules";

describe("outcomeMessage", () => {
  it("says nothing when the exchange completed — the answer is the feedback", () => {
    expect(outcomeMessage("answered")).toBeNull();
  });

  it("explains every way an exchange can end early", () => {
    expect(outcomeMessage("stopped")).toBe("Stopped");
    expect(outcomeMessage("session-changed")).toContain("switched session");
    expect(outcomeMessage("timed-out")).toContain("did not answer in time");
    expect(outcomeMessage("nothing-to-send")).toContain("No completed turn");
    expect(outcomeMessage("failed")).toContain("Could not reach");
  });
});
