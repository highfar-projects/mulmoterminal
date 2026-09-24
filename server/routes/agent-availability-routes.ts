// GET /api/agents/availability — which agents this machine can start (#2229).
//
// Answered from a snapshot taken at server start, by the user's choice: an agent installed while
// the server runs appears after a restart. The snapshot is handed in, so this route cannot re-check.
import type { Express } from "express";
import type { AgentAvailability, AgentAvailabilityResponse } from "../../common/agentAvailability.js";

export function mountAgentAvailabilityRoutes(app: Express, availability: readonly AgentAvailability[]): void {
  const body: AgentAvailabilityResponse = { agents: [...availability] };
  app.get("/api/agents/availability", (_req, res) => {
    res.json(body);
  });
}
