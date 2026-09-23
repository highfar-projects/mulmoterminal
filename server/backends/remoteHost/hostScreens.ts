// What the phone's per-session view is given: the header meta and the screen itself (#786,
// mulmoserver#107). Both read the tables /api/sessions answers from, so the phone and the grid
// cell head the same session the same way.
import { buildScreenMeta, captureSessionScreen, SCREEN_HISTORY_ROWS, type SessionScreenMeta } from "./terminalScreen.js";
import { dirIconSrc, readIconFile } from "./dirIcons.js";
import { quickCommandsForAgent } from "./quickCommands.js";
import { dirIconFor } from "../../config/dir-config.js";
import { getQuickCommands } from "../../config/config-routes.js";
import { currentBranch } from "../../git/git-status.js";
import { resolveGithubUrl } from "../../git/gitRemote.js";
import { agentOfSession } from "../../session/session-lookup.js";
import { aiTitles, lastPrompts, ptys, sessionMemos, sessionMemosHydrated } from "../../session/registry.js";
import { boundedTail } from "../../session/terminal-replay.js";
import { renderScreen } from "../../session/headlessScreen.js";
import { tmuxCaptureStyledPane } from "../../infra/tmux.js";

// Inlined rather than the /api/dir-icon URL the browser gets: the phone has no route to this host
// at all, so the picture travels in the reply or not at all (#1556).
const iconOf = (cwd: string): string => {
  const icon = dirIconFor(cwd);
  return (icon && dirIconSrc(icon, readIconFile)) || "";
};

/** The same dir / branch / memo / summary / prompt the grid cell shows. A session that outlived a
 *  restart has no PtyEntry, so it has no cwd here and no branch to look up — those fields are
 *  simply absent, and the phone shows the screen alone. */
export const sessionScreenMeta = (sessionId: string): Promise<SessionScreenMeta> =>
  buildScreenMeta(sessionId, {
    cwdOf: (id) => ptys.get(id)?.cwd ?? "",
    branchOf: async (cwd) => (await currentBranch(cwd)).branch,
    // The repository root, never /tree/<branch>: whether a branch is still ON GitHub cannot be
    // known without asking GitHub. `refs/remotes/origin/*` is a local cache, so a merged branch
    // deleted at merge time keeps resolving here until someone prunes — and every branch this app
    // creates is deleted that way. Measured: the tree URL 404s, the root does not. A per-poll
    // `ls-remote` is the only local fix and costs a network round trip on a screen the phone
    // polls (#832).
    githubUrlOf: resolveGithubUrl,
    iconOf,
    memoOf: (id) => sessionMemos.get(id) ?? "", // beside the summary, never instead of it — see SessionScreenMeta (#1110)
    summaryOf: (id) => aiTitles.get(id) ?? "",
    promptOf: (id) => lastPrompts.get(id) ?? "",
    memosHydrated: sessionMemosHydrated,
  });

export const captureTerminalScreen = (sessionId: string, outputBufferLimit: number) =>
  captureSessionScreen(sessionId, {
    // Both capture paths are asked for the same history; how much of it the phone actually gets is
    // captureSessionScreen's call, so the two agree (mulmoserver#139).
    captureStyledPane: (id) => tmuxCaptureStyledPane(id, SCREEN_HISTORY_ROWS),
    sourceOf: (id) => {
      const entry = ptys.get(id);
      // Cut to the bound: the buffer runs over it (PtyEntry.buffer), and every extra character is
      // one more the headless emulator has to parse to answer one screen.
      return entry ? { buffer: boundedTail(entry.buffer, outputBufferLimit), cols: entry.term.cols, rows: entry.term.rows } : undefined;
    },
    render: (source) => renderScreen({ ...source, historyLines: SCREEN_HISTORY_ROWS }),
    metaOf: sessionScreenMeta,
    // Read from config on every screen so an edit in Settings reaches the phone without a restart;
    // scoped here rather than on the phone, which then needs no notion of session kinds (#830).
    quickCommandsOf: (id) => quickCommandsForAgent(getQuickCommands(), agentOfSession(id)),
  });
