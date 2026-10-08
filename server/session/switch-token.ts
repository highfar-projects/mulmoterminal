// Whether a session may be moved to the subscription a user picked, and onto which (#2950).
import { DEFAULT_LOGIN_ID, type TokenRotation } from "../../common/tokenRotation.js";

export type SwitchDecision = { ok: true; tokenId: string } | { ok: false; status: 400 | 409; error: string };

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

const isOffered = (rotation: TokenRotation, tokenId: string): boolean =>
  rotation.tokens.some((token) => token.id === tokenId) || (tokenId === DEFAULT_LOGIN_ID && rotation.includeDefaultLogin);

/** Only a session rotation started can be moved: any other runs on a credential its user chose
 *  (a provider, a custom agent, an account), and a pick here would silently overrule it. */
export function decideSwitch(rotation: TokenRotation, currentTokenId: string | undefined, requested: unknown): SwitchDecision {
  if (typeof requested !== "string" || !isOffered(rotation, requested)) return { ok: false, status: HTTP_BAD_REQUEST, error: "unknown subscription" };
  if (!rotation.enabled) return { ok: false, status: HTTP_CONFLICT, error: "token rotation is off" };
  if (currentTokenId === undefined) return { ok: false, status: HTTP_CONFLICT, error: "this session is not on a rotated subscription" };
  return { ok: true, tokenId: requested };
}
