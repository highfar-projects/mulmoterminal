// @vitest-environment node
// The route is three lines; what it has to get right is the difference between "this machine is
// idle" and "this machine does not report a load", which reach the browser as 0 and null.
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { mountLoadRoute } from "../../../server/routes/load-routes.js";
import os from "node:os";
import { readMachineLoad } from "../../../server/infra/machine-load.js";

const appWith = (readLoad: Parameters<typeof mountLoadRoute>[1]) => {
  const app = express();
  mountLoadRoute(app, readLoad);
  return app;
};

describe("GET /api/load", () => {
  it("sends the reading the host gave it", async () => {
    const load = { avg1: 66.84, avg5: 59.88, avg15: 55.24, cores: 20 };
    const res = await request(appWith(() => load)).get("/api/load");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ load });
  });

  // A field rather than a status: the header has to tell "this host keeps no load average" from
  // "the request failed", and a 204 or a 404 would arrive as the second.
  it("answers 200 with a null reading where there is none", async () => {
    const res = await request(appWith(() => null)).get("/api/load");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ load: null });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readMachineLoad", () => {
  // The adapter is one line, and the one thing a line like that gets wrong is which number goes
  // where — a swap of `cores` and an average keeps every shape assertion below true. Spied rather
  // than module-mocked because this repo has no `vi.mock("node:os")` anywhere, and specs that need
  // a platform skip on it instead (CodeRabbit on #1791; the win32 branch is covered exhaustively
  // in common/machineLoad.spec.ts, which is where the rule itself lives).
  it.skipIf(process.platform === "win32")("maps loadavg and the core count onto the reading", () => {
    vi.spyOn(os, "loadavg").mockReturnValue([66.84, 59.88, 55.24]);
    const cpu: os.CpuInfo = { model: "test", speed: 1, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } };
    vi.spyOn(os, "cpus").mockReturnValue(new Array(20).fill(cpu));
    expect(readMachineLoad()).toEqual({ avg1: 66.84, avg5: 59.88, avg15: 55.24, cores: 20 });
  });

  // Runs against the real machine, so it asserts the SHAPE rather than any figure. On Windows
  // the honest answer is null, and that is the branch under test there.
  it("reports this machine, or nothing at all", () => {
    const load = readMachineLoad();
    if (process.platform === "win32") {
      expect(load).toBeNull();
      return;
    }
    expect(load).not.toBeNull();
    expect(load?.cores).toBeGreaterThan(0);
    expect(load?.avg1).toBeGreaterThanOrEqual(0);
  });
});
