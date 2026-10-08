// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readRotationToken, TOKEN_FILE_MAX_BYTES, tokenFileRefusal, tokenFromText, type TokenSecretDeps } from "../../../../server/agents/token/token-secret";
import { KEYCHAIN_ACCOUNT_DEFAULT } from "../../../../common/tokenRotation";

const SECRET = "sk-ant-oat01-abc";
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const deps = (over: Partial<TokenSecretDeps> = {}): TokenSecretDeps => ({
  keychain: () => `${SECRET}\n`,
  readFile: () => `${SECRET}\n`,
  homedir: "/Users/me",
  ...over,
});

describe("tokenFromText (#2919)", () => {
  it("trims a trailing newline", () => {
    expect(tokenFromText(`  ${SECRET}\n`)).toBe(SECRET);
  });

  it.each([[""], ["   \n"], ["two words"], ["line\nline"]])("refuses %j", (text) => {
    expect(tokenFromText(text)).toBeNull();
  });
});

describe("readRotationToken", () => {
  it("reads a keychain item under the default account", () => {
    const asked: string[][] = [];
    const secret = readRotationToken(
      { id: "a", label: "A", keychain: "svc" },
      deps({ keychain: (service, account) => (asked.push([service, account]), SECRET) }),
    );
    expect(secret).toBe(SECRET);
    expect(asked).toEqual([["svc", KEYCHAIN_ACCOUNT_DEFAULT]]);
  });

  it("reads a keychain item under a named account", () => {
    const asked: string[] = [];
    readRotationToken({ id: "a", label: "A", keychain: "svc", keychainAccount: "me" }, deps({ keychain: (_s, account) => (asked.push(account), SECRET) }));
    expect(asked).toEqual(["me"]);
  });

  it("reads a ~/ file from the home directory", () => {
    const read: string[] = [];
    expect(readRotationToken({ id: "b", label: "B", file: "~/t/b" }, deps({ readFile: (file) => (read.push(file), SECRET) }))).toBe(SECRET);
    expect(read).toEqual([path.join("/Users/me", "t/b")]);
  });

  it("is null, and says so without the value, when the read throws", () => {
    const secret = readRotationToken(
      { id: "a", label: "A", keychain: "svc" },
      deps({
        keychain: () => {
          throw new Error("item not found");
        },
      }),
    );
    expect(secret).toBeNull();
    expect(String(warn.mock.calls[0]?.[0])).toContain('keychain item "svc"');
  });

  it("is null for an entry holding no token, and never logs what it held", () => {
    expect(readRotationToken({ id: "b", label: "B", file: "/t/b" }, deps({ readFile: () => "not a token at all" }))).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("not a token");
  });
});

describe("tokenFileRefusal (#2919)", () => {
  const PRIVATE = { isFile: true, size: 110, mode: 0o100600, uid: 501 };

  it("allows a private regular file owned by this user", () => {
    expect(tokenFileRefusal(PRIVATE, "darwin", 501)).toBeNull();
    expect(tokenFileRefusal({ ...PRIVATE, mode: 0o100400 }, "linux", 501)).toBeNull();
  });

  it.each([
    ["group-readable", { mode: 0o100640 }, "readable by others"],
    ["world-readable", { mode: 0o100644 }, "readable by others"],
    ["group-writable only", { mode: 0o100620 }, "readable by others"],
    ["owned by someone else", { uid: 0 }, "not owned"],
    ["a directory", { isFile: false }, "not a regular file"],
    ["too large", { size: TOKEN_FILE_MAX_BYTES + 1 }, "larger than"],
  ])("refuses a file that is %s", (_name, over, reason) => {
    expect(tokenFileRefusal({ ...PRIVATE, ...over }, "darwin", 501)).toContain(reason);
  });

  it("checks no mode bits on Windows, but still the type and size", () => {
    expect(tokenFileRefusal({ ...PRIVATE, mode: 0o100666, uid: 0 }, "win32", undefined)).toBeNull();
    expect(tokenFileRefusal({ ...PRIVATE, isFile: false }, "win32", undefined)).toContain("not a regular file");
  });

  it("checks ownership only when this process has a uid", () => {
    expect(tokenFileRefusal({ ...PRIVATE, uid: 0 }, "linux", undefined)).toBeNull();
  });
});

describe("readRotationToken over a real file", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mt-token-file-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.skipIf(process.platform === "win32")("reads a 600 file and refuses a 644 one", () => {
    const file = path.join(dir, "t");
    writeFileSync(file, `${SECRET}\n`, { mode: 0o600 });
    expect(readRotationToken({ id: "f", label: "F", file })).toBe(SECRET);
    chmodSync(file, 0o644);
    expect(readRotationToken({ id: "f", label: "F", file })).toBeNull();
    expect(warn.mock.calls.flat().join(" ")).toContain("chmod 600");
  });
});
