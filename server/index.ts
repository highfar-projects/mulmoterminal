import express from "express";
import http from "http";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { readFileSync } from "node:fs";
import { createPubSub } from "./infra/pubsub.js";
import { hideErrorStacks } from "./infra/hide-error-stacks.js";
import { allowedToolNames, autoAllowedToolNames, toolSummaries } from "./infra/plugins-registry.js";
import { getPlayfulEffects, getUserMcpServers, APP_CONFIG_FILE } from "./config/config-routes.js";
import { enforceKeymap } from "./config/keymap-check.js";
import { tmuxCancelCopyMode, tmuxPaneInMode, tmuxPanePidsAsync, tmuxRedrawClient, tmuxTerminalModes, tmuxWindowSize } from "./infra/tmux.js";
import { browserOriginHostnames, createIsAllowedOrigin } from "./infra/allowed-origin.js";
import { serverErrorExit } from "./infra/server-exit.js";
import { PORT, BIND_HOST, CLAUDE_CWD } from "./config/env.js";
import { messageOf } from "./errors.js";
import { hookSettingsJson } from "./session/hook-settings.js";
import { mcpConfigJson } from "./session/mcp-config.js";
import { createClaudeSpawner } from "./session/spawn-claude.js";
import { createRateLimitService } from "./agents/rate-limit-service.js";
import { runLegacyCleanupsOnce } from "./infra/legacy-cleanup.js";
import { createCodexSpawner } from "./session/spawn-codex.js";
import { createShellSpawners } from "./session/spawn-shell.js";
import { createTranslationWorker } from "./session/translation-worker.js";
import { createTitleManager } from "./session/session-title.js";
import { resolveSessionTitle } from "./config/header-title.js";
import { mountTerminalWebSockets } from "./routes/ws-routes.js";
import { createConnectionHandlers } from "./session/pty-connection.js";
import { createTmuxSizeSync } from "./session/tmux-size-sync.js";
import { createIssueSessionSpawner } from "./session/issue-session-spawn.js";
import { bindSessionAccount } from "./session/session-home.js";
import { registeredGuiMcpGroups } from "./infra/gui-mcp-registration.js";
import { syncCursorDirectoryMcp } from "./agents/cursor-mcp.js";
import { ensureWorktreeEnv } from "./config/worktree-env.js";
import { TOOL_GROUPS } from "../common/toolGroups.js";
import { createPaneModeWatch } from "./session/pane-mode-watch.js";
import { createHeatWatch } from "./session/heat-watch.js";
import type { HeatFrame } from "../common/playfulEffects.js";
import { listProcessRows } from "./infra/process-list.js";
import { sendFrame } from "./session/ws-frames.js";
import type { SpawnDeps } from "./session/spawn-deps.js";
import { ptys } from "./session/registry.js";
import { agentOfSession } from "./session/session-lookup.js";
import { createToolStores } from "./session/tool-store.js";
import { startScheduledSessions } from "./session/scheduled-sessions-boot.js";
import { startDecisionDigestSchedule } from "./session/decision-digest-schedule.js";
import { AGENT_BINS, AGENT_MODELS } from "./config/agent-bins.js";
import { agentAvailability } from "./agents/agent-availability.js";
import { agentInstallGuide } from "../bin/agent-install-guides.js";
import { diagnoseBinary } from "./infra/has-binary.js";
import { ptyEnv } from "./session/pty-spawn.js";
import { createAntigravitySpawner } from "./session/spawn-antigravity.js";
import { createGrokSpawner } from "./session/spawn-grok.js";
import { createMuseSpawner } from "./session/spawn-muse.js";
import { createCopilotSpawner } from "./session/spawn-copilot.js";
import { createCursorSpawner } from "./session/spawn-cursor.js";
import { HOST_ID as REMOTE_HOST_ID } from "./backends/remoteHost/index.js";
import { initRemoteHost } from "./backends/remoteHost/hostBindings.js";
import { createSessionActivityPublisher, firestoreSessionActivityStore } from "./backends/remoteHost/sessionActivity.js";
import { createWorkPhaseTracker } from "./session/work-phase-tracker.js";
import { currentFirestore, currentUid } from "./backends/remoteHost/session.js";
import { initWorkspaceSetup } from "./backends/workspaceSetup.js";
import { installBundledSkills } from "./infra/install-bundled-skills.js";
import { initBackends } from "./backends/boot-backends.js";
import { installShutdownHandlers } from "./infra/shutdown.js";
import { startCollectionCompletionWatchers } from "./backends/collectionWatchers.js";
import { initScheduling } from "./backends/scheduler-boot.js";
// The projects a request may name — and, at boot, the roots whose feeds refresh on schedule.
import { listProjectRoots } from "./infra/project-root.js";
import { createSessionLifecycle, SESSIONS_CHANNEL } from "./session/lifecycle.js";
import { PROMPT_SUBMITTED_CHANNEL, type PromptSubmittedEvent } from "../common/promptChannel.js";
import { mountAppRoutes } from "./routes/app-routes.js";
import { GUI_SERVER_ID } from "../common/toolGroups.js";
import { onListening } from "./infra/on-listening.js";
import { installProcessGuards } from "./infra/process-guards.js";
import { setProcessTitle } from "../bin/process-title.js";

