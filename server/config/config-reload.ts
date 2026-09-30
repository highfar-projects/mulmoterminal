// Reading config.json again while the server runs (#2627). A hand-edit, or an agent writing the
// file with its own tools, reached nothing until a restart: the server reads the file at boot and
// otherwise only adopts what its own POST /api/config wrote.
//
// The rule is the boot rule, minus the exit: what would stop the server starting is refused here,
// and the running config is kept rather than half-adopting a file that cannot be read.
import type { Express, Response } from "express";
import { emptyConfig, loadAppConfigResult, type AppConfig, type AppConfigLoad } from "./app-config.js";
import { checkKeymap } from "./keymap-check.js";
import { withConfigLock } from "./config-lock.js";
import { readTextFile } from "../infra/read-text-file.js";

export type ReloadDecision = { adopt: true; config: AppConfig } | { adopt: false; error: string; problems: string[] };

/** Whether to adopt what is on disk. A missing file is adopted as an empty config — what a start
 *  with no file runs on. */
export function decideReload(loaded: AppConfigLoad, keymapErrors: readonly string[], empty: AppConfig): ReloadDecision {
  if (loaded.status === "corrupt") return { adopt: false, error: `config.json could not be read, so nothing was reloaded: ${loaded.error}`, problems: [] };
  if (keymapErrors.length > 0) {
    return { adopt: false, error: "the keymap in config.json would stop MulmoTerminal from starting, so nothing was reloaded", problems: [...keymapErrors] };
  }
  return { adopt: true, config: loaded.status === "ok" ? loaded.config : empty };
}

// The keymap check needs the file as written: the loaded config has already dropped what it
// could not use, which is exactly what the check is looking for.
function rawConfig(file: string): unknown {
  try {
    return JSON.parse(readTextFile(file));
  } catch {
    return undefined;
  }
}

export interface ConfigReloadDeps {
  file: string;
  /** Make `next` the running config, and tell whoever depends on what moved. */
  adopt: (next: AppConfig) => void;
  respond: (res: Response) => void;
  lockFailure: (res: Response, err: unknown) => void;
}

export function mountConfigReloadRoute(app: Express, deps: ConfigReloadDeps): void {
  app.post("/api/config/reload", async (_req, res) => {
    try {
      // Under the lock, so a write another instance is making cannot be read half-way.
      await withConfigLock(deps.file, () => {
        const decision = decideReload(loadAppConfigResult(deps.file), checkKeymap(rawConfig(deps.file)).errors, emptyConfig());
        if (!decision.adopt) {
          res.status(409).json({ error: decision.error, problems: decision.problems });
          return;
        }
        deps.adopt(decision.config);
        deps.respond(res);
      });
    } catch (err) {
      deps.lockFailure(res, err);
    }
  });
}
