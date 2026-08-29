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
import { hookSocketDir } from "../infra/hook-socket.js";
import { DROPS_ROOT, usableRoot as usableDropsRoot } from "../session/session-drops.js";

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

/** The CLI's own JSON result line — on success, the last non-blank line of stdout:
 *  `{"outcome":"success","containerId":"...","remoteUser":"...","remoteWorkspaceFolder":
 *  "/workspaces/foo"}`. Read back rather than assumed, because that path is the target's OWN
 *  devcontainer.json's call — the devcontainers CLI convention defaults it to
 *  `/workspaces/<repo-name>` when unset, which is almost never `dir` itself. null when the last
 *  line isn't that JSON (an older CLI, or a failed `up` with nothing to read) — the caller's own
 *  `ok` is what decides whether that matters. */
function remoteWorkspaceFolderFrom(output: string): string | null {
  const lines = output.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed) && typeof parsed.remoteWorkspaceFolder === "string") return parsed.remoteWorkspaceFolder;
    } catch {
      // not the JSON line — devcontainer up's stdout carries the build log ahead of it
    }
    return null; // the last non-blank line exists and isn't it; nothing further back is either
  }
  return null;
}

/** Runs `devcontainer up` for the worktree at `dir`. Needs an explicit `--mount` for the repo root
 *  `dir`'s `.git` file points back to (see worktreeRepoRootMount) because the workspace folder is
 *  a git worktree, not a plain clone — without it the container can't do git operations against
 *  the shared `.git`. Not `--mount-git-worktree-common-dir`: that only resolves a *relative* `.git`
 *  pointer against wherever the worktree lands inside the container, and silently breaks once the
 *  target's own devcontainer.json puts workspaceFolder somewhere too shallow for the traversal —
 *  worktreeRepoRootMount's absolute-pointer approach doesn't have that failure mode. */
export async function runDevcontainerUp(dir: string): Promise<{ ok: boolean; output: string; workspaceFolder: string | null }> {
  const mount = await worktreeRepoRootMount(dir);
  // Bind-mounted 1:1 (same path inside as out) so a session spawned into this container later
  // (spawn-claude.ts) can point its hook's curl at exactly the path it already knows — see
  // infra/hook-socket.ts. The DIRECTORY, not the per-port socket file inside it — hook-socket.ts's
  // own doc explains why a file mount goes stale the next time the dev server restarts. Only when
  // the directory actually exists: `--mount` on a missing source fails the whole `up` rather than
  // skipping it, and the listener is best-effort (Windows, or a bind that lost a race), so a
  // container must still come up without it.
  const socketDir = hookSocketDir();
  const socketMount = existsSync(socketDir) ? `type=bind,source=${socketDir},target=${socketDir}` : null;
  // Same 1:1-directory idea, for a dropped file rather than the hook: sessionAddDirs grants a
  // session `DROPS_ROOT`'s own subdirectory as an `--add-dir`, a HOST path, which resolves to
  // nothing inside a container unless this root is mounted in too. usableDropsRoot() (not a bare
  // existsSync) because the root is normally created lazily on a session's first drop — the very
  // first devcontainer session to receive one would otherwise come up before it exists.
  const dropsMount = usableDropsRoot() ? `type=bind,source=${DROPS_ROOT},target=${DROPS_ROOT}` : null;
  const args = [
    "up",
    "--workspace-folder",
    dir,
    ...(mount ? ["--mount", mount] : []),
    ...(socketMount ? ["--mount", socketMount] : []),
    ...(dropsMount ? ["--mount", dropsMount] : []),
  ];
  return new Promise((resolve) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'devcontainer' is a standard tool from PATH, same convention as git() in worktrees.ts; all inputs go through argv (no shell)
    const child = spawn("devcontainer", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: DEVCONTAINER_UP_TIMEOUT_MS,
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", (err) => resolve({ ok: false, output: String(err), workspaceFolder: null }));
    child.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      resolve({ ok: code === 0, output, workspaceFolder: code === 0 ? remoteWorkspaceFolderFrom(output) : null });
    });
  });
}

/** Marks `dir` as "run its sessions through `devcontainer exec`" — merged into the worktree's own
 *  `.mulmoterminal.local.json` (never the shared file: this is a per-clone runtime fact, not
 *  something to commit) so a worktree created with `writeInheritedDirConfig`'s colours keeps them.
 *
 *  `workspaceFolder` is runDevcontainerUp's own reading of `devcontainer up`'s result — recorded
 *  only when it differs from `dir` (see config-schema.ts's dirDevcontainerWorkspaceFolderField for
 *  why the two can differ, and what a mismatch is for), so the common case where a target's
 *  devcontainer.json doesn't override workspaceFolder writes nothing new. */
export function markDevcontainerEnabled(dir: string, workspaceFolder: string | null): void {
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
  config.devcontainerWorkspaceFolder = workspaceFolder && path.resolve(workspaceFolder) !== path.resolve(dir) ? workspaceFolder : null;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

// A build (base image pull...) timeout would be the wrong bound here — this is a `docker ps`,
// not an `up`, and should answer in well under a second or not at all.
const DEVCONTAINER_NAME_LOOKUP_TIMEOUT_MS = 5_000;

/** The Docker name of `dir`'s running devcontainer (`angry_rubin`, not the image or id) — what a
 *  `docker exec`/`docker logs` typed by hand actually needs, and the reason the badge that says
 *  "in devcontainer" (TerminalCell.vue) is otherwise not enough to act on: the name is randomly
 *  assigned at container CREATION and changes every time the container is recreated, which a
 *  Dockerfile edit or a stale-mount fix (this app's own hook-socket.ts / claude-credentials.ts
 *  both needed one) does often enough that remembering it is not reliable.
 *
 *  `devcontainer.local_folder` is the label the devcontainers CLI itself writes at `up` time with
 *  exactly the `--workspace-folder` string this app passed — matching on it rather than guessing
 *  a name/id keeps this correct across a rebuild without this app tracking one of its own. null
 *  for "no container answers that label" (never built, or `docker rm`'d since), which reads as
 *  "not running" rather than as an error — a truthful answer, not a failure. */
export function runningDevcontainerName(dir: string): Promise<string | null> {
  const args = ["ps", "--filter", `label=devcontainer.local_folder=${path.resolve(dir)}`, "--format", "{{.Names}}"];
  return new Promise((resolve) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'docker' is a standard tool from PATH, same convention as devcontainer() above
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "ignore"], timeout: DEVCONTAINER_NAME_LOOKUP_TIMEOUT_MS });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      // Multiple names would mean multiple containers share this exact label — devcontenters
      // shouldn't, and if one somehow does, naming ONE of them as "the" container would be a
      // guess dressed as an answer.
      const names = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);
      resolve(code === 0 && names.length === 1 ? (names[0] ?? null) : null);
    });
  });
}
