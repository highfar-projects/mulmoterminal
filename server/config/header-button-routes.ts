// The global header buttons changed one entry at a time from Settings (#2622), against the config ON
// DISK. Entries are named by id, which the loader keeps unique across the list, so a remove or move
// cannot land on a different entry than the one pressed.
import type { Express, Response } from "express";
import { entriesMoved, entriesWithAdded, entriesWithout, isEditableRun, type ButtonProblem, type NewButton } from "../../common/headerButtonEntries.js";
import type { AppConfig } from "./app-config.js";
import type { MutateOnDisk } from "./agent-entry-routes.js";
import { DEFAULT_BUTTONS } from "./header-config.js";
import type { HeaderEntry } from "./config-schema.js";
import { requestBody } from "../routes/requestBody.js";

type Changed = { entries: (HeaderEntry | NewButton)[] } | { problem: ButtonProblem };

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function changeButtons(res: Response, mutate: MutateOnDisk, change: (base: AppConfig) => Changed): void {
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

export function mountHeaderButtonRoutes(app: Express, mutate: MutateOnDisk): void {
  app.post("/api/config/buttons/add", (req, res) => {
    const body = requestBody(req.body);
    if (!isEditableRun(body.run)) return res.status(400).json({ error: "run must be shell, input, open or action" });
    const draft = {
      label: text(body.label),
      icon: text(body.icon),
      run: body.run,
      payload: text(body.payload),
      target: text(body.target),
      when: text(body.when),
    };
    return changeButtons(res, mutate, (base) => entriesWithAdded(base.buttons, DEFAULT_BUTTONS, draft));
  });

  app.post("/api/config/buttons/remove", (req, res) => {
    const id = text(requestBody(req.body).id);
    if (!id) return res.status(400).json({ error: "id is required" });
    return changeButtons(res, mutate, (base) => entriesWithout(base.buttons, DEFAULT_BUTTONS, id));
  });

  app.post("/api/config/buttons/move", (req, res) => {
    const { id, delta } = requestBody(req.body);
    if (typeof id !== "string" || !id || (delta !== -1 && delta !== 1)) return res.status(400).json({ error: "id and a delta of -1 or 1 are required" });
    return changeButtons(res, mutate, (base) => entriesMoved(base.buttons, DEFAULT_BUTTONS, id, delta));
  });

  // Back to the built-in set: the key is removed rather than written as that set, so a later change
  // to the defaults reaches this user too.
  app.post("/api/config/buttons/reset", (_req, res) => {
    void mutate(res, { update: () => ({ buttons: null }), answer: (next) => res.json({ buttons: next.buttons }) });
  });
}
