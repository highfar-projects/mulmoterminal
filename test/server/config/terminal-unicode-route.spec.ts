// @vitest-environment node
//
// GET /api/config tells the browser which width table to count cells with: Unicode 11 behind
// psmux, xterm's default everywhere else — so a real tmux keeps exactly what it ran on before.
import { describe, it, expect, vi, afterAll } from "vitest";
import express from "express";
import { routeCall } from "../../helpers/routeCall";

const scratch = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = mkdtempSync(join(tmpdir(), "mt-unicode-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return { home };
});
vi.mock("../../../server/infra/process/tmux.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setTmuxPrefix: vi.fn(),
  tmuxIsPsmux: vi.fn(() => false),
}));

const { rmSync } = await import("node:fs");
const { tmuxIsPsmux } = await import("../../../server/infra/process/tmux.js");
const routes = await import("../../../server/config/config-routes.js");
const app = express();
app.use(express.json());
routes.mountConfigRoutes(app, scratch.home);

afterAll(() => rmSync(scratch.home, { recursive: true, force: true }));

const unicodeVersionServed = async (): Promise<unknown> => {
  const res = await routeCall(app)("/api/config");
  expect(res.status).toBe(200);
  return res.body.terminalUnicodeVersion;
};

describe("terminalUnicodeVersion on GET /api/config", () => {
  it("is xterm's default behind a real tmux, or none", async () => {
    vi.mocked(tmuxIsPsmux).mockReturnValue(false);
    expect(await unicodeVersionServed()).toBe("6");
  });

  it("is Unicode 11 behind psmux", async () => {
    vi.mocked(tmuxIsPsmux).mockReturnValue(true);
    expect(await unicodeVersionServed()).toBe("11");
  });
});
