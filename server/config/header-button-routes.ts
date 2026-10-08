// The global header buttons changed one entry at a time from Settings (#2622), against the config ON
// DISK. Entries are named by id, which the loader keeps unique across the list, so a remove or move
// cannot land on a different entry than the one pressed. What each request does is decided in
// header-entry-changes.ts, which a directory's buttons are changed through as well.
import type { Express, Response } from "express";
import type { AppConfig } from "./app-config.js";
import type { MutateOnDisk } from "./agent-entry-routes.js";
import { DEFAULT_BUTTONS } from "./header-config.js";
import { requestBody } from "../routes/requestBody.js";
import { buttonChangeFor, type ButtonsChanged } from "./header-entry-changes.js";

function changeButtons(res: Response, mutate: MutateOnDisk, change: (base: AppConfig) => ButtonsChanged): void {
  void mutate(res, {
    refuse: (base) => {
      const changed = change(base);
      // The list as it is on disk rides along, so a tab that was behind shows it instead.
      return "problem" in changed ? { error: changed.problem, buttons: base.buttons } : null;
    },
    update: (base) => {
      const changed = change(base);
      return { buttons: "entries" in changed ? changed.entries : base.buttons };
    },
    answer: (next) => res.json({ buttons: next.buttons }),
  });
}

// Everything but `reset` — a folder is made by putting a button into it, and goes when its last button
// is taken out.
const ACTIONS = ["add", "edit", "remove", "move", "into-folder", "out-of-folder", "folder-edit"] as const;

export function mountHeaderButtonRoutes(app: Express, mutate: MutateOnDisk): void {
  ACTIONS.forEach((action) => {
    app.post(`/api/config/buttons/${action}`, (req, res) => {
      const change = buttonChangeFor(action, requestBody(req.body), DEFAULT_BUTTONS);
      if (typeof change === "string") return res.status(400).json({ error: change });
      return changeButtons(res, mutate, (base) => change(base.buttons));
    });
  });

  // Back to the built-in set: the key is removed rather than written as that set, so a later change
  // to the defaults reaches this user too.
  app.post("/api/config/buttons/reset", (_req, res) => {
    void mutate(res, { update: () => ({ buttons: null }), answer: (next) => res.json({ buttons: next.buttons }) });
  });
}
