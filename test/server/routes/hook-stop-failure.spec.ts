// @vitest-environment node
//
// A turn that fails on a usage limit (#2919): the hook route hands a live session's `rate_limit`
// StopFailure to the rotation handler, and nothing else.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountHookRoute } from "../../../server/routes/hook-routes";
import { ptys } from "../../../server/session/registry";
import { fakePtyEntry } from "../../helpers/fakePtyEntry";

const ID = "33333333-4444-4555-8666-777777777777";
const onRateLimited = vi.fn();
const deps = {
  setWorking: vi.fn(),
  setWaiting: vi.fn(),
  publishActivity: vi.fn(),
  forgetTitle: vi.fn(),
  noteTitleTurn: vi.fn(),
  noteWorkPhase: vi.fn(),
  maybeGenerateTitle: vi.fn(async () => {}),
  recordToolCallStart: vi.fn(async () => {}),
  recordToolCallEnd: vi.fn(async () => {}),
  publishDirConfig: vi.fn(),
  publishFileWrite: vi.fn(),
  publishPromptSubmitted: vi.fn(),
  publishQuestion: vi.fn(),
  uiPort: "34567",
  onRateLimited,
};

const app = express();
app.use(express.json());
mountHookRoute(app, deps);
const call = routeCall(app);

const live = () => fakePtyEntry();

const postHook = async (body: Record<string, unknown>) => {
  const res = await call("/api/hook", jsonPost({ session_id: ID, ...body }, { "x-mt-session": ID }));
  expect(res.status).toBe(200);
};

beforeEach(() => {
  onRateLimited.mockClear();
  deps.setWorking.mockClear();
});
afterEach(() => ptys.delete(ID));

describe("StopFailure (#2919)", () => {
  it("hands a live session's rate_limit failure to the rotation handler", async () => {
    ptys.set(ID, live());
    await postHook({ hook_event_name: "StopFailure", error_type: "rate_limit" });
    expect(onRateLimited).toHaveBeenCalledWith(ID);
  });

  it.each([["overloaded"], ["server_error"], [undefined], [42]])("ignores a failure of type %j", async (errorType) => {
    ptys.set(ID, live());
    await postHook({ hook_event_name: "StopFailure", error_type: errorType });
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  it("ignores a rate_limit for a session with no pty here", async () => {
    await postHook({ hook_event_name: "StopFailure", error_type: "rate_limit" });
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  it("ignores rate_limit on any other event", async () => {
    ptys.set(ID, live());
    await postHook({ hook_event_name: "Stop", error_type: "rate_limit" });
    expect(onRateLimited).not.toHaveBeenCalled();
  });

  it("clears the working dot, which no Stop will", async () => {
    ptys.set(ID, live());
    await postHook({ hook_event_name: "StopFailure", error_type: "overloaded" });
    expect(deps.setWorking).toHaveBeenCalledWith(ID, false, "StopFailure");
  });
});
