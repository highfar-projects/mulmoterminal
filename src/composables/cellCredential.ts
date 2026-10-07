// The rotation credential a cell's process runs on (#2919), as its `credential` frame says it.

export interface CellCredential {
  /** What fits on the cell's mark. */
  label: string;
  /** The longer name its hover gives — the label with the subscription's address. */
  detail: string;
}

/** A `credential` frame read back, or null when it names none. */
export function credentialOf(msg: Record<string, unknown>): CellCredential | null {
  if (typeof msg.label !== "string") return null;
  return { label: msg.label, detail: typeof msg.detail === "string" ? msg.detail : msg.label };
}
