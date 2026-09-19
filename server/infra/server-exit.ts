// What a failure of the HTTP server itself becomes: the line the operator reads, and the
// code the process leaves with.
//
// The code is a CONTRACT with the launcher — bin/server-supervision.js is where it decides what an
// exit MEANS. 75 says the port was taken at BIND time, which is the race the pre-flight probe
// cannot win: the launcher names who has it and stops. It does NOT move to a fresh port here. That
// offer exists, but on the probe path, where it is made out loud and taken only on an answer
// (pickPort, #611) — conflating the two is how someone ends up restoring a silent fallback. Every
// other non-zero exit is a crash, and whether the launcher brings the server back is that module's
// decision rather than this one's. Get the code wrong and a busy port is retried as if it were a
// crash, or a crash is reported as a busy port and the server stays down.
//
// Out of the listener because a policy reachable only by failing to bind a port is a policy
// nothing can check — the listener now only prints and exits (#548).
import { hasErrnoCode, messageOf } from "../errors.js";

// Keep in sync with bin/server-supervision.js — a test asserts the two agree, and asks the whole
// of bin/ that this is the only launcher-side copy.
export const PORT_IN_USE_EXIT_CODE = 75;
export const SERVER_ERROR_EXIT_CODE = 1;

export interface ServerExit {
  message: string;
  code: number;
}

export function serverErrorExit(err: unknown, port: string | number): ServerExit {
  if (hasErrnoCode(err) && err.code === "EADDRINUSE") {
    return {
      message: `[mulmoterminal] Port ${port} is already in use — set PORT=<n> or pass --port <n>.`,
      code: PORT_IN_USE_EXIT_CODE,
    };
  }
  return { message: `[mulmoterminal] server error: ${messageOf(err)}`, code: SERVER_ERROR_EXIT_CODE };
}
