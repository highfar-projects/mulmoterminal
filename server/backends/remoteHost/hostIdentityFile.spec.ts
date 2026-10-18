// @vitest-environment node
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readHostIdentityFile, writeHostIdentityFile } from "./hostIdentityFile.js";

const IDENTITY = { uid: "uid-1", hostId: "mulmoterminal-0000ffff", machineId: "m-1", hostname: "work-mac.local" };

describe("host identity file", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "host-identity-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a record, creating the directory", async () => {
    const file = path.join(dir, "nested", "remote-host.json");
    await writeHostIdentityFile([IDENTITY], file);
    expect(await readHostIdentityFile(file)).toEqual({ identities: [IDENTITY] });
    expect((await readFile(file, "utf-8")).endsWith("\n")).toBe(true);
  });

  it("reads a missing file as nothing, silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await readHostIdentityFile(path.join(dir, "absent.json"))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads a broken file as nothing, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = path.join(dir, "remote-host.json");
    await writeFile(file, "{not json");
    expect(await readHostIdentityFile(file)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("reads an oversized file as nothing, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const file = path.join(dir, "remote-host.json");
    await writeFile(file, " ".repeat(64 * 1024 + 1));
    expect(await readHostIdentityFile(file)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  // Deciding again on an unreadable file would overwrite a channel the machine may still own.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("rejects with the path when the file cannot be read", async () => {
    const file = path.join(dir, "remote-host.json");
    await writeHostIdentityFile([IDENTITY], file);
    await chmod(file, 0o000);
    await expect(readHostIdentityFile(file)).rejects.toThrow(file);
    await chmod(file, 0o600);
  });
});
