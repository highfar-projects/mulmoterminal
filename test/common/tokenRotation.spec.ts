import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOGIN_ID,
  DEFAULT_LOGIN_LABEL,
  rotationLoginLabel,
  rotationTokenFrom,
  sanitizeTokenRotation,
  ROTATION_TOKENS_MAX,
  ROTATION_TOKEN_LABEL_MAX,
  TOKEN_ROTATION_OFF,
} from "../../common/tokenRotation";

const keychainRow = { id: "a", label: "Personal", keychain: "mulmoterminal-token-a" };
const fileRow = { id: "b", label: "Work", file: "~/.mulmoterminal/tokens/b" };

describe("rotationTokenFrom (#2919)", () => {
  it("keeps a keychain entry and a file entry", () => {
    expect(rotationTokenFrom(keychainRow)).toEqual(keychainRow);
    expect(rotationTokenFrom(fileRow)).toEqual(fileRow);
  });

  it("keeps a keychain account when one is named", () => {
    expect(rotationTokenFrom({ ...keychainRow, keychainAccount: "me" })).toEqual({ ...keychainRow, keychainAccount: "me" });
  });

  it("keeps a sign-in address, and drops one that is not an address", () => {
    expect(rotationTokenFrom({ ...keychainRow, email: " me@example.com " })).toEqual({ ...keychainRow, email: "me@example.com" });
    expect(rotationTokenFrom({ ...keychainRow, email: "not an address" })).toEqual(keychainRow);
    expect(rotationTokenFrom({ ...keychainRow, email: 3 })).toEqual(keychainRow);
  });

  it("trims, and cuts a long label", () => {
    const row = rotationTokenFrom({ id: " a ", label: ` ${"x".repeat(ROTATION_TOKEN_LABEL_MAX + 5)} `, keychain: " k " });
    expect(row).toEqual({ id: "a", label: "x".repeat(ROTATION_TOKEN_LABEL_MAX), keychain: "k" });
  });

  it.each([
    ["not an object", "a"],
    ["null", null],
    ["no id", { label: "L", keychain: "k" }],
    ["a bad id", { id: "A B", label: "L", keychain: "k" }],
    ["an empty label", { id: "a", label: "  ", keychain: "k" }],
    ["neither source", { id: "a", label: "L" }],
    ["both sources", { id: "a", label: "L", keychain: "k", file: "/t" }],
    ["a relative file", { id: "a", label: "L", file: "tokens/a" }],
    ["a non-string source", { id: "a", label: "L", keychain: 3 }],
    ["an empty source", { id: "a", label: "L", keychain: "   " }],
  ])("drops %s", (_name, row) => {
    expect(rotationTokenFrom(row)).toBeNull();
  });

  it("never carries a secret-looking field through", () => {
    expect(rotationTokenFrom({ ...keychainRow, token: "sk-ant-oat01-x" })).toEqual(keychainRow);
  });
});

describe("sanitizeTokenRotation (#2919)", () => {
  it("is off for anything that is not an object", () => {
    expect(sanitizeTokenRotation(undefined)).toEqual(TOKEN_ROTATION_OFF);
    expect(sanitizeTokenRotation([])).toEqual(TOKEN_ROTATION_OFF);
    expect(sanitizeTokenRotation("on")).toEqual(TOKEN_ROTATION_OFF);
  });

  it("is enabled only by a literal true", () => {
    expect(sanitizeTokenRotation({ enabled: "true", tokens: [keychainRow] }).enabled).toBe(false);
    expect(sanitizeTokenRotation({ enabled: true, tokens: [keychainRow] }).enabled).toBe(true);
  });

  it("includes the default login unless it is switched off", () => {
    expect(sanitizeTokenRotation({ enabled: true }).includeDefaultLogin).toBe(true);
    expect(sanitizeTokenRotation({ enabled: true, includeDefaultLogin: false }).includeDefaultLogin).toBe(false);
  });

  it("drops malformed rows and keeps the first of a duplicate id", () => {
    const tokens = sanitizeTokenRotation({ enabled: true, tokens: [keychainRow, { id: "x" }, { ...fileRow, id: "a" }, fileRow] }).tokens;
    expect(tokens).toEqual([keychainRow, fileRow]);
  });

  it("caps the list", () => {
    const rows = Array.from({ length: ROTATION_TOKENS_MAX + 3 }, (_, index) => ({ id: `t${index}`, label: "L", keychain: `k${index}` }));
    expect(sanitizeTokenRotation({ enabled: true, tokens: rows }).tokens).toHaveLength(ROTATION_TOKENS_MAX);
  });

  it("reads a non-array tokens field as none", () => {
    expect(sanitizeTokenRotation({ enabled: true, tokens: keychainRow }).tokens).toEqual([]);
  });
});

describe("rotationLoginLabel (#2919)", () => {
  const rotation = { enabled: true, includeDefaultLogin: true, tokens: [{ ...keychainRow, email: "me@example.com" }, fileRow] };

  it("names a token by label and address, or label alone", () => {
    expect(rotationLoginLabel(rotation, "a")).toBe("Personal (me@example.com)");
    expect(rotationLoginLabel(rotation, "b")).toBe("Work");
  });

  it("names the /login credential, and a token gone from the config by its id", () => {
    expect(rotationLoginLabel(rotation, DEFAULT_LOGIN_ID)).toBe(DEFAULT_LOGIN_LABEL);
    expect(rotationLoginLabel(rotation, "gone")).toBe("gone");
  });
});
