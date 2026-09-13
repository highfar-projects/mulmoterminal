import type { AgentAdapter } from "./types.js";

// Draft injection isn't wired for copilot yet, so it omits draftReadyMarker — the marker has to be
// read off a real copilot TUI, and a guessed one silently types into nothing.
export const copilotAdapter = {
  kind: "copilot",
  bin: () => process.env.COPILOT_BIN || "copilot",
  binEnvVar: "COPILOT_BIN",
} satisfies AgentAdapter;
