// @vitest-environment node
// Ending one process from the Processes page: only a process under a session, never the session
// itself, and SIGKILL only for the SAME process still running after SIGTERM's grace.
import { describe, it, expect } from "vitest";
import type { Express } from "express";
import type { ProcessDetail } from "../../../server/infra/process-list";
import { mountProcessRoutes, type ProcessRouteDeps } from "../../../server/routes/process-routes";

interface FakeRes {
  statusCode: number;
  payload: unknown;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
}
const makeRes = (): FakeRes => ({
  statusCode: 200,
  payload: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.payload = body;
    return this;
  },
});

type Req = { headers: { origin?: string }; body?: unknown; method: string; path: string };
type Handler = (req: Req, res: FakeRes) => Promise<unknown>;

const row = (pid: number, ppid: number, cpuSeconds = 0): ProcessDetail => ({
  pid,
  ppid,
  cpuSeconds,
  rssKb: 1,
  elapsedSeconds: 1,
  startedAt: `start-${pid}`,
  command: `cmd-${pid}`,
});
const TREE = [row(100, 1), row(110, 100)];

/** `listings` is what successive `ps` calls answer; the last one repeats. */
function mount(listings: (ProcessDetail[] | null)[], extra: Partial<ProcessRouteDeps> = {}) {
  const handlers = new Map<string, Handler>();
  const capture = (method: string) => (p: string, h: (req: Req, res: FakeRes) => Promise<unknown>) =>
    handlers.set(`${method} ${p}`, (req, res) => h({ ...req, method, path: p }, res));
  const app = { get: capture("GET"), post: capture("POST") } as unknown as Express;
  const signals: [number, string][] = [];
  let call = 0;
  let clock = 0;
  mountProcessRoutes(app, {
    isAllowedOrigin: () => true,
    listProcesses: async () => listings[Math.min(call++, listings.length - 1)] ?? null,
    listPanePids: async () => new Map([["a", [100]]]),
    cwdOf: () => "/work",
    sendSignal: (pid, signal) => void signals.push([pid, signal]),
    now: () => (clock += 2000),
    sleep: async () => undefined,
    ...extra,
  });
  const run = async (key: string, body?: unknown) => {
    const res = makeRes();
    await handlers.get(key)?.({ headers: {}, body, method: "", path: "" }, res);
    return res;
  };
  return { signals, list: () => run("GET /api/processes"), kill: (body: unknown) => run("POST /api/processes/kill", body) };
}

describe("GET /api/processes", () => {
  it("lists each session's processes, with CPU from the second read on", async () => {
    const { list } = mount([TREE, [row(100, 1, 1), row(110, 100)]]);
    const first = (await list()).payload as { sessions: { processes: { cpuPercent: number | null }[] }[] };
    expect(first.sessions[0]?.processes.map((p) => p.cpuPercent)).toEqual([null, null]);
    const second = (await list()).payload as typeof first;
    expect(second.sessions[0]?.processes.map((p) => p.cpuPercent)).toEqual([50, 0]);
  });

  it("is a 503 when ps cannot answer", async () => {
    expect((await mount([null]).list()).statusCode).toBe(503);
  });
});

describe("POST /api/processes/kill", () => {
  it("sends SIGTERM and stops there when the process exits", async () => {
    const { kill, signals } = mount([TREE, [row(100, 1)]]);
    const res = await kill({ pid: 110, startedAt: "start-110" });
    expect(res.payload).toEqual({ ok: true, ended: true, forced: false });
    expect(signals).toEqual([[110, "SIGTERM"]]);
  });

  it("escalates to SIGKILL when the same process is still there after the grace", async () => {
    const { kill, signals } = mount([TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, TREE, [row(100, 1)]]);
    const res = await kill({ pid: 110, startedAt: "start-110" });
    expect(signals).toEqual([
      [110, "SIGTERM"],
      [110, "SIGKILL"],
    ]);
    expect(res.payload).toEqual({ ok: true, ended: true, forced: true });
  });

  it("does not escalate when ps stops answering, since nothing confirms it is the same process", async () => {
    const { kill, signals } = mount([TREE, null]);
    const res = await kill({ pid: 110, startedAt: "start-110" });
    expect(signals).toEqual([[110, "SIGTERM"]]);
    expect(res.payload).toEqual({ ok: true, ended: false, forced: false });
  });

  it("does not escalate onto a new process that reused the pid", async () => {
    const reused = [row(100, 1), { ...row(110, 100), startedAt: "a later start" }];
    const { kill, signals } = mount([TREE, reused]);
    await kill({ pid: 110, startedAt: "start-110" });
    expect(signals).toEqual([[110, "SIGTERM"]]);
  });

  it("treats a signal to a process that has just exited as success", async () => {
    const { kill } = mount([TREE, [row(100, 1)]], {
      sendSignal: () => {
        throw new Error("ESRCH");
      },
    });
    expect((await kill({ pid: 110, startedAt: "start-110" })).payload).toEqual({ ok: true, ended: true, forced: false });
  });

  it.each([
    ["the session's own process", { pid: 100, startedAt: "start-100" }, 409],
    ["a process outside every session", { pid: 999, startedAt: "start-999" }, 404],
    ["a stale start time", { pid: 110, startedAt: "yesterday" }, 404],
    ["no start time", { pid: 110 }, 400],
    ["a pid that is not an integer", { pid: "110", startedAt: "start-110" }, 400],
    ["pid 1", { pid: 1, startedAt: "start-1" }, 400],
  ])("refuses %s without signalling", async (_name, body, status) => {
    const { kill, signals } = mount([TREE]);
    expect((await kill(body)).statusCode).toBe(status);
    expect(signals).toEqual([]);
  });

  it("refuses a forbidden origin without signalling", async () => {
    const { kill, signals } = mount([TREE], { isAllowedOrigin: () => false });
    expect((await kill({ pid: 110, startedAt: "start-110" })).statusCode).toBe(403);
    expect(signals).toEqual([]);
  });
});
