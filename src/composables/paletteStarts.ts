// What the command palette can start in the acting terminal's directory (#2487): each option the
// launch panel's Agent Picker offers, and each configured launcher. The cells come from the panel's
// own builders, so a palette start is exactly what the panel would have started. Pure.
import { cellForPanelStart } from "../components/launchCell";
import { agentPickerOptions } from "../components/agentPicker";
import type { Cell } from "../components/gridTabs";
import type { Launcher } from "../components/launchers";
import type { AgentPick, CustomAgent } from "../../common/customAgents";

export type PaletteStart = { kind: "agent"; pick: AgentPick; label: string } | { kind: "launcher"; index: number; label: string };

export function paletteStarts(customAgents: readonly CustomAgent[], launchers: readonly Launcher[]): PaletteStart[] {
  const agents = agentPickerOptions(customAgents).map((option): PaletteStart => ({ kind: "agent", pick: option.agent, label: option.label }));
  // The index is the server's allowlist position, which is what a launcher cell runs by.
  const programs = launchers.map((launcher, index): PaletteStart => ({ kind: "launcher", index, label: launcher.label }));
  return [...agents, ...programs];
}

export const paletteStartId = (start: PaletteStart): string => (start.kind === "agent" ? `agent:${start.pick}` : `launcher:${start.index}`);

export function cellForPaletteStart(start: PaletteStart, dir: string): Omit<Cell, "uid"> {
  if (start.kind === "launcher") return { session: null, cwd: dir, launcher: { index: start.index, label: start.label } };
  return cellForPanelStart({ dir, pick: start.pick, choice: null, account: null }, dir);
}
