// Devcontainer support for a managed worktree (see server/git/worktrees.ts): detecting whether
// one was created with a `.devcontainer/devcontainer.json`, running `devcontainer up` for it on
// request, and — once that succeeds — persisting the decision so every later spawn in that
// directory (see session/spawn-claude.ts) runs through `devcontainer exec` instead of the host.
//
// Deliberately NOT inferred from the file's mere presence: building/starting the container is a
// real, possibly slow decision the user makes once per worktree (the launcher confirms before
// doing it), not something every spawn should silently redo.
import { existsSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { DIR_LOCAL_CONFIG_FILE } from "./dir-config.js";
import { readJsonFile } from "../infra/read-text-file.js";
import { isRecord } from "../../common/isRecord.js";
import { worktreeRepoRootMount } from "../git/worktrees.js";

/** Whether `dir` has a devcontainer config, checked the same way the `devcontainer` CLI itself
 *  resolves one (`.devcontainer/devcontainer.json`, else `.devcontainer.json`). */
export function hasDevcontainerConfig(dir: string): boolean {
  return existsSync(path.join(dir, ".devcontainer", "devcontainer.json")) || existsSync(path.join(dir, ".devcontainer.json"));
}

// A build (base image pull, apt installs, postCreateCommand) can run several minutes on a cold
// cache — far past SLOW_COMMAND_TIMEOUT_MS's 60s, which is sized for a `git`/`gh` call, not a
// Docker build. Still bounded, for the same reason every other timeout in this app is: a build
// that hasn't finished in 10 minutes is not going to next second either.
const DEVCONTAINER_UP_TIMEOUT_MS = 10 * 60_000;

/** Runs `devcontainer up` for the worktree at `dir`. Needs an explicit `--mount` for the repo root
 *  `dir`'s `.git` file points back to (see worktreeRepoRootMount) because the workspace folder is
 *  a git worktree, not a plain clone — without it the container can't do git operations against
 *  the shared `.git`. Not `--mount-git-worktree-common-dir`: that only resolves a *relative* `.git`
 *  pointer against wherever the worktree lands inside the container, and silently breaks once the
 *  target's own devcontainer.json puts workspaceFolder somewhere too shallow for the traversal —
 *  worktreeRepoRootMount's absolute-pointer approach doesn't have that failure mode. */
export async function runDevcontainerUp(dir: string): Promise<{ ok: boolean; output: string }> {
  const mount = await worktreeRepoRootMount(dir);
  const args = ["up", "--workspace-folder", dir, ...(mount ? ["--mount", mount] : [])];
  return new Promise((resolve) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'devcontainer' is a standard tool from PATH, same convention as git() in worktrees.ts; all inputs go through argv (no shell)
    const child = spawn("devcontainer", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: DEVCONTAINER_UP_TIMEOUT_MS,
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", (err) => resolve({ ok: false, output: String(err) }));
    child.on("close", (code) => resolve({ ok: code === 0, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

/** Marks `dir` as "run its sessions through `devcontainer exec`" — merged into the worktree's own
 *  `.mulmoterminal.local.json` (never the shared file: this is a per-clone runtime fact, not
 *  something to commit) so a worktree created with `writeInheritedDirConfig`'s colours keeps them. */
export function markDevcontainerEnabled(dir: string): void {
  const file = path.join(dir, DIR_LOCAL_CONFIG_FILE);
  let config: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const raw: unknown = readJsonFile(file);
      if (isRecord(raw)) config = raw;
    } catch {
      // A local file a human broke by hand: overwritten below rather than left blocking the
      // one setting this call exists to write. Best-effort, like every other dir-config writer.
    }
  }
  config.devcontainer = true;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
