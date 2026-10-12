// What agents have asked of their cells' right panes (#3022), by session — held for EVERY session,
// like the question box, because a command arrives whenever the agent sends it and its cell may not be
// the one on screen. A file waiting to be shown is kept until that cell is enlarged; a checklist stays
// until it is sent or put away. A check that was closed is remembered by id, so a late read-back of
// the server's copy cannot bring it back.
import { ref } from "vue";
import type { PaneCheck, PaneCommand, PaneShow } from "../../common/paneCommand";

export function createPaneCommandBox(fetchCheck: (sessionId: string) => Promise<PaneCheck | null>) {
  const shows = new Map<string, PaneShow>();
  const checks = ref(new Map<string, PaneCheck>());
  const closedIds = new Set<string>();

  const setCheck = (check: PaneCheck): void => {
    if (closedIds.has(check.id)) return;
    checks.value = new Map(checks.value).set(check.sessionId, check);
  };

  return {
    checks,
    offer(command: PaneCommand): void {
      if (command.kind === "show") shows.set(command.sessionId, command);
      else setCheck(command);
    },
    /** The file waiting to be shown in this session's pane, handed over once. */
    takeShow(sessionId: string): PaneShow | undefined {
      const show = shows.get(sessionId);
      shows.delete(sessionId);
      return show;
    },
    /** Sent or put away: the check's id, for telling the server, or null when there was none. */
    close(sessionId: string): string | null {
      const check = checks.value.get(sessionId);
      if (!check) return null;
      closedIds.add(check.id);
      const next = new Map(checks.value);
      next.delete(sessionId);
      checks.value = next;
      return check.id;
    },
    /** The server's copy, for a browser that was not listening when the check was published. */
    async hydrate(sessionId: string): Promise<void> {
      const check = await fetchCheck(sessionId);
      if (check) setCheck(check);
    },
  };
}
