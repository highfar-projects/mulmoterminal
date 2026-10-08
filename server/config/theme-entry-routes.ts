// A custom theme copied, recoloured or removed from Settings (#2623), one theme at a time against
// the config ON DISK — a tab's copy of the list would drop a theme the skill wrote since it loaded.
import type { Express } from "express";
import { duplicateTheme, themeColorsFrom, themesWithColors } from "../../common/themeEntries.js";
import type { AppConfig } from "./app-config.js";
import type { MutateOnDisk } from "./agent/agent-entry-routes.js";
import { requestBody } from "../routes/requestBody.js";
import { refuseOnProblem } from "./on-disk-entry.js";

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function mountThemeEntryRoutes(app: Express, mutate: MutateOnDisk): void {
  app.post("/api/config/themes/duplicate", (req, res) => {
    const body = requestBody(req.body);
    const build = (base: AppConfig) => duplicateTheme(text(body.source), text(body.label), base.themes);
    // The copy's id is chosen against the list under the lock, so the answer names it for the
    // caller to switch to.
    let createdId: string | null = null;
    void mutate(res, {
      refuse: refuseOnProblem(build),
      update: (base) => {
        const built = build(base);
        if ("problem" in built) return { themes: base.themes };
        createdId = built.theme.id;
        return { themes: [...base.themes, built.theme] };
      },
      answer: (next) => res.json({ themes: next.themes, id: createdId }),
    });
  });

  app.post("/api/config/themes/colors", (req, res) => {
    const body = requestBody(req.body);
    const id = text(body.id);
    const colors = themeColorsFrom(body.colors);
    if (!id || colors === null) return res.status(400).json({ error: "id and colors of theme variables are required" });
    const change = (base: AppConfig) => themesWithColors(base.themes, id, colors);
    return void mutate(res, {
      refuse: refuseOnProblem(change),
      update: (base) => {
        const changed = change(base);
        return { themes: "themes" in changed ? changed.themes : base.themes };
      },
      answer: (next) => res.json({ themes: next.themes }),
    });
  });

  app.post("/api/config/themes/remove", (req, res) => {
    const id = text(requestBody(req.body).id);
    if (!id) return res.status(400).json({ error: "id is required" });
    return void mutate(res, {
      update: (base) => ({ themes: base.themes.filter((theme) => theme.id !== id) }),
      answer: (next) => res.json({ themes: next.themes }),
    });
  });
}
