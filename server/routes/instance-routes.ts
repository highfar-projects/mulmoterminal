// `GET /api/instance` — which process is serving this port (#1820).
//
// It exists for one caller and one question. `mulmoterminal stop` reads
// ~/.mulmoterminal/instances/<pid>.json and signals the pid it finds, and A LIVE PID IS NOT AN
// IDENTITY: a server that was killed outright leaves its file behind, and the OS is free to hand
// that pid to something else afterwards. Signalling on the file alone would SIGTERM a stranger's
// process (raised by both review bots on #1824).
//
// Answering that from the port is not enough either — something else being up on the recorded port
// says nothing about the recorded PID, which is a server that crashed and was restarted on the SAME
// port while its old pid got reused. Only the process itself can settle it, so it says so here: the
// entry is trustworthy exactly when the server answering that port reports the pid the file names.
//
// A GET, so the central same-origin gate exempts it (a safe method cannot be told apart from a
// cross-site <img>, see same-origin-guard.ts) — which is right for this one: it is read-only, and
// the pid it discloses is no use to anyone who cannot already reach a server that spawns agents.
//
// No counterpart in MulmoClaude, which stops from its own UI and never needs to identify a process
// from outside — so this id is ours to choose, unlike /api/shutdown.
import type { Express } from "express";

export interface InstanceIdentity {
  pid: number;
}

export function mountInstanceRoute(app: Express, pid: number = process.pid): void {
  app.get("/api/instance", (_req, res) => {
    const identity: InstanceIdentity = { pid };
    res.json(identity);
  });
}
