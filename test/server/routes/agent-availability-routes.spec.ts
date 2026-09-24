// @vitest-environment node
// GET /api/agents/availability answers from the snapshot taken at server start (#2229) — the user's
// choice — so the route is handed one and must not look anything up per request.
import { describe, it, expect } from "vitest";
import express from "express";
import { routeCall } from "../../helpers/routeCall.js";
import { mountAgentAvailabilityRoutes } from "../../../server/routes/agent-availability-routes.js";
import type { AgentAvailability } from "../../../common/agentAvailability.js";

const SNAPSHOT: AgentAvailability[] = [
  { agent: "claude", available: true },
  { agent: "codex", available: false, reason: "missing" },
];

describe("GET /api/agents/availability", () => {
  it("answers with the snapshot it was given", async () => {
    const app = express();
    mountAgentAvailabilityRoutes(app, SNAPSHOT);
    const res = await routeCall(app)("/api/agents/availability");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ agents: SNAPSHOT });
  });

  // A snapshot, not a view of a live list: changing the caller's array later changes nothing served.
  it("keeps serving the start-up answer", async () => {
    const snapshot = [...SNAPSHOT];
    const app = express();
    mountAgentAvailabilityRoutes(app, snapshot);
    snapshot.push({ agent: "grok", available: true });
    const res = await routeCall(app)("/api/agents/availability");
    expect(res.body).toEqual({ agents: SNAPSHOT });
  });
});
