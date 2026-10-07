// @vitest-environment node
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readRotationToken, tokenFromText, type TokenSecretDeps } from "../../../server/agents/token-secret";
import { KEYCHAIN_ACCOUNT_DEFAULT } from "../../../common/tokenRotation";

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
