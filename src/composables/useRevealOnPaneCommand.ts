// With NOTHING enlarged, an agent's pane command (#3022) enlarges the cell that sent it — the rule a
// drawing follows (GridView's drawn-result watch): no work is taken away, and a checklist nobody can
// see is a session waiting for nothing. With a cell enlarged, TerminalGrid keeps the command until its
// own cell is enlarged instead. Only GridView knows every cell, so the enlarging lives here.
import { onBeforeUnmount, type Ref } from "vue";
import { PANE_COMMAND_CHANNEL, isPaneCommand } from "../../common/paneCommand";
import { usePubSub } from "./usePubSub";

export interface RevealDeps {
  expandedUid: Ref<number | null>;
  uidOfSession: (sessionId: string) => number | undefined;
  onTerminalsRoute: () => boolean;
  enlarge: (uid: number) => void;
}

export function useRevealOnPaneCommand(deps: RevealDeps): void {
  const { subscribe } = usePubSub();
  const off = subscribe(PANE_COMMAND_CHANNEL, (data) => {
    if (!isPaneCommand(data) || deps.expandedUid.value !== null || !deps.onTerminalsRoute()) return;
    const uid = deps.uidOfSession(data.sessionId);
    if (uid !== undefined) deps.enlarge(uid);
  });
  onBeforeUnmount(off);
}
