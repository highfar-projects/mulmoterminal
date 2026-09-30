// One shortcut set or cleared from Settings (#2619), on the keymap ON DISK under the lock — `keymap`
// is replaced whole on a write, so a tab sending its copy would erase a binding the keys skill, another
// tab or a hand-edit wrote since. The result is checked the way the server's start is: a binding that
// would stop it starting is refused, and whatever else the check says comes back as warnings.
import type { Express } from "express";
import { isKeymapAction, validateKeymap, type Keymap } from "../../common/keymap.js";
import type { AppConfig } from "./app-config.js";
import type { MutateOnDisk } from "./agent-entry-routes.js";
import { requestBody } from "../routes/requestBody.js";

export function keymapWithBinding(keymap: Keymap, action: string, binding: string | null): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(keymap).filter(([name]) => name !== action));
  return binding === null ? rest : { ...rest, [action]: binding };
}

// `null` clears the shortcut; a string sets it; anything else is not a request this route answers.
function bindingOf(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : undefined;
}

const problemsFor = (keymap: Record<string, unknown>, action: string) => validateKeymap(keymap).filter((problem) => problem.action === action);

export function mountKeymapBindingRoute(app: Express, mutate: MutateOnDisk): void {
  app.post("/api/config/keymap/binding", (req, res) => {
    const body = requestBody(req.body);
    const action = body.action;
    const binding = bindingOf(body.binding);
    if (!isKeymapAction(action) || binding === undefined || binding === "")
      return res.status(400).json({ error: "action and binding (string or null) required" });
    const next = (base: AppConfig) => keymapWithBinding(base.keymap, action, binding);
    return void mutate(res, {
      refuse: (base) => {
        const fatal = problemsFor(next(base), action).filter((problem) => problem.fatal);
        return fatal.length ? { error: "fatal", problems: fatal.map((problem) => problem.reason) } : null;
      },
      update: (base) => ({ keymap: next(base) }),
      answer: (saved) => res.json({ keymap: saved.keymap, warnings: problemsFor(saved.keymap, action).map((problem) => problem.reason) }),
    });
  });
}
