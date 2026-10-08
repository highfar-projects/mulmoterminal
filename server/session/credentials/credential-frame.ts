// The `credential` frame that tells a cell which rotation token its process runs on (#2919).
import { rotationLoginLabel, type TokenRotation } from "../../../common/tokenRotation.js";

export interface CredentialFrame {
  type: "credential";
  /** The token the mark names, so a menu can show which one is current. */
  id: string | null;
  label: string | null;
  detail: string | null;
}

/** `label` is what fits on the mark; `detail` names the address too, for its hover. Null while rotation
 *  is off, so a cell without it sees no new frame at all. */
export function credentialFrameFor(rotation: TokenRotation, tokenId: string | undefined): CredentialFrame | null {
  if (!rotation.enabled) return null;
  if (tokenId === undefined) return { type: "credential", id: null, label: null, detail: null };
  const token = rotation.tokens.find((candidate) => candidate.id === tokenId);
  const detail = rotationLoginLabel(rotation, tokenId);
  return { type: "credential", id: tokenId, label: token?.label ?? detail, detail };
}
