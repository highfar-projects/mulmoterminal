// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { Express } from "express";
import { mountSwitchTokenRoutes, type SwitchTokenRouteDeps } from "../../../../server/infra/http/switch-token-routes.js";

const UUID = "01234567-89ab-cdef-0123-456789abcdef";

interface FakeRes {
  statusCode: number;
  payload: unknown;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
}
const makeRes = (): FakeRes => ({
  statusCode: 200,
  payload: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.payload = body;
    return this;
  },
});

type Req = { headers: { origin?: string }; params: { id?: string }; body?: unknown; method: string; path: string };

function mount(over: Partial<SwitchTokenRouteDeps> = {}) {
  const deps: SwitchTokenRouteDeps = {
    isAllowedOrigin: () => true,
    isValidSessionId: (id) => id === UUID,
    rotation: () => ({
      enabled: true,
      includeDefaultLogin: false,
      tokens: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    }),
    sessionToken: () => "a",
    pin: vi.fn(),
    clearPin: vi.fn(),
    noteMovedFrom: vi.fn(),
    dropMovedFrom: vi.fn(),
    labelOf: (tokenId) => `label-${tokenId}`,
    reapSession: vi.fn(),
    hasTmux: () => false,
    killTmux: vi.fn(),
    ...over,
  };
  let handler: ((req: Req, res: FakeRes) => unknown) | undefined;
  const app = { post: (_path: string, h: (req: Req, res: FakeRes) => unknown) => (handler = h) } as unknown as Express;
  mountSwitchTokenRoutes(app, deps);
  const call = (id: string, body: unknown) => {
    const res = makeRes();
    handler?.({ headers: {}, params: { id }, body, method: "POST", path: "/api/session/:id/switch-token" }, res);
    return res;
  };
  return { deps, call };
}

describe("POST /api/session/:id/switch-token (#2950)", () => {
  it("pins the pick, ends the session and says it ended", () => {
    const { deps, call } = mount();
    const res = call(UUID, { tokenId: "b" });
    expect(res.payload).toEqual({ ok: true, ended: true });
    expect(deps.pin).toHaveBeenCalledWith(UUID, "b");
    expect(deps.noteMovedFrom).toHaveBeenCalledWith(UUID, { fromLabel: "label-a", reason: "switched" });
    expect(deps.reapSession).toHaveBeenCalledWith(UUID);
  });

  it("takes the pick back when the session did not end", () => {
    const { deps, call } = mount({ hasTmux: () => true });
    expect(call(UUID, { tokenId: "b" }).payload).toEqual({ ok: true, ended: false });
    expect(deps.killTmux).toHaveBeenCalledWith(UUID);
    expect(deps.clearPin).toHaveBeenCalledWith(UUID);
    expect(deps.dropMovedFrom).toHaveBeenCalledWith(UUID);
  });

  it("refuses a foreign origin before touching anything", () => {
    const { deps, call } = mount({ isAllowedOrigin: () => false });
    expect(call(UUID, { tokenId: "b" }).statusCode).toBe(403);
    expect(deps.reapSession).not.toHaveBeenCalled();
  });

  it("refuses a malformed session id", () => {
    const { deps, call } = mount();
    expect(call("nope", { tokenId: "b" }).statusCode).toBe(400);
    expect(deps.pin).not.toHaveBeenCalled();
  });

  it("refuses an unknown subscription, a missing body and a session not on rotation without ending it", () => {
    const unknown = mount();
    expect(unknown.call(UUID, { tokenId: "zzz" }).statusCode).toBe(400);
    expect(unknown.call(UUID, undefined).statusCode).toBe(400);
    expect(mount({ sessionToken: () => undefined }).call(UUID, { tokenId: "b" }).statusCode).toBe(409);
    expect(unknown.deps.reapSession).not.toHaveBeenCalled();
  });
});
