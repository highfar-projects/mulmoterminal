// The Processes page over HTTP (#2219): each session's process tree, and ending one process in it.
// Nothing runs while nobody asks — the page polls, and each poll is one `ps` and one tmux listing.
import type { Express } from "express";
import { requestOriginAllowed } from "./same-origin-guard.js";
import { requestBody } from "./requestBody.js";
import type { ProcessDetail } from "../infra/process-list.js";
import { buildSessionProcesses, cpuBaselineOf, killVerdict, type CpuBaseline } from "../session/session-processes.js";
import type { SessionProcesses } from "../../common/sessionProcesses.js";

export interface ProcessRouteDeps {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
  listProcesses: () => Promise<ProcessDetail[] | null>;
  listPanePids: () => Promise<ReadonlyMap<string, readonly number[]> | null>;
  cwdOf: (sessionId: string) => string | null;
  sendSignal: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// A baseline older than this measures the time the page was closed, not what is spinning now.
const BASELINE_MAX_AGE_MS = 60_000;
// Long enough for a dev server to shut down cleanly; short enough to wait on in the request.
const TERM_GRACE_MS = 3_000;
const EXIT_POLL_MS = 200;

type Presence = "running" | "gone" | "unknown";

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function mountProcessRoutes(app: Express, deps: ProcessRouteDeps): void {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  let baseline: CpuBaseline | null = null;

  const readSessions = async (): Promise<{ rows: ProcessDetail[]; sessions: SessionProcesses[] } | null> => {
    const [rows, panePids] = await Promise.all([deps.listProcesses(), deps.listPanePids()]);
    if (rows === null || panePids === null) return null;
    const atMs = now();
    const usable = baseline !== null && atMs - baseline.atMs <= BASELINE_MAX_AGE_MS ? baseline : null;
    baseline = cpuBaselineOf(rows, atMs);
    return { rows, sessions: buildSessionProcesses({ rows, panePids, cwdOf: deps.cwdOf, baseline: usable, atMs }) };
  };

  // "unknown" when `ps` cannot answer: then nothing can confirm it is still the same process, so
  // the caller must not escalate to SIGKILL on the strength of it.
  const presence = async (pid: number, startedAt: string): Promise<Presence> => {
    const rows = await deps.listProcesses();
    if (rows === null) return "unknown";
    return rows.some((row) => row.pid === pid && row.startedAt === startedAt) ? "running" : "gone";
  };

  const waitForExit = async (pid: number, startedAt: string): Promise<Presence> => {
    let last: Presence = "running";
    for (let waited = 0; waited < TERM_GRACE_MS && last === "running"; waited += EXIT_POLL_MS) {
      await sleep(EXIT_POLL_MS);
      last = await presence(pid, startedAt);
    }
    return last;
  };

  // A signal to a process that exited a moment ago throws ESRCH; that is the outcome asked for.
  const signal = (pid: number, name: "SIGTERM" | "SIGKILL"): void => {
    try {
      deps.sendSignal(pid, name);
    } catch {
      /* already gone */
    }
  };

  app.get("/api/processes", async (req, res) => {
    if (!requestOriginAllowed(req, deps.isAllowedOrigin)) return res.status(403).json({ error: "forbidden origin" });
    const read = await readSessions();
    if (read === null) return res.status(503).json({ error: "could not list processes" });
    return res.json({ sessions: read.sessions });
  });

  // SIGTERM, then SIGKILL if the SAME process (pid and start time) is still there after the grace.
  app.post("/api/processes/kill", async (req, res) => {
    if (!requestOriginAllowed(req, deps.isAllowedOrigin)) return res.status(403).json({ error: "forbidden origin" });
    const { pid, startedAt } = requestBody(req.body);
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1 || typeof startedAt !== "string") {
      return res.status(400).json({ error: "pid and startedAt are required" });
    }
    const read = await readSessions();
    if (read === null) return res.status(503).json({ error: "could not list processes" });
    const verdict = killVerdict(read.sessions, pid, startedAt);
    if (verdict === "gone") return res.status(404).json({ error: "no such process in any session" });
    if (verdict === "pane-root") return res.status(409).json({ error: "this is the session itself; end the session instead" });
    signal(pid, "SIGTERM");
    const afterTerm = await waitForExit(pid, startedAt);
    if (afterTerm !== "running") return res.json({ ok: true, ended: afterTerm === "gone", forced: false });
    signal(pid, "SIGKILL");
    return res.json({ ok: true, ended: (await waitForExit(pid, startedAt)) === "gone", forced: true });
  });
}
