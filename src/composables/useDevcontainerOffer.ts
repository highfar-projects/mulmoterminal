// Offers to build + start a directory's devcontainer when a NEW session is about to launch there.
// Called from every launch entry point in CellLaunchForm.vue that can carry an agent into a
// directory — typing a path and pressing Start, a preset chip's quick launch, creating a worktree
// and opening one fresh — but never from TerminalCell.vue's startPickedAgent (which also covers a
// large synchronous-launch test surface) nor from a shell launch (spawn-shell.ts doesn't read the
// devcontainer flag the way spawn-claude.ts does, so offering one there would promise something
// that can't happen). Never asked twice for the same directory once a session there has already
// answered (server-side `enabled`, see server/config/devcontainer-flag.ts).
//
// Confirmed every time a devcontainer is found and not already in use (never auto-started):
// building/starting one is slow and runs arbitrary postCreateCommand shell, so it stays an
// explicit choice rather than something the launcher decides on the user's behalf. Declining, a
// build failure, or not being able to reach the server at all — none of these block the launch;
// they all fall through to a plain host session.
//
// `buildDevcontainer` below is the bare POST, with no confirm dialog — shared with
// TerminalCell.vue's devcontainer badge, whose own click IS the explicit choice (recovering from
// a session that was started before anyone answered the confirm here).
import { fetchWithTimeout, DEVCONTAINER_UP_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { jsonBody } from "../jsonBody";
import { isRecord } from "../../common/isRecord";

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const requestFailureText = (e: unknown): string =>
  e instanceof DOMException && e.name === "AbortError"
    ? "Timed out waiting for the devcontainer — it may still finish."
    : `Could not reach the server: ${errorMessage(e)}`;

export interface DevcontainerStatus {
  hasConfig: boolean;
  enabled: boolean;
  // The running container's Docker name (`angry_rubin`) — null while disabled, or while enabled
  // but nothing currently answers for it (never built yet, or removed since). Exported alongside
  // the rest for TerminalCell.vue's badge: the tooltip a `docker exec` typed by hand actually
  // needs, since the name is reassigned every time the container is recreated.
  containerName: string | null;
}

export async function devcontainerStatus(cwd: string): Promise<DevcontainerStatus | null> {
  try {
    const res = await fetchWithTimeout(`/api/devcontainer/status?cwd=${encodeURIComponent(cwd)}`);
    const body = await jsonBody(res);
    return {
      hasConfig: isRecord(body) && body.hasConfig === true,
      enabled: isRecord(body) && body.enabled === true,
      containerName: isRecord(body) && typeof body.containerName === "string" ? body.containerName : null,
    };
  } catch {
    return null; // can't tell — proceed on the host rather than block the launch over a status check
  }
}

export interface DevcontainerBuildResult {
  ok: boolean;
  // The build log tail on failure; empty on success.
  message: string;
}

export async function buildDevcontainer(cwd: string): Promise<DevcontainerBuildResult> {
  try {
    const res = await fetchWithTimeout(
      "/api/devcontainer/up",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd }) },
      DEVCONTAINER_UP_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await jsonBody(res);
      return { ok: false, message: isRecord(body) && typeof body.output === "string" ? body.output : res.statusText };
    }
    return { ok: true, message: "" };
  } catch (e) {
    return { ok: false, message: requestFailureText(e) };
  }
}

export async function offerDevcontainerIfNeeded(cwd: string): Promise<void> {
  const status = await devcontainerStatus(cwd);
  if (!status || !status.hasConfig || status.enabled) return;

  if (!window.confirm(`This directory has a devcontainer:\n${cwd}\n\nBuild and start it now?`)) return;
  const result = await buildDevcontainer(cwd);
  if (!result.ok) window.alert(`Could not start the devcontainer — continuing on the host.\n\n${result.message}`);
}
