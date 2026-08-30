// A command run in an ephemeral command cell. Three sources, all resolved server-side (the browser
// never holds a raw command): a `script.json` entry by index, a `.vscode/launch.json` configuration
// by index (server/files/launchConfigs.ts translates it into a plain shell command — no debugger,
// no breakpoints), or a header `run:"shell"` button by id — the last is re-resolved against the live
// session context (cwd/session/agent/model) at exec time. `label` and `cwd` are common to all three,
// so display code doesn't need to branch.
import type { TerminalAgent } from "../../common/sessionAgent";

export type RunCommand =
  | { source: "script"; index: number; label: string; cwd: string | null }
  | { source: "launch"; index: number; label: string; cwd: string | null }
  | {
      source: "button";
      buttonId: string;
      label: string;
      cwd: string | null;
      session: string | null;
      agent: TerminalAgent;
      model: string | null;
    };
