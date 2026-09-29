// localStorage that cannot take a module down with it.
//
// Where site data is blocked — Safari's private mode, a policy-locked profile, an embedded context
// — `localStorage` does not answer null: the ACCESS throws. A read at module scope then takes the
// whole module with it, so a preference nobody would miss stops the feature from loading at all.
//
// Every read and write here is therefore best-effort. What is stored is a convenience (which pane
// you left open, how wide you dragged it), and losing it should cost the reader nothing but the
// memory of the last choice. The collection filing already keeps to this rule by hand
// (collectionChatSessions.ts); this is the same rule for the values that are one string.
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort — a full or unavailable store must not break what the value was for
  }
}

// The same rule for sessionStorage: one tab's value, gone when the tab closes, and never worth failing over.
export function readSessionStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionStored(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // best-effort, as above
  }
}

export function removeSessionStored(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // best-effort, as above
  }
}
