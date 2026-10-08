import type { EntryChange } from "./configEntryChange";

export interface EntryChangeOutcome<P extends string> {
  refused: boolean;
  serverProblem: P | null;
}

// A refusal with no problem word is one the form cannot explain, so it is said as "refused" instead.
export function entryChangeOutcome<P extends string>(change: EntryChange<P>): EntryChangeOutcome<P> {
  return { refused: !change.ok && change.problem === null, serverProblem: change.ok ? null : change.problem };
}
