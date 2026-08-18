import type { Express } from "express";
import { readMachineLoad } from "../infra/machine-load.js";
import type { MachineLoad } from "../../common/machineLoad.js";

// A GET, unlike the rate-limit twin it sits beside on the header. That one is a POST because
// asking is what permits the server to spend a Claude query on a probe (`same-origin-guard.ts`);
// this one reads two numbers the kernel already keeps, so there is nothing for a cross-site
// request to spend.
//
// `null` is the answer on a host that keeps no load average, and it says so in the field rather
// than by a status: the header has to tell "this machine does not report one" from "the request
// failed", and both would otherwise arrive as an empty body.
export function mountLoadRoute(app: Express, readLoad: () => MachineLoad | null = readMachineLoad): void {
  app.get("/api/load", (_req, res) => {
    res.json({ load: readLoad() });
  });
}
