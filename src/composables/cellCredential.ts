// The rotation credential a cell's process runs on (#2919), as its `credential` frame says it.

export interface CellCredential {
  /** The token it names (#2950), or null for a frame that names none. */
  id: string | null;
  /** What fits on the cell's mark. */
  label: string;
  /** The longer name its hover gives — the label with the subscription's address. */
  detail: string;
}

/** A `credential` frame read back, or null when it names none. */
export function credentialOf(msg: Record<string, unknown>): CellCredential | null {
  if (typeof msg.label !== "string") return null;
  return { id: typeof msg.id === "string" ? msg.id : null, label: msg.label, detail: typeof msg.detail === "string" ? msg.detail : msg.label };
}

/** What holds a cell's credential: the last one announced, and the view to tell. */
export interface CredentialHolder {
  knownCredential: CellCredential | null;
  handlers: { onCredential?: (credential: CellCredential | null) => void };
}

/** A credential belongs to the process it was announced for: the next target's comes in its own frame,
 *  or never (rotation off, another agent), so the old mark must not stay on screen meanwhile. */
export function forgetCredential(holder: CredentialHolder): void {
  holder.knownCredential = null;
  holder.handlers.onCredential?.(null);
}
