// A grid cell as the command palette lists it (#2446). Pure, so the rule for what a row says and
// what it is found by is a spec.
import { homeRelative } from "../components/cwdDisplay";
import type { PaletteTerminal } from "./commandPalette";

/** The parts of a roster row the palette reads. */
export interface TerminalRowSource {
  uid: number;
  cwd: string | null;
  agent: string | null;
  memo: string | null;
  summary: string | null;
}

/** Null for a cell with no directory yet: it has nothing to be found by. */
export function paletteTerminalOf(row: TerminalRowSource, home: string | null): PaletteTerminal | null {
  if (!row.cwd) return null;
  const detail = row.memo ?? row.summary ?? row.agent ?? "";
  return { uid: row.uid, path: homeRelative(row.cwd, home), detail, keywords: [row.memo, row.summary].filter((word): word is string => !!word).join(" ") };
}
