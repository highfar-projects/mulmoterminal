// The subscriptions a rotated cell's account mark offers to move to (#2950), decided from the config
// and the cell's current token alone.
import { DEFAULT_LOGIN_ID, DEFAULT_LOGIN_LABEL, type TokenRotation } from "../../common/tokenRotation";
import type { AccountReading, RateLimitSnapshot } from "./rateLimitGauge";
import { tokenUsageRows, type TokenUsageState } from "./tokenUsageRows";

export interface AccountSwitchChoice {
  id: string;
  label: string;
  /** The sign-in address, when the config names one. */
  detail: string | null;
  current: boolean;
  /** What is left of the weekly window, 0-100, or null when there is no figure to show. */
  weekLeftPercent: number | null;
  /** When the weekly window resets, Unix seconds; null when unknown or already past. */
  weekResetsAt_sec: number | null;
  /** Why there is no figure, or "ok" when there is one. */
  usage: TokenUsageState;
}

/** The `/login` credential's reading: the gauge keeps it on the snapshot itself, not among the tokens. */
const defaultLoginReading = (snapshot: RateLimitSnapshot): AccountReading => ({
  id: DEFAULT_LOGIN_ID,
  label: DEFAULT_LOGIN_LABEL,
  agent: "claude",
  limits: snapshot.claude,
  probe: snapshot.claudeProbe,
  probeStall: snapshot.claudeStall,
  rotation: true,
});

/** Nothing unless rotation is on and the cell is on a rotated token: any other cell runs on a login
 *  its user chose, and the server refuses to move it. The figures are the toolbar gauge's; a
 *  subscription it has no reading for reads as not measured yet. */
export function accountSwitchChoices(
  rotation: TokenRotation,
  currentId: string | null,
  snapshot: RateLimitSnapshot | null,
  now_ms: number,
): AccountSwitchChoice[] {
  if (!rotation.enabled || currentId === null) return [];
  const readings = snapshot ? [...(snapshot.accounts ?? []), defaultLoginReading(snapshot)] : [];
  const rows = new Map(tokenUsageRows(readings, now_ms).map((row) => [row.id, row]));
  const choice = (id: string, label: string, detail: string | null): AccountSwitchChoice => {
    const row = rows.get(id);
    return {
      id,
      label,
      detail,
      current: id === currentId,
      weekLeftPercent: row?.sevenDay.leftPercent ?? null,
      weekResetsAt_sec: row?.sevenDay.resetsAt_sec ?? null,
      usage: row?.state ?? "measuring",
    };
  };
  const tokens = rotation.tokens.map((token) => choice(token.id, token.label, token.email ?? null));
  return rotation.includeDefaultLogin ? [...tokens, choice(DEFAULT_LOGIN_ID, DEFAULT_LOGIN_LABEL, null)] : tokens;
}
