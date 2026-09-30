// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildProvider, RECOMMENDED_MAX_OUTPUT_TOKENS, type ProviderDraft } from "../../common/providerEntries";

const DRAFT: ProviderDraft = {
  label: "Moonshot",
  baseUrl: "https://api.moonshot.ai/anthropic",
  tokenEnv: "MOONSHOT_API_KEY",
  models: "kimi-k3",
  maxOutputTokens: "16000",
};
const with_ = (change: Partial<ProviderDraft>, ids: string[] = []) => buildProvider({ ...DRAFT, ...change }, ids);

describe("buildProvider", () => {
  it("builds an entry with an id from the name", () => {
    expect(buildProvider(DRAFT, [])).toEqual({
      entry: {
        id: "moonshot",
        label: "Moonshot",
        baseUrl: "https://api.moonshot.ai/anthropic",
        tokenEnv: "MOONSHOT_API_KEY",
        maxOutputTokens: 16000,
        models: ["kimi-k3"],
      },
    });
    expect(RECOMMENDED_MAX_OUTPUT_TOKENS).toBe(16000);
  });

  it("refuses a base URL ending in /v1, with or without a slash, and one that is not http(s)", () => {
    ["https://x.ai/v1", "https://x.ai/v1/", "https://x.ai/api/v1"].forEach((baseUrl) => expect(with_({ baseUrl })).toEqual({ problem: "baseUrlV1" }));
    ["", "x.ai", "mailto:a@x.ai", "javascript:alert(1)"].forEach((baseUrl) => expect(with_({ baseUrl })).toEqual({ problem: "baseUrl" }));
    expect("entry" in with_({ baseUrl: "https://x.ai/v10" })).toBe(true);
  });

  it("drops trailing slashes from the base URL", () => {
    const built = with_({ baseUrl: "https://x.ai/api///" });
    expect("entry" in built && built.entry.baseUrl).toBe("https://x.ai/api");
  });

  it("takes only an environment variable NAME, so a pasted key is refused", () => {
    ["sk-ant-api03-abcdef", "moonshot_key", "1KEY", "KEY-NAME", "", "sk_live_abc"].forEach((tokenEnv) =>
      expect(with_({ tokenEnv })).toEqual({ problem: "tokenEnv" }),
    );
    ["OPENROUTER_API_KEY", "_KEY", "K2"].forEach((tokenEnv) => expect("entry" in with_({ tokenEnv })).toBe(true));
  });

  it("needs models for any backend but openrouter, and refuses an unusable id", () => {
    expect(with_({ models: "" })).toEqual({ problem: "models" });
    expect(with_({ models: "good bad id!" })).toEqual({ problem: "models" });
    const openrouter = with_({ label: "OpenRouter", models: "" });
    expect("entry" in openrouter && openrouter.entry).toMatchObject({ id: "openrouter", models: [] });
    const many = with_({ models: "a, b\nc a" });
    expect("entry" in many && many.entry.models).toEqual(["a", "b", "c"]);
  });

  it("leaves the budget out when blank, and refuses one that is not a positive whole number", () => {
    const blank = with_({ maxOutputTokens: " " });
    expect("entry" in blank && "maxOutputTokens" in blank.entry).toBe(false);
    ["0", "-5", "1.5", "lots"].forEach((maxOutputTokens) => expect(with_({ maxOutputTokens })).toEqual({ problem: "maxOutputTokens" }));
  });

  it("numbers a name that is taken, and needs one", () => {
    const again = with_({}, ["moonshot"]);
    expect("entry" in again && again.entry.id).toBe("moonshot-2");
    expect(with_({ label: "  " })).toEqual({ problem: "label" });
    expect(with_({ label: "x".repeat(41) })).toEqual({ problem: "label" });
  });
});
