// Bot jobs wired to this process: the `botJob` command handler the remote host serves, and the
// bot-token routes (plans/feat-bot-gpu-jobs.md). The logic is in botJobHandler.ts / botTokens.ts,
// which take everything here as deps.
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { CommandHandler } from "@mulmoclaude/core/remote-host";
import { getBotJobs, getPushEnabled, getPushKinds } from "../../config/config-routes.js";
import { MULMOTERMINAL_HOME } from "../../config/env.js";
import { sendWebPush } from "../../infra/http/web-push.js";
import { markSessionPlaced, markUnplacedSession, pinSession, ptys, unpinSession } from "../../session/registry.js";
import { currentHostId } from "../remoteHost/index.js";
import { currentIdToken } from "../remoteHost/session.js";
import { createBotJobHandler } from "./botJobHandler.js";
import { printable, type BotJobRequest } from "./jobScript.js";
import { mountBotTokenRoutes } from "./routes.js";

const JOBS_ROOT = path.join(MULMOTERMINAL_HOME, "bot-jobs");
const TOKENS_FILE = path.join(MULMOTERMINAL_HOME, "bot-tokens.json");
const POLL_MS = 1000;

export type SpawnBotJobPty = (sessionId: string, file: string, args: string[], cwd: string) => unknown;

// Pinned BEFORE the spawn, so the reaper never sees it unpinned; marked unplaced before the spawn
// announces it, so the grid's sweep on that announcement finds the mark. A spawn that throws takes
// both back — a mark for a session that never started would be adopted as a dead cell.
const startCell = (spawn: SpawnBotJobPty) => (sessionId: string, file: string, args: string[], cwd: string) => {
  pinSession(sessionId);
  markUnplacedSession(sessionId, "shell");
  try {
    spawn(sessionId, file, args, cwd);
  } catch (err) {
    markSessionPlaced(sessionId);
    unpinSession(sessionId);
    throw err;
  }
};

// A job waiting for approval is the bot-job form of an agent waiting on the user, so it follows the
// same switch as that push ("waiting" in pushKinds).
const notify = (job: BotJobRequest, sessionId: string): void => {
  if (!getPushEnabled() || !getPushKinds().includes("waiting")) return;
  const hostId = currentHostId();
  const what = job.name ? `: ${printable(job.name)}` : "";
  void sendWebPush("Bot job waiting", `${printable(job.from)}${what} — approve it in MulmoTerminal`, { sessionId, ...(hostId ? { hostId } : {}) });
};

export const hostBotJobHandler = (spawn: SpawnBotJobPty): CommandHandler =>
  createBotJobHandler({
    config: getBotJobs,
    platform: process.platform,
    home: os.homedir(),
    jobsRoot: JOBS_ROOT,
    newId: randomUUID,
    startCell: startCell(spawn),
    release: unpinSession,
    isAlive: (sessionId) => ptys.has(sessionId),
    notify,
    pollMs: POLL_MS,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });

export function mountBotJobRoutes(app: Express): void {
  mountBotTokenRoutes(app, {
    file: TOKENS_FILE,
    idToken: currentIdToken,
    hostId: currentHostId,
    fetch: (input, init) => globalThis.fetch(input, init),
    now: () => new Date(),
  });
}