// Register the top-level uncaughtException/unhandledRejection guards before any async boot
// work runs, so a single unhandled error can't silently kill the backend and disconnect
// every terminal at once (see infra/process-guards.ts).
installProcessGuards();

// Before the boot rather than after it: a server that is slow to start, or that dies during it, is
// exactly the one the user goes looking for in `ps` (#1820). Assigned once — on macOS each
// assignment costs several milliseconds inside libuv.
setProcessTitle(PORT);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  claude: CLAUDE_BIN,
  codex: CODEX_BIN,
  antigravity: ANTIGRAVITY_BIN,
  grok: GROK_BIN,
  muse: MUSE_BIN,
  copilot: COPILOT_BIN,
  cursor: CURSOR_BIN,
} = AGENT_BINS;
const { codex: CODEX_MODEL, antigravity: ANTIGRAVITY_MODEL, grok: GROK_MODEL, muse: MUSE_MODEL, copilot: COPILOT_MODEL, cursor: CURSOR_MODEL } = AGENT_MODELS;
// Permission mode for backend-spawned Claude sessions. Defaults to "auto" so
// the backend runs hands-off; override with CLAUDE_PERMISSION_MODE (e.g.
// "default" / "acceptEdits" / "bypassPermissions" / "plan") when needed.
const CLAUDE_PERMISSION_MODE = process.env.CLAUDE_PERMISSION_MODE || "auto";

// CLAUDE_CWD is the workspace used as the PTY cwd and as the root for persisted
// session state, so it must exist before we spawn anything into it.
await fs.mkdir(CLAUDE_CWD, { recursive: true });

// Seed help docs + preset skills so a MulmoTerminal-alone run gets the full
// workspace experience. Gated to the managed mulmoclaude workspace and
// fault-isolated per step, so it never aborts boot (see workspaceSetup.ts).
initWorkspaceSetup({ workspace: CLAUDE_CWD });

// Install the skills we ship into the user's global skills roots so any launched terminal can run
// `/mulmoterminal-config` (the settings entry point, which routes to -dirs / -theme / -header /
// -keys / -model / -notify) and `/mulmoterminal-bug-report`.
// Best-effort + never clobbers a user's own same-named skill (see install-bundled-skills.ts).
installBundledSkills();

// Per-session pub/sub channel the GUI panel subscribes to. The MCP broker POSTs a
// toolResult to /api/agent/toolResult, which stores it keyed by session id and
// publishes it here (mirrors MulmoClaude's sessionChannel; see the spike doc).
const sessionChannel = (id: string) => `session:${id}`;

// MCP tool names claude uses, in the mcp__<server>__<tool> form, one per enabled
// plugin. Auto-allowed via --allowedTools so the spike doesn't trip the permission
// prompt (permissions stay terminal-native). Comma-joined into one --allowedTools.
// The worker-only `submitTranslation` tool is allowed for every session (harmless —
// only hidden translation workers are actually shown it, see the /mcp route) so the
// worker can call it without a permission prompt.
const GUI_MCP_TOOLS = [...allowedToolNames(), `mcp__${GUI_SERVER_ID}__submitTranslation`].join(",");

// What a GRID cell pre-approves. A grid cell is never handed --mcp-config: its GUI tools come
// from the user's OWN per-folder MCP config (`claude mcp add -s local`, `.mcp.json`), so
// MulmoTerminal cannot know which groups a directory registered — and does not need to. It
// names the auto-allowed groups unconditionally; entries for a server the session didn't
// register match nothing. Only `render` is here: it cannot act outside the Canvas panel, so
// running it without a prompt is the point. Every other group keeps Claude Code's own prompt.
const GRID_MCP_TOOLS = autoAllowedToolNames().join(",");

