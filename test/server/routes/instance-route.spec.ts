// @vitest-environment node
// The only reason this route exists: `mulmoterminal stop` must be able to prove that the pid in
// ~/.mulmoterminal/instances/<pid>.json is the process actually serving that port, before it sends
// SIGTERM to it. A live pid is not an identity, and neither is a port that merely answers.
import { describe, it, expect } from "vitest";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountInstanceRoute } from "../../../server/routes/instance-routes";

const mounted = (pid: number) => {
  const app = express();
  mountInstanceRoute(app, pid);
  return routeCall(app);
};

describe("GET /api/instance", () => {
  it("reports the pid serving this port, which is the whole contract", async () => {
    const res = await mounted(4242)("/api/instance");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pid: 4242 });
  });

  it("says nothing else — a reader outside the app gets an identity, not a status page", async () => {
    const res = await mounted(4242)("/api/instance");
    expect(Object.keys(res.body)).toEqual(["pid"]);
  });

  it("stays a GET: the stopper has no browser and sends no Origin, and this changes nothing", async () => {
    // A POST would be gated by the same-origin guard, which a CLI cannot satisfy. Read-only is
    // what makes the safe-method exemption correct here rather than a hole.
    const res = await mounted(4242)("/api/instance", jsonPost({}));
    expect(res.status).toBe(404);
  });
});
