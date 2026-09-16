// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { accountEnvFor } from "../../../server/session/account-env";
import type { Account } from "../../../common/accounts";

const HOME = "/home/dev";

const WORK: Account = { id: "work", label: "Work", configDir: "/opt/claude-work" };

describe("accountEnvFor", () => {
  it("sets CLAUDE_CONFIG_DIR from the account's configDir", () => {
    expect(accountEnvFor(WORK, {}, HOME)).toEqual({ CLAUDE_CONFIG_DIR: "/opt/claude-work" });
  });

  it("expands a leading ~ against the given home directory", () => {
    const account: Account = { ...WORK, configDir: "~/.claude-work" };
    expect(accountEnvFor(account, {}, HOME).CLAUDE_CONFIG_DIR).toBe("/home/dev/.claude-work");
  });

  it("reads the OAuth token from the named env var, never storing the name as the value", () => {
    const account: Account = { ...WORK, oauthTokenEnvVar: "WORK_CLAUDE_TOKEN" };
    const env = accountEnvFor(account, { WORK_CLAUDE_TOKEN: "sk-ant-oat-test" }, HOME);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat-test");
  });

  it("warns and omits the token when the named env var isn't set on the server, rather than throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const account: Account = { ...WORK, oauthTokenEnvVar: "WORK_CLAUDE_TOKEN" };
    const env = accountEnvFor(account, {}, HOME);
    expect(env).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    expect(env.CLAUDE_CONFIG_DIR).toBe("/opt/claude-work"); // the config dir still applies
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("WORK_CLAUDE_TOKEN"));
    warn.mockRestore();
  });

  it("sets no token key at all when the account names no env var", () => {
    expect(accountEnvFor(WORK, { WORK_CLAUDE_TOKEN: "sk-ant-oat-test" }, HOME)).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
  });
});
