// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildAccount, buildCustomAgent } from "../../../common/agentEntries";
import { buildProvider } from "../../../common/providerEntries";
import { emptyConfig, type AppConfig } from "../../../server/config/app-config";
import { appendOnDisk, refuseOnProblem } from "../../../server/config/on-disk-entry";

// The add routes' refuse/update halves, over bases grown with the real builders and drafts that
// reach every problem each builder can name, plus the success path.
const SEED = 2822;
const CASES = 600;

function seeded(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor(state / 65536) % n;
  };
}

const LABELS = ["", " ", "Kimi K3", "kimi", "a", "x".repeat(200), "Kimi K3 ", "b"];
const COMMANDS = ["", "run", " ollama launch claude -- ", "x".repeat(2000)];
const HOMES = ["", "/home/a", "~/x", "rel", "/home/a "];
const URLS = ["", "http://localhost:11434", "https://api.example.com/v1", "nope"];
const ENVS = ["", "OPENAI_API_KEY", "bad-name"];
const MODELS = ["", "a", "a, b"];
const BUDGETS = ["", "1000", "-1", "abc"];
const GROWTH_MAX = 12;

type Key = "customAgents" | "accounts" | "providers";

/** Checks one change against the property and answers which outcome it reached. */
function checkAppend<K extends Key>(key: K, build: (base: AppConfig) => { entry: AppConfig[K][number] } | { problem: string }, base: AppConfig): string {
  const appended = appendOnDisk(key, build);
  const built = build(base);
  const update = appended.update(base, {});
  expect(Object.keys(update)).toEqual([key]);
  if ("problem" in built) {
    expect(appended.refuse(base, {})).toBe(built.problem);
    expect(update[key]).toBe(base[key]);
    return `${key} ${built.problem}`;
  }
  expect(appended.refuse(base, {})).toBeNull();
  expect(update[key]).toEqual([...base[key], built.entry]);
  return `${key} ok`;
}

function generator(rand: (n: number) => number) {
  const pick = <T>(xs: readonly T[]): T => xs[rand(xs.length)];
  const grow = (): AppConfig => {
    const base = emptyConfig();
    Array.from({ length: rand(GROWTH_MAX) }).forEach(() => {
      const agent = buildCustomAgent(pick(LABELS), "run", base.customAgents);
      if ("entry" in agent) base.customAgents = [...base.customAgents, agent.entry];
      const account = buildAccount(pick(LABELS), "claude", "/h", base.accounts);
      if ("entry" in account) base.accounts = [...base.accounts, account.entry];
      const draft = { label: pick(LABELS), baseUrl: "http://localhost:1", tokenEnv: "K", models: "a", maxOutputTokens: "" };
      const provider = buildProvider(
        draft,
        base.providers.map((entry) => entry.id),
      );
      if ("entry" in provider) base.providers = [...base.providers, provider.entry];
    });
    return base;
  };
  const change = (key: Key) => {
    if (key === "customAgents") {
      const [label, command] = [pick(LABELS), pick(COMMANDS)];
      return (base: AppConfig) => checkAppend(key, (given) => buildCustomAgent(label, command, given.customAgents), base);
    }
    if (key === "accounts") {
      const [label, agent, home] = [pick(LABELS), pick(["claude", "codex"] as const), pick(HOMES)];
      return (base: AppConfig) => checkAppend(key, (given) => buildAccount(label, agent, home, given.accounts), base);
    }
    const draft = { label: pick(LABELS), baseUrl: pick(URLS), tokenEnv: pick(ENVS), models: pick(MODELS), maxOutputTokens: pick(BUDGETS) };
    const build = (given: AppConfig) =>
      buildProvider(
        draft,
        given.providers.map((entry) => entry.id),
      );
    return (base: AppConfig) => checkAppend(key, build, base);
  };
  return { grow, change, key: () => pick(["customAgents", "accounts", "providers"] as const) };
}

describe("appendOnDisk", () => {
  it("refuses exactly when the build names a problem, and otherwise appends the built entry", () => {
    const gen = generator(seeded(SEED));
    const seen = new Set<string>();
    Array.from({ length: CASES }).forEach(() => {
      const base = gen.grow();
      seen.add(gen.change(gen.key())(base));
    });
    // The generator must reach the success path of every list and a refusal of each.
    (["customAgents", "accounts", "providers"] as const).forEach((key) => {
      expect([...seen].some((tag) => tag === `${key} ok`)).toBe(true);
      expect([...seen].some((tag) => tag.startsWith(`${key} `) && tag !== `${key} ok`)).toBe(true);
    });
  });
});

describe("refuseOnProblem", () => {
  it.each([
    ["a problem", { problem: "full" }, "full"],
    ["a built theme", { theme: { id: "t" } }, null],
    ["a changed list", { themes: [] }, null],
    ["an appended entry", { entry: { id: "a" } }, null],
  ])("answers %s", (_case, outcome, expected) => {
    expect(refuseOnProblem(() => outcome)(emptyConfig())).toBe(expected);
  });

  it("builds against the config it is handed", () => {
    const base = emptyConfig();
    const seenBases: AppConfig[] = [];
    refuseOnProblem((given) => {
      seenBases.push(given);
      return { problem: "label" };
    })(base);
    expect(seenBases).toEqual([base]);
    expect(seenBases[0]).toBe(base);
  });
});
