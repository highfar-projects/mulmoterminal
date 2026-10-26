// @vitest-environment node
//
// GET /api/config tells the browser how to count cells: the table measured from this server's tmux
// when there is one (#3173), and Unicode 11 to fall back on.
import { describe, it, expect, vi, afterAll } from "vitest";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import type { TmuxWidthTable } from "../../../common/tmuxWidthTable";

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
}));
vi.mock("../../../server/infra/process/tmuxWidthProbe.js", () => ({ tmuxWidthTable: vi.fn(() => null), settledTmuxWidthTable: vi.fn(async () => null) }));

const { rmSync } = await import("node:fs");
const { settledTmuxWidthTable, tmuxWidthTable } = await import("../../../server/infra/process/tmuxWidthProbe.js");
const routes = await import("../../../server/config/config-routes.js");
const app = express();
app.use(express.json());
routes.mountConfigRoutes(app, scratch.home);

afterAll(() => rmSync(scratch.home, { recursive: true, force: true }));

const configServed = async (): Promise<Record<string, unknown>> => {
  const res = await routeCall(app)("/api/config");
  expect(res.status).toBe(200);
  return res.body;
};

describe("cell widths on GET /api/config", () => {
  it("falls back to Unicode 11 with no measured table", async () => {
    vi.mocked(tmuxWidthTable).mockReturnValue(null);
    const body = await configServed();
    expect(body.terminalUnicodeVersion).toBe("11");
    expect(body.terminalWidthTable).toBeNull();
  });

  it("serves the table measured from tmux as it is", async () => {
    const table: TmuxWidthTable = { runs: [[0x2705, 0x2705, 2]], folding: "tmux-3.6a", vs16Wide: true };
    vi.mocked(tmuxWidthTable).mockReturnValue(table);
    expect((await configServed()).terminalWidthTable).toEqual(table);
  });
});

describe("GET /api/config/terminal-widths", () => {
  it("answers with the table once the boot measurement settles, waiting a bounded time", async () => {
    const table: TmuxWidthTable = { runs: [[0x2705, 0x2705, 2]], folding: "tmux-3.6a", vs16Wide: true };
    vi.mocked(settledTmuxWidthTable).mockResolvedValue(table);
    const res = await routeCall(app)("/api/config/terminal-widths");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ terminalWidthTable: table });
    expect(vi.mocked(settledTmuxWidthTable).mock.calls.at(-1)?.[0]).toBeLessThan(20_000);
  });

  it("answers null when there is nothing to measure", async () => {
    vi.mocked(settledTmuxWidthTable).mockResolvedValue(null);
    expect((await routeCall(app)("/api/config/terminal-widths")).body).toEqual({ terminalWidthTable: null });
  });
});
