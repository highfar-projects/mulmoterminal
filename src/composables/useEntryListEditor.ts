import { shallowRef } from "vue";
import type { EntryChange } from "./configEntryChange";
import { entryChangeOutcome } from "./entryChangeOutcome";

export type EntryListChanger<P extends string> = (action: "add" | "remove", payload: Record<string, unknown>) => Promise<EntryChange<P>>;

// One change at a time, against the list on disk; the answer is the list as the server now holds it.
export function useEntryListEditor<P extends string>(change: EntryListChanger<P>) {
  const saving = shallowRef(false);
  const refused = shallowRef(false);
  const serverProblem = shallowRef<P | null>(null);

  async function apply(action: "add" | "remove", payload: Record<string, unknown>): Promise<boolean> {
    saving.value = true;
    const answer = await change(action, payload);
    saving.value = false;
    const outcome = entryChangeOutcome(answer);
    refused.value = outcome.refused;
    serverProblem.value = outcome.serverProblem;
    return answer.ok;
  }

  function remove(id: string): void {
    if (!saving.value) void apply("remove", { id });
  }

  return { saving, refused, serverProblem, apply, remove };
}
