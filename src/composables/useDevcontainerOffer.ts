// Offers to build + start a directory's devcontainer when a NEW session is about to launch there.
// Currently called only from CellLaunchForm.vue's startHere (typing an existing directory in and
// pressing Start) — deliberately NOT from TerminalCell.vue's startPickedAgent, which every launch
// of every kind goes through (including a large synchronous-launch test surface): scoping it to
// one entry point keeps the async status round trip off every path that doesn't need it. Never
// asked twice for the same directory once a session there has already answered (server-side
// `enabled`, see server/config/devcontainer-flag.ts) — extending this to more entry points
// (a preset chip, a worktree row) later is just calling it from there too.
//
// Confirmed every time a devcontainer is found and not already in use (never auto-started):
// building/starting one is slow and runs arbitrary postCreateCommand shell, so it stays an
// explicit choice rather than something the launcher decides on the user's behalf. Declining, a
// build failure, or not being able to reach the server at all — none of these block the launch;
// they all fall through to a plain host session.
import { fetchWithTimeout, DEVCONTAINER_UP_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { jsonBody } from "../jsonBody";
import { isRecord } from "../../common/isRecord";

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const requestFailureText = (e: unknown): string =>
  e instanceof DOMException && e.name === "AbortError"
    ? "Timed out waiting for the devcontainer — it may still finish."
    : `Could not reach the server: ${errorMessage(e)}`;

async function devcontainerStatus(cwd: string): Promise<{ hasConfig: boolean; enabled: boolean } | null> {
  try {
    const res = await fetchWithTimeout(`/api/devcontainer/status?cwd=${encodeURIComponent(cwd)}`);
    const body = await jsonBody(res);
    return { hasConfig: isRecord(body) && body.hasConfig === true, enabled: isRecord(body) && body.enabled === true };
  } catch {
    return null; // can't tell — proceed on the host rather than block the launch over a status check
  }
}

export async function offerDevcontainerIfNeeded(cwd: string): Promise<void> {
  const status = await devcontainerStatus(cwd);
  if (!status || !status.hasConfig || status.enabled) return;

  if (!window.confirm(`This directory has a devcontainer:\n${cwd}\n\nBuild and start it now?`)) return;
  try {
    const res = await fetchWithTimeout(
      "/api/devcontainer/up",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd }) },
      DEVCONTAINER_UP_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await jsonBody(res);
      window.alert(
        `Could not start the devcontainer — continuing on the host.\n\n${isRecord(body) && typeof body.output === "string" ? body.output : res.statusText}`,
      );
    }
  } catch (e) {
    window.alert(`Could not start the devcontainer — continuing on the host.\n\n${requestFailureText(e)}`);
  }
}
