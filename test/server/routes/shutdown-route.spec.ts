// @vitest-environment node
// The contract POST /api/shutdown owes the browser: the reply lands BEFORE the process goes.
// Getting that backwards is not a crash — it is a button that works and looks like it failed,
// because the socket closes before the response can be read.
import { describe, it, expect, vi } from "vitest";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountShutdownRoute } from "../../../server/routes/shutdown-routes";

// A real (tiny) delay rather than fake timers: the request helper awaits a real IO chain, and
// freezing the clock underneath it deadlocks the call. One app and one spy PER TEST, so a stop
// still pending from an earlier test cannot be counted as this one's.
const DELAY_MS = 20;
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mounted() {
  const stop = vi.fn();
  const app = express();
  app.use(express.json());
  mountShutdownRoute(app, { stop, delayMs: DELAY_MS });
  return { stop, call: routeCall(app) };
}

describe("POST /api/shutdown", () => {
  it("answers 200 with the shape the browser switches its screen on", async () => {
    const { call } = mounted();
    const res = await call("/api/shutdown", jsonPost({}));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stopping: true });
  });

  it("has NOT stopped by the time it answers", async () => {
    const { stop, call } = mounted();
    await call("/api/shutdown", jsonPost({}));
    // The whole reason for the delay: stopping inside the handler closes the socket first.
    expect(stop).not.toHaveBeenCalled();
  });

  it("stops once the grace period elapses", async () => {
    const { stop, call } = mounted();
    await call("/api/shutdown", jsonPost({}));
    await settle(DELAY_MS * 3);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops once per request, not once per handler pass", async () => {
    const { stop, call } = mounted();
    await call("/api/shutdown", jsonPost({}));
    await call("/api/shutdown", jsonPost({}));
    await settle(DELAY_MS * 3);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("is not reachable by GET — stopping the server is not a safe method", async () => {
    // It matters beyond tidiness: the central same-origin gate exempts safe methods on purpose
    // (a cross-site <img> sends no Origin), so a GET here would be the one shape it cannot guard.
    const { call } = mounted();
    const res = await call("/api/shutdown");
    expect(res.status).toBe(404);
  });
});