// The panel's per-session stores. `publish` is a closure rather than the pubsub object
// because pub/sub only exists once the HTTP server does, and these are built before it.
const toolStores = createToolStores({
  publish: (channel, data) => pubsub?.publish(channel, data),
});

// Bytes of recent output kept per pty and replayed when a client reattaches to
// a background session, so the user sees context instead of a blank screen. On
// reattach the client resets its terminal and rebuilds scrollback purely from
// this replay, so this — not xterm's 1000-line scrollback — is what caps how far
// back you can scroll after a reload. 64 KiB of escape-heavy TUI output rendered
// to only ~100 lines; size it to comfortably fill the client's ~1000-line
// scrollback (older lines past that are dropped client-side anyway).
const OUTPUT_BUFFER_LIMIT = 1024 * 1024;

// Assigned once the HTTP server exists (createPubSub needs it).
let pubsub: ReturnType<typeof createPubSub> | null = null;

// Keeps tmux's window in step with the browser's terminal, which SIGWINCH alone does not
// guarantee (session/tmux-size-sync.ts, #957).
const tmuxSizeSync = createTmuxSizeSync({
  windowSizeOf: (id) => tmuxWindowSize(id),
  resizePty: (id, { cols, rows }) => {
    try {
      ptys.get(id)?.term.resize(cols, rows);
    } catch (err) {
      // The pty exited between the probe and the repair — the screen it would have fixed is gone.
      console.warn(`[tmux-size] ${id}: resize dropped: ${messageOf(err)}`);
    }
  },
  onEvent: (event) => {
    const { id, wanted, seen } = event;
    const gap = `tmux window ${seen.cols}x${seen.rows}, client ${wanted.cols}x${wanted.rows}`;
    if (event.kind === "repairing") console.warn(`[tmux-size] ${id}: ${gap} — forcing a resize (#957)`);
    else console.warn(`[tmux-size] ${id}: ${gap} AFTER the forced resize — the window did not follow (#957)`);
  },
});

// Whether the pane is in tmux copy-mode, for the banner that says why typing does nothing (#2207).
const paneModeWatch = createPaneModeWatch({
  inModeOf: (id) => tmuxPaneInMode(id),
  publish: (id, inCopyMode) => {
    sendFrame(ptys.get(id)?.ws, { type: "paneMode", inCopyMode });
  },
});

// playfulEffects: how hard each watched session is working, told to its browser.
const heatWatch = createHeatWatch({
  enabled: () => getPlayfulEffects() !== "off",
  connectedSessions: () => new Map([...ptys].flatMap(([id, entry]) => (entry.ws ? [[id, entry.ws] as const] : []))),
  listProcesses: () => listProcessRows(),
  listPanePids: async () => {
    const byPid = await tmuxPanePidsAsync();
    if (!byPid) return null;
    const bySession = new Map<string, number[]>();
    byPid.forEach((id, pid) => bySession.set(id, [...(bySession.get(id) ?? []), pid]));
    return bySession;
  },
  publish: (id, level, finale) => {
    const frame: HeatFrame = { type: "heat", level, finale };
    sendFrame(ptys.get(id)?.ws, frame);
  },
});
heatWatch.start();

// Per-connection plumbing (session/pty-connection.ts). The reap decisions stay here —
// they read activity state and schedule timers that outlive any one connection.
const { reattachPty, handleClientFrame, handleClientClose } = createConnectionHandlers({
  outputBufferLimit: OUTPUT_BUFFER_LIMIT,
  cancelReap: (id) => cancelReap(id),
  reap: (id) => reap(id),
  setWaiting: (id, waiting) => setWaiting(id, waiting),
  armReapForDetached: (id) => armReapForDetached(id),
  terminalModesOf: (id) => tmuxTerminalModes(id),
  redrawTerminal: (id, clientPid) => tmuxRedrawClient(id, clientPid),
  checkTerminalSize: (id, size) => tmuxSizeSync.requestCheck(id, size),
  recheckTerminalSize: (id) => tmuxSizeSync.requestCheck(id),
  cancelTerminalSizeCheck: (id) => tmuxSizeSync.cancel(id),
  checkPaneMode: (id, fresh) => (fresh ? paneModeWatch.requestFreshCheck(id) : paneModeWatch.requestCheck(id)),
  exitCopyMode: (id) => {
    tmuxCancelCopyMode(id);
    paneModeWatch.requestCheck(id);
  },
});

