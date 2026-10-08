// The global header chips changed one at a time from Settings (#2622), against the config ON DISK.
// What each request does is decided in header-entry-changes.ts, which a directory's chips are changed
// through as well.
import type { Express, Response } from "express";
import type { AppConfig } from "../app-config.js";
import type { MutateOnDisk } from "../agent/agent-entry-routes.js";
import { requestBody } from "../../routes/requestBody.js";
import { chipChangeFor, type ChipsChanged } from "./header-entry-changes.js";

function changeChips(res: Response, mutate: MutateOnDisk, change: (base: AppConfig) => ChipsChanged): void {
  void mutate(res, {
    refuse: (base) => {
      const changed = change(base);
      return "problem" in changed ? { error: changed.problem, chips: base.chips } : null;
    },
    update: (base) => {
      const changed = change(base);
      return { chips: "chips" in changed ? changed.chips : base.chips };
    },
    answer: (next) => res.json({ chips: next.chips }),
  });
}

const ACTIONS = ["add", "remove", "move"] as const;

export function mountHeaderChipRoutes(app: Express, mutate: MutateOnDisk): void {
  ACTIONS.forEach((action) => {
    app.post(`/api/config/chips/${action}`, (req, res) => {
      const change = chipChangeFor(action, requestBody(req.body));
      if (typeof change === "string") return res.status(400).json({ error: change });
      return changeChips(res, mutate, (base) => change(base.chips));
    });
  });

  // Back to the built-in set: the key is removed, not written as that set, so a later change to the
  // defaults reaches this user too.
  app.post("/api/config/chips/reset", (_req, res) => {
    void mutate(res, { update: () => ({ chips: null }), answer: (next) => res.json({ chips: next.chips }) });
  });
}
