// The phone's list of terminal sessions (#435). Reads the same tables /api/sessions answers from,
// so the two clients never disagree about what exists or what it is called.
import { buildSessionList, type SessionWorkSummary } from "./terminalScreen.js";
import { withDirIcons, readIconFile, type DirIconSources } from "./dirIcons.js";
import { workByCwd } from "./workByCwd.js";
import { dirIconFor } from "../../config/dir-config.js";
import { agentOfSession, cwdOfSession } from "../../session/session-lookup.js";
import { resumableSessionPredicate } from "../../session/resumable-sessions.js";
import {
  aiTitles,
  isPhoneListableSession,
  knownSessions,
  placedSessionsHydrated,
  ptys,
  sessionMemos,
  sessionMemosHydrated,
  unplacedSessionsHydrated,
} from "../../session/registry.js";
import { tmuxListSessionIds } from "../../infra/tmux.js";
import { sessionDisplayName } from "../../../common/sessionMemo.js";

// Where the phone's copy of a directory's picture comes from (#1556). `dirIconFor` is the same
// resolution the browser's cells use — the configured `icon` and, failing that, the detected
// favicon — so the two clients never disagree about which image a project has.
const dirIconSources: DirIconSources = { iconOf: dirIconFor, readIcon: readIconFile };

// Spread the work item in only when there IS one. `work: map.get(...)` leaves the key behind
// holding undefined, and Firestore then refuses the entire reply rather than that one field.
const detailOf = (id: string, work: ReadonlyMap<string, SessionWorkSummary>) => {
  const summary = work.get(cwdOfSession(id));
  return {
    // The same precedence as the cell header and the sidebar, through the same helper: the phone is
    // where "which of these is which" is hardest, and it renders `title` and nothing else — so
    // riding in that field is also what puts a memo on a phone with no core release and no schema
    // change.
    title: sessionDisplayName(sessionMemos.get(id), aiTitles.get(id), knownSessions.get(id)?.title),
    cwd: cwdOfSession(id),
    agent: agentOfSession(id),
    ...(summary ? { work: summary } : {}),
  };
};

export async function listTerminalSessions() {
  const work = await workByCwd([...new Set([...ptys.keys(), ...tmuxListSessionIds()])].map(cwdOfSession));
  await sessionMemosHydrated; // the memo IS the phone's row title when there is one
  // Both unplaced logs, because a session waiting for a cell is one the phone may list — and the
  // case that mark exists for is a server that restarted before any tab opened, where the answer
  // lives only on disk.
  await Promise.all([unplacedSessionsHydrated, placedSessionsHydrated]);
  const sessions = buildSessionList({
    liveIds: [...ptys.keys()],
    tmuxIds: tmuxListSessionIds(),
    isResumable: await resumableSessionPredicate(),
    // The phone lists the multi-terminal grid's cells, and the sessions on their way to being one —
    // never a tmux shell that was never a cell. resumableSessionPredicate() already awaited
    // devTerminalSessionsHydrated, and the unplaced logs are awaited just above; a session that has
    // only just been spawned passes `isResumable` on its live pty.
    isGridSession: isPhoneListableSession,
    // Empty title rather than the id as a fallback — buildSessionList uses "nameless" to drop the
    // long tail of finished sessions the phone can't meaningfully offer.
    detailOf: (id) => detailOf(id, work),
  });
  // After the sort, so the budget is spent on the rows the phone shows first.
  return withDirIcons(sessions, dirIconSources);
}