// Mirrors session activity into Firestore so the phone's terminal viewer can refresh
// on a real transition instead of polling (#439). Deduped and fire-and-forget inside;
// a no-op while the remote host is disconnected.
const sessionActivityPublisher = createSessionActivityPublisher({
  uid: currentUid,
  hostId: REMOTE_HOST_ID,
  store: firestoreSessionActivityStore(currentFirestore),
  onError: (err) => console.warn("[remote-host] session activity publish failed:", err),
});

// The live turn's planning-vs-editing phase, fed by the hook route and read by the activity
// publisher — the phone's status vocabulary needs it, and the publish path can't read the
// transcript the roster parses for the same answer (#727).
const workPhaseTracker = createWorkPhaseTracker();

// Session teardown + activity publishing (session/lifecycle.ts). `forgetTitle` is bound
// lazily because the title manager below needs publishActivity — the cycle is real.
const lifecycle = createSessionLifecycle({
  publish: (channel, data) => pubsub?.publish(channel, data),
  forgetTitle: (id) => forgetTitle(id),
  sessionActivityPublisher,
  workPhaseOf: (id) => workPhaseTracker.phaseOf(id),
  forgetWorkPhase: (id) => workPhaseTracker.forget(id),
  forgetTerminalSize: (id) => tmuxSizeSync.forget(id),
  forgetPaneMode: (id) => paneModeWatch.forget(id),
});
const { cancelReap, reap, armReapForDetached, publishActivity, setWorking, setWaiting } = lifecycle;

// AI-title bookkeeping (session/session-title.ts). publishActivity stays here — it
// publishes the whole session row, of which the title is one field.
const { forgetTitle, noteTitleTurn, maybeGenerateTitle, freshenRosterTitle } = createTitleManager({
  publishActivity: (id) => publishActivity(id),
  now: () => Date.now(),
  resolveTitle: (input) => resolveSessionTitle(input),
});

// The PTY spawners (session/spawn-*.ts). They take what index.ts still owns — the session
// lifecycle it drives, and this file's port and live user config bound into the two payload
// builders (session/hook-settings.ts, session/mcp-config.ts) — as deps.
const spawnDeps: SpawnDeps = {
  claudeBin: CLAUDE_BIN,
  codexBin: CODEX_BIN,
  codexModel: CODEX_MODEL,
  antigravityBin: ANTIGRAVITY_BIN,
  antigravityModel: ANTIGRAVITY_MODEL,
  grokBin: GROK_BIN,
  grokModel: GROK_MODEL,
  museBin: MUSE_BIN,
  museModel: MUSE_MODEL,
  copilotBin: COPILOT_BIN,
  copilotModel: COPILOT_MODEL,
  cursorBin: CURSOR_BIN,
  cursorModel: CURSOR_MODEL,
  permissionMode: CLAUDE_PERMISSION_MODE,
  guiMcpTools: GUI_MCP_TOOLS,
  gridMcpTools: GRID_MCP_TOOLS,
  outputBufferLimit: OUTPUT_BUFFER_LIMIT,
  hookSettingsJson: (host, sessionId, env) => hookSettingsJson({ host, port: PORT, sessionId, env }),
  // The user's MCP servers are read per spawn, so a settings edit applies to the next session.
  mcpConfigJson: (sessionId, host) => mcpConfigJson({ sessionId, host, port: PORT, userMcpServers: getUserMcpServers() }),
  reap: (id) => reap(id),
  setWorking: (id, working, event) => setWorking(id, working, event),
  setWaiting: (id, waiting, event) => setWaiting(id, waiting, event),
  uiPort: String(process.env.CLIENT_PORT || PORT),
  publishSessionCreated: (sessionId) => pubsub?.publish(SESSIONS_CHANNEL, { id: sessionId, working: false, event: "created" }),
  publishActivity: (sessionId) => publishActivity(sessionId),
  publishPromptSubmitted: (sessionId) => pubsub?.publish(PROMPT_SUBMITTED_CHANNEL, { sessionId } satisfies PromptSubmittedEvent),
};
const { spawnClaudePty } = createClaudeSpawner(spawnDeps);
const { spawnCodexPty } = createCodexSpawner(spawnDeps);
const { spawnAntigravityPty } = createAntigravitySpawner(spawnDeps);
const { spawnGrokPty } = createGrokSpawner(spawnDeps);
const { spawnMusePty } = createMuseSpawner(spawnDeps);
const { spawnCopilotPty } = createCopilotSpawner(spawnDeps);
const { spawnCursorPty } = createCursorSpawner(spawnDeps);
const { spawnCommandPty, spawnLauncherPty, resolveLauncher } = createShellSpawners(spawnDeps);

