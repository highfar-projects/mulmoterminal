// Where the usage probe's claude runs (#3200): a folder of MulmoTerminal's own, not the workspace.
//
// The probe answers nothing — it sends no keys, so a trust dialog it meets can only time it out
// (#1293) — and the workspace is wherever the launcher was started. Started in the home directory,
// that is the one folder Claude Code never saves trust for ("home trust is session-only", in its
// own words), so every probe met the dialog and the advice to accept it once could not work. A
// folder under ~/.mulmoterminal is the same wherever the server was started, so trust accepted
// there once holds, and the gauge can name it. Being empty, it also brings no CLAUDE.md, hooks or
// project settings into a session that asks one question.
import path from "node:path";

/** The directory the probe's claude is started in, under MulmoTerminal's state directory. */
export const probeCwd = (stateDir: string): string => path.join(stateDir, "probe");
