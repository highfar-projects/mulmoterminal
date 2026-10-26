// @vitest-environment node
// The app-wide Host check (#3188): a request addressed to a name the server does not answer to is
// refused before any route, with the setting that would let it in.
import { describe, it, expect, vi } from "vitest";
import { hostGuard, forbiddenHostMessage } from "../../../../server/infra/http/host-guard.js";
import { createIsAllowedHost } from "../../../../server/infra/http/allowed-origin.js";

interface Sent {
  status: number | null;
  type: string | null;
  body: string | null;
}

function run(host: string | undefined, allowed: ReadonlySet<string> = new Set()): { sent: Sent; next: ReturnType<typeof vi.fn> } {
  const sent: Sent = { status: null, type: null, body: null };
  const sendable = {
    send(body: string) {
      sent.body = body;
      return sendable;
    },
  };
  const typed = {
    type(kind: string) {
      sent.type = kind;
      return sendable;
    },
  };
  const res = {
    status(code: number) {
      sent.status = code;
      return typed;
    },
  };
  const next = vi.fn();
  const req = { headers: host === undefined ? {} : { host } };
  hostGuard(createIsAllowedHost(allowed))(req, res, next);
  return { sent, next };
}

describe("hostGuard", () => {
  it.each(["localhost:34567", "127.0.0.1:34567", "[::1]:34567", "localhost:5173"])("passes a request addressed to %s", (host) => {
    const { sent, next } = run(host);
    expect(next).toHaveBeenCalledOnce();
    expect(sent.status).toBeNull();
  });

  it("passes an operator-named host", () => {
    expect(run("nuc.local:34567", new Set(["nuc.local"])).next).toHaveBeenCalledOnce();
  });

  it.each(["attacker.example:34567", "localhost.attacker.example", "192.168.11.6:34567"])("refuses %s with 403 and says how to allow it", (host) => {
    const { sent, next } = run(host);
    expect(next).not.toHaveBeenCalled();
    expect(sent).toEqual({ status: 403, type: "text/plain", body: forbiddenHostMessage(host) });
    expect(sent.body).toContain("MULMOTERMINAL_ALLOWED_ORIGINS");
  });

  it("refuses a request with no Host at all", () => {
    expect(run(undefined).sent.status).toBe(403);
  });
});