// Which agents could be started, checked ONCE, here, as the spawn preflight checks them: against
// the environment a spawned agent gets (#2229). Installing one needs a restart to show.
const agentAvailabilityAtStart = agentAvailability(AGENT_BINS, (bin) => diagnoseBinary(bin, ptyEnv()), agentInstallGuide);

// The session an issue's work starts in, for the desktop route and the phone alike (#2228): the
// agent asked for, with the GUI tools its worktree registered, as a cell opened there would get.
const spawnIssueSession = createIssueSessionSpawner({
  spawnClaudePty,
  spawnCodexPty,
  spawnCopilotPty,
  spawnCursorPty,
  spawnAntigravityPty,
  spawnGrokPty,
  spawnMusePty,
  groupsFor: (cwd) => registeredGuiMcpGroups(cwd, TOOL_GROUPS).catch(() => []),
  syncCursorMcp: syncCursorDirectoryMcp,
  reserveWorktreeEnv: async (cwd) => {
    await ensureWorktreeEnv(cwd);
  },
  // A new id has no transcript anywhere, so the requested account is the one it is bound to.
  bindAccount: async (agent, sessionId, accountId) => {
    await bindSessionAccount(agent, sessionId, accountId, () => false);
  },
});

// The hidden translation worker (session/translation-worker.ts). It drives a headless
// claude session, so it needs the spawner above and the reap this file owns.
const { translateViaHiddenChat } = createTranslationWorker({
  reap: (id) => reap(id),
  spawnHiddenChat: (sessionId, prompt) => {
    // ws=null → headless; the worker buffers output nobody reads. Default cwd = CLAUDE_CWD (trusted).
    spawnClaudePty(sessionId, null, null, { initialPrompt: prompt });
  },
});

// Before anything binds a port: a typo'd key binding must stop the boot with a message
// naming it, not disappear into a shortcut that silently never fires.
enforceKeymap(APP_CONFIG_FILE, {
  readConfig: (): unknown => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(APP_CONFIG_FILE, "utf8"));
      return parsed;
    } catch {
      return undefined; // missing or unparseable — not this check's business to report
    }
  },
  warn: (message) => console.warn(`\x1b[33m${message}\x1b[0m`),
  fail: (message) => {
    console.error(`\x1b[31m${message}\x1b[0m`);
    process.exit(1);
  },
});

// Which browser origins this server accepts, decided once from what the operator asked for
// (#956). Read here rather than inside the predicate so the same set is what the startup warning
// reports — a warning describing a different rule than the one enforced is worse than none.
const browserHostnames = browserOriginHostnames(BIND_HOST, process.env.MULMOTERMINAL_ALLOWED_ORIGINS);
const isAllowedOrigin = createIsAllowedOrigin(browserHostnames);

// The 5h / 7d rate-limit gauge (#387) — store, Codex reading and Claude probe (rate-limit-service.ts).
const rateLimits = createRateLimitService();

// What a removed feature left on disk (infra/legacy-cleanup.ts). Fire-and-forget.
runLegacyCleanupsOnce();

// Codex costs nothing to read, so it is current before the first browser arrives.
rateLimits.refreshCodex();

const app = express();
hideErrorStacks(app);
// Generous body limit: PostToolUse hook payloads carry the tool's full output
// (a big Read/Bash result can blow past Express's 100kb default, which would 413
// the hook and leave its tool-call entry stuck on "running").
mountAppRoutes(app, {
  clientDir: __dirname,
  rateLimits,
  isAllowedOrigin,
  publish: (channel, data) => pubsub?.publish(channel, data),
  sessionChannel,
  toolStores,
  toolSummaries,
  spawnClaudePty,
  spawnCodexPty,
  spawnAntigravityPty,
  spawnGrokPty,
  spawnMusePty,
  spawnCopilotPty,
  spawnCursorPty,
  spawnIssueSession,
  agentAvailability: agentAvailabilityAtStart,
  translateViaHiddenChat,
  freshenRosterTitle,
  forgetTitle,
  noteTitleTurn,
  noteWorkPhase: (id, event, toolName) => workPhaseTracker.note(id, event, toolName),
  maybeGenerateTitle,
  reap,
  // Defined further down; reached only from a request, which cannot arrive before listen().
  registerBackgroundSession: (id: string) => scheduledSessions.register(id),
  agentOfSession: (id: string) => agentOfSession(id),
  setWorking,
  setWaiting,
  publishActivity,
});

