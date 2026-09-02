// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { ChildProcess, spawn } from "node:child_process";
import { killTree } from "./kill-tree";

const fakeChild = (pid: number | undefined) => ({ pid, kill: vi.fn() }) as unknown as ChildProcess & { kill: ReturnType<typeof vi.fn> };

// taskkill is injected rather than run: aiming a real `/T /F` at a pid this test invented could
// signal an unrelated process on the machine. That it works on a REAL tree is covered in
// run-tool.spec.ts, against a process tree that test owns.
const fakeSpawn = () => {
  const calls: { bin: string; args: string[] }[] = [];
  const spawnFn = ((bin: string, args: string[]) => {
    calls.push({ bin, args });
    return { on: vi.fn(), unref: vi.fn() };
  }) as unknown as typeof spawn;
  return { spawnFn, calls };
};

describe("killTree", () => {
  it("SIGKILLs the child off Windows", () => {
    const child = fakeChild(4242);
    const { spawnFn, calls } = fakeSpawn();
    killTree(child, "linux", { spawnFn });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(calls).toHaveLength(0);
  });

  // Signalling the child alone is what left `sh` and `git-lfs filter-process` running; /T is
  // the flag that makes this a tree kill.
  it("walks the whole tree with taskkill /T on Windows", () => {
    const child = fakeChild(4242);
    const { spawnFn, calls } = fakeSpawn();
    killTree(child, "win32", { spawnFn });
    expect(child.kill).not.toHaveBeenCalled();
    expect(calls).toEqual([{ bin: "taskkill", args: ["/PID", "4242", "/T", "/F"] }]);
  });

  it("does nothing when the spawn never produced a process", () => {
    const child = fakeChild(undefined);
    const { spawnFn, calls } = fakeSpawn();
    killTree(child, "linux", { spawnFn });
    killTree(child, "win32", { spawnFn });
    expect(child.kill).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
