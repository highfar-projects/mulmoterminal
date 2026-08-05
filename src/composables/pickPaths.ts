// The OS file dialog runs on the SERVER — a browser cannot read a real filesystem path — so every
// picker button in the app is this one round trip.
//
// It is shared because the failure is the point. All three call sites (the launcher's
// Working-directory button, the header's "Insert a file path", the notification-sound field) had
// their own copy that dropped a non-200 with `if (!res.ok) return;`, so a host with no dialog
// installed got three buttons that did nothing at all and said nothing (#1447). The server's
// message names what to install; a caller's job is to put `error` somewhere the user can read it.
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";

export interface PickResult {
  paths: string[];
  /** Why no dialog opened. null covers success AND a plain user cancel (which yields no paths). */
  error: string | null;
}

const failureText = (body: Record<string, unknown>, status: number): string =>
  typeof body.error === "string" && body.error.length > 0 ? body.error : `The file dialog failed (HTTP ${status}).`;

export async function pickPaths(options: { directory?: boolean } = {}): Promise<PickResult> {
  try {
    // Deliberately unbounded: this route answers when the USER closes the native file dialog,
    // so any deadline here is a guess at how long they will take to choose.
    const res = await fetch("/api/pick-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory: options.directory === true }),
    });
    const body = await jsonBody(res);
    if (!res.ok) return { paths: [], error: failureText(body, res.status) };
    const paths = isUnknownArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string") : [];
    return { paths, error: null };
  } catch (e) {
    return { paths: [], error: `Could not reach the file dialog: ${e instanceof Error ? e.message : String(e)}` };
  }
}