const server = http.createServer(app);
// The extra listeners: one for the case where the operator bound a specific non-loopback address
// and everything this server spawns can therefore no longer reach it (#1834), one so that
// `http://localhost:<port>` — the origin the browser files its saved settings under — cannot be
// answered by anything else on this machine (#1893). Built unconditionally and wired into the same
// app, sockets and upgrade routing as the primary, because that wiring happens well before
// `listen()` tells us which address the OS actually chose; whether either ever serves anything is
// decided down at the bind, and an http server that never listens costs nothing.
// TWO spares, because there are two loopback addresses to answer for and a bind can need both at
// once (a specific LAN address serves neither). They are interchangeable — same app, same sockets,
// same upgrade routing — so loopbackListenPlans decides what each one becomes, and a spare that is
// never asked for anything simply never listens.
const loopbackServers = [http.createServer(app), http.createServer(app)] as const;
const listeners: readonly [http.Server, http.Server, http.Server] = [server, ...loopbackServers];
pubsub = createPubSub(listeners, isAllowedOrigin);

// Every backend, in the order they need each other (backends/boot-backends.ts). `retain` is called
// lazily because the registry it reaches is built further down — a feeds refresh cannot dispatch
// before the scheduler that triggers it is registered.
await initBackends({ pubsub, spawnClaudePty, retain: (sessionId) => scheduledSessions.register(sessionId) });

// Let a phone drive MulmoTerminal over the Firestore command channel
// (backends/remoteHost/hostBindings.ts).
initRemoteHost({
  spawnClaudePty,
  spawnIssueSession,
  toolStores,
  outputBufferLimit: OUTPUT_BUFFER_LIMIT,
  publishToOne: (channel, data) => pubsub?.publishToOne(channel, data) ?? false,
  subscriberCount: (channel) => pubsub?.subscriberCount(channel) ?? 0,
});

// Mount per-collection fs.watchers → completion bells via the notifier. After the
// engine host + notifier are configured. Fire-and-forget + non-fatal: a watcher
// failure must never abort startup.
startCollectionCompletionWatchers().catch((err) => {
  console.error("[collection-watchers] failed to start — completion bells disabled", err);
});

// The background sessions nobody waits for, and the sweep that bounds them
// (session/scheduled-sessions-boot.ts).
const scheduledSessions = startScheduledSessions({ reap, spawnClaudePty });

// The decision digest, at startup and on its timer (session/decision-digest-schedule.ts).
startDecisionDigestSchedule();

// User-task scheduler: cron tasks from config/scheduler/tasks.json fire on schedule
// and spawn a NEW chat seeded with the task's prompt (e.g. the workout-log weekly
// nudge). Non-fatal: a scheduler failure must never abort startup.
initScheduling({ spawnChat: scheduledSessions.spawnScheduledChat, projectRoots: listProjectRoots().map((project) => project.cwd) });

// The terminal WebSocket endpoints (routes/ws-routes.ts).
mountTerminalWebSockets({
  servers: listeners,
  isAllowedOrigin,
  claudeBin: CLAUDE_BIN,
  setWaiting: (id, waiting) => setWaiting(id, waiting),
  reattachPty,
  handleClientFrame,
  handleClientClose,
  spawnClaudePty,
  spawnCodexPty,
  spawnAntigravityPty,
  spawnGrokPty,
  spawnMusePty,
  spawnCopilotPty,
  spawnCursorPty,
  spawnCommandPty,
  spawnLauncherPty,
  resolveLauncher,
  mcpConfigJson: (sessionId, host) => mcpConfigJson({ sessionId, host, port: PORT, userMcpServers: getUserMcpServers() }),
  guiMcpTools: GUI_MCP_TOOLS,
});

// A bind failure (most often the port already in use) must not surface as an unhandled
// 'error' event / stack trace — exit with a clear message and the code the launcher reads
// (infra/server-exit.ts).
server.on("error", (err) => {
  const { message, code } = serverErrorExit(err, PORT);
  console.error(message);
  process.exit(code);
});

// Number(): PORT comes from the environment as a string, and the (port, host, cb) overload
// takes a number — the (port, cb) form we used before accepted either.
server.listen(Number(PORT), BIND_HOST, () => onListening({ server, loopbackServers, browserHostnames }));

installShutdownHandlers();
