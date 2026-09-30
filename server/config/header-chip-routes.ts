// The global header chips changed one at a time from Settings (#2622), against the config ON DISK.
// A remove or a move names the chip the caller saw at that index, so a list that changed since it
// loaded is refused with the current one rather than acted on by position.
import type { Express, Response } from "express";
import { chipsMoved, chipsWithAdded, chipsWithout, isChipEntry, type ChipEntry } from "../../common/headerChips.js";
import type { AppConfig } from "./app-config.js";
import type { MutateOnDisk } from "./agent-entry-routes.js";
import { requestBody } from "../routes/requestBody.js";

type Changed = { chips: ChipEntry[] } | { problem: string };

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function changeChips(res: Response, mutate: MutateOnDisk, change: (base: AppConfig) => Changed): void {
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

export function mountHeaderChipRoutes(app: Express, mutate: MutateOnDisk): void {
  app.post("/api/config/chips/add", (req, res) => {
    const body = requestBody(req.body);
    const draft = { builtin: text(body.builtin), label: text(body.label), text: text(body.text), when: text(body.when) };
    changeChips(res, mutate, (base) => chipsWithAdded(base.chips, draft));
  });

  app.post("/api/config/chips/remove", (req, res) => {
    const body = requestBody(req.body);
    const { index, chip } = body;
    if (typeof index !== "number" || !isChipEntry(chip)) return res.status(400).json({ error: "index and chip are required" });
    return changeChips(res, mutate, (base) => chipsWithout(base.chips, index, chip));
  });

  app.post("/api/config/chips/move", (req, res) => {
    const body = requestBody(req.body);
    const { index, chip, delta } = body;
    if (typeof index !== "number" || !isChipEntry(chip) || (delta !== -1 && delta !== 1)) {
      return res.status(400).json({ error: "index, chip and a delta of -1 or 1 are required" });
    }
    return changeChips(res, mutate, (base) => chipsMoved(base.chips, index, delta, chip));
  });

  // Back to the built-in set: the key is removed, not written as that set, so a later change to the
  // defaults reaches this user too.
  app.post("/api/config/chips/reset", (_req, res) => {
    void mutate(res, { update: () => ({ chips: null }), answer: (next) => res.json({ chips: next.chips }) });
  });
}
