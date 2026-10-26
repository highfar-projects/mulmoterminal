// Refuses any HTTP request addressed to a host this server does not answer to (#3188).
//
// DNS rebinding is the reason. A page the user visits can point its own name at this machine, and
// from then on its requests are SAME-ORIGIN reads: the browser sends no Origin on them, so the
// central same-origin gate (which only judges state-changing methods anyway) has nothing to refuse.
// The Host header is what such a request cannot hide — it is the attacker's name — so a name the
// operator never configured is refused here, before any route runs.
//
// The list is the Origin check's (allowed-origin.ts): loopback plus what MULMOTERMINAL_HOST and
// MULMOTERMINAL_ALLOWED_ORIGINS name. Every caller this server spawns comes back on localhost or
// 127.0.0.1 (hooks, the MCP bridge), and the Vite dev proxy rewrites Host to the backend's localhost.

const HTTP_FORBIDDEN = 403;

/** What a refused request is told: which names are answered, and the setting that adds one. */
export const forbiddenHostMessage = (hostHeader: string | undefined): string =>
  `This server does not answer to "${hostHeader ?? ""}". It answers to localhost, and to the names in MULMOTERMINAL_HOST and MULMOTERMINAL_ALLOWED_ORIGINS — open it at one of those, or add this name to MULMOTERMINAL_ALLOWED_ORIGINS.`;

// Only what the guard reads and writes, so a plain object stands in for Express in a test.
interface HostedRequest {
  headers: { host?: string | undefined };
}
interface PlainResponse {
  status(code: number): { type(kind: string): { send(body: string): unknown } };
}

export function hostGuard(isAllowedHost: (hostHeader: string | undefined) => boolean) {
  return (req: HostedRequest, res: PlainResponse, next: () => void): void => {
    if (isAllowedHost(req.headers.host)) return next();
    res.status(HTTP_FORBIDDEN).type("text/plain").send(forbiddenHostMessage(req.headers.host));
  };
}
