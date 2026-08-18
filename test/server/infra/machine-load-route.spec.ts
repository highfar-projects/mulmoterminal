// @vitest-environment node
// The route is three lines; what it has to get right is the difference between "this machine is
// idle" and "this machine does not report a load", which reach the browser as 0 and null.
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { mountLoadRoute } from "../../../server/routes/load-routes.js";
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

describe("readMachineLoad", () => {
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
