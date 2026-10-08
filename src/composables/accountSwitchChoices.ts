// The subscriptions a rotated cell's account mark offers to move to (#2950), decided from the config
// and the cell's current token alone.
import { DEFAULT_LOGIN_ID, DEFAULT_LOGIN_LABEL, type TokenRotation } from "../../common/tokenRotation";

export interface AccountSwitchChoice {
  id: string;
  label: string;
  /** The sign-in address, when the config names one. */
  detail: string | null;
  current: boolean;
}

/** Nothing unless rotation is on and the cell is on a rotated token: any other cell runs on a login
 *  its user chose, and the server refuses to move it. */
export function accountSwitchChoices(rotation: TokenRotation, currentId: string | null): AccountSwitchChoice[] {
  if (!rotation.enabled || currentId === null) return [];
  const tokens = rotation.tokens.map((token) => ({ id: token.id, label: token.label, detail: token.email ?? null, current: token.id === currentId }));
  if (!rotation.includeDefaultLogin) return tokens;
  return [...tokens, { id: DEFAULT_LOGIN_ID, label: DEFAULT_LOGIN_LABEL, detail: null, current: currentId === DEFAULT_LOGIN_ID }];
}
