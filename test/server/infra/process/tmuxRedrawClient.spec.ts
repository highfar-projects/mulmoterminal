// @vitest-environment node
//
// The repaint runs once per terminal a page opens or repaints, so it must not hold the server while
// tmux answers (#3189): every tmux call goes through the async spawn, and nothing through the sync one.
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Captured {
  status: number | null;
  stdout: string;
  stderr: string;
}

const spawns = vi.hoisted(() => ({
  sync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
  async: vi.fn<(bin: string, args: string[]) => Promise<Captured>>(async () => ({ status: 0, stdout: "", stderr: "" })),
}));

vi.mock("../../../../server/infra/process/spawnCapture.js", () => ({ spawnCapture: spawns.sync, spawnCaptureAsync: spawns.async }));

const { tmuxRedrawClient } = await import("../../../../server/infra/process/tmux.js");

const OUR_PID = 29421;
const tmuxArgs = () => spawns.async.mock.calls.map(([, args]) => args.slice(2));

describe("tmuxRedrawClient", () => {
  beforeEach(() => {
    spawns.sync.mockClear();
    spawns.async.mockReset();
  });

  it("repaints our client through the async spawn only", async () => {
    spawns.async.mockResolvedValueOnce({ status: 0, stdout: `40100 /dev/ttys002\n${OUR_PID} /dev/ttys019\n`, stderr: "" });
    spawns.async.mockResolvedValue({ status: 0, stdout: "", stderr: "" });
    await tmuxRedrawClient("s1", OUR_PID);
    expect(tmuxArgs()).toEqual([
      ["list-clients", "-t", "=mt-s1", "-F", "#{client_pid} #{client_tty}"],
      ["refresh-client", "-t", "/dev/ttys019"],
    ]);
    expect(spawns.sync).not.toHaveBeenCalled();
  });

  it("returns before tmux has answered", async () => {
    const answers: ((value: Captured) => void)[] = [];
    spawns.async.mockImplementationOnce(() => new Promise((resolve) => answers.push(resolve)));
    let settled = false;
    const redraw = tmuxRedrawClient("s1", OUR_PID).then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    answers.forEach((answer) => answer({ status: 1, stdout: "", stderr: "no server running" }));
    await redraw;
    expect(settled).toBe(true);
  });

  it("repaints nothing, and does not reject, when tmux cannot list the clients", async () => {
    spawns.async.mockResolvedValueOnce({ status: 1, stdout: "", stderr: "can't find session" });
    await expect(tmuxRedrawClient("s1", OUR_PID)).resolves.toBeUndefined();
    expect(tmuxArgs()).toEqual([["list-clients", "-t", "=mt-s1", "-F", "#{client_pid} #{client_tty}"]]);
  });
});
