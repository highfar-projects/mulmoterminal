// One shortcut set or cleared from Settings (#2619), on the keymap ON DISK under the lock — `keymap`
// is replaced whole on a write, so a tab sending its copy would erase a binding the keys skill, another
// tab or a hand-edit wrote since. The result is checked the way the server's start is: a binding that
// would stop it starting is refused, and whatever else the check says comes back as warnings.
import type { Express } from "express";
import { isKeymapAction, validateKeymap, type Keymap } from "../../../common/keymap.js";
import type { AppConfig } from "../app-config.js";
import type { MutateOnDisk } from "../agent/agent-entry-routes.js";
import { requestBody } from "../../routes/requestBody.js";

export function keymapWithBinding(keymap: Keymap, action: string, binding: string | null): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(keymap).filter(([name]) => name !== action));
  return binding === null ? rest : { ...rest, [action]: binding };
}

// `null` clears the shortcut; a string sets it; anything else is not a request this route answers.
function bindingOf(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : undefined;
}

// What this change BROUGHT, across the whole keymap: a duplicate is reported on the action that
// LOSES, and a key that starts an existing sequence on the sequence — neither is the edited action,
// and both are exactly what the person pressing the key needs to hear.
const describe = (problem: { action: string; reason: string }) => `${problem.action}: ${problem.reason}`;
function problemsIntroduced(before: Keymap, after: Record<string, unknown>) {
  const existing = new Set(validateKeymap(before).map(describe));
  return validateKeymap(after).filter((problem) => !existing.has(describe(problem)));
}

export function mountKeymapBindingRoute(app: Express, mutate: MutateOnDisk): void {
  app.post("/api/config/keymap/binding", (req, res) => {
    const body = requestBody(req.body);
    const action = body.action;
    const binding = bindingOf(body.binding);
    if (!isKeymapAction(action) || binding === undefined || binding === "")
      return res.status(400).json({ error: "action and binding (string or null) required" });
    const next = (base: AppConfig) => keymapWithBinding(base.keymap, action, binding);
    let introduced: ReturnType<typeof problemsIntroduced> = [];
    return void mutate(res, {
      refuse: (base) => {
        const fatal = problemsIntroduced(base.keymap, next(base)).filter((problem) => problem.fatal);
        return fatal.length ? { error: "fatal", problems: fatal.map(describe) } : null;
      },
      update: (base) => {
        introduced = problemsIntroduced(base.keymap, next(base));
        return { keymap: next(base) };
      },
      answer: (saved) => res.json({ keymap: saved.keymap, warnings: introduced.filter((problem) => !problem.fatal).map(describe) }),
    });
  });
}
