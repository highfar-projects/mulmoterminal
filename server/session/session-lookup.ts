// "Which agent is this session, and where does it run?" — asked by the HTTP routes, the phone's
// remote-host bindings and the transcript reader, which is why it is here rather than inside any
// one of them. ONE definition each, because two copies drift and the phone then reads another
// cell's conversation under this row's title (CodeRabbit, PR #1776).
import { ptys, sessionCwd } from "./registry.js";
import { tmuxPaneCommand } from "../infra/tmux.js";
import { agentFromPaneCommand } from "../backends/remoteHost/terminalScreen.js";
import type { SessionAgent } from "../../common/sessionAgent.js";

/** A live session knows what it spawned. One that outlived us has no PtyEntry left, so ask tmux
 *  what is running in it now — which is also the truer answer when the user started a shell and ran
 *  an agent inside it. Null when neither can say. */
export const agentOfSession = (id: string): SessionAgent | null => ptys.get(id)?.agent ?? agentFromPaneCommand(tmuxPaneCommand(id));

/** A live PTY knows where the agent actually runs, so it wins; a session that outlived this process
 *  has none, which is what the remembered cwd is for (#1021). */
export const cwdOfSession = (id: string): string => ptys.get(id)?.cwd ?? sessionCwd(id) ?? "";
