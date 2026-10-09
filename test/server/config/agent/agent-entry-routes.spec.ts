// @vitest-environment node
//
// #2620. Custom agents and accounts are changed ONE ENTRY at a time against the file, so an entry
// another tab, another MulmoTerminal or a hand-edit added since the page loaded survives.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../../helpers/routeCall";

const installs = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../../server/infra/fs/install-bundled-skills.js", () => ({
  installBundledSkills: () => {
    installs.count += 1;
  },
}));

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  installs.count = 0;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function mountWith(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-entries-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  const file = path.join(dir, ".mulmoterminal", "config.json");
  writeFileSync(file, JSON.stringify(initial));
  vi.resetModules();
  const routes = await import("../../../../server/config/config-routes.js");
  expect(routes.APP_CONFIG_FILE, "config path must be inside the temp HOME").toBe(file);
  const app = express();
  app.use(express.json());
  routes.mountConfigRoutes(app, dir);
  const onDisk = () => JSON.parse(readFileSync(file, "utf8"));
  const writeOnDisk = (config: Record<string, unknown>) => writeFileSync(file, JSON.stringify(config));
  return { post: (route: string, body: unknown) => routeCall(app)(route, jsonPost(body)), onDisk, writeOnDisk };
}

const agent = (id: string) => ({ id, label: id, agent: "claude", command: "run" });

describe("custom agents, one entry at a time", () => {
  it("adds to the list ON DISK, keeping an entry written there since boot", async () => {
    const { post, onDisk, writeOnDisk } = await mountWith({ customAgents: [agent("a")] });
    writeOnDisk({ customAgents: [agent("a"), agent("b")] });
    const res = await post("/api/config/custom-agents/add", { label: "Kimi K3", command: " ollama launch claude --model kimi -- " });
    expect(res.status).toBe(200);
    const expected = [agent("a"), agent("b"), { id: "kimi-k3", label: "Kimi K3", agent: "claude", command: "ollama launch claude --model kimi --" }];
    expect(res.body.customAgents).toEqual(expected);
    expect(onDisk().customAgents).toEqual(expected);
  });

  it("derives the id against the list on disk, not the one the tab had", async () => {
    const { post, writeOnDisk } = await mountWith({});
    writeOnDisk({ customAgents: [agent("kimi")] });
    const res = await post("/api/config/custom-agents/add", { label: "Kimi", command: "run" });
    expect(res.body.customAgents).toEqual([agent("kimi"), { id: "kimi-2", label: "Kimi", agent: "claude", command: "run" }]);
  });

  it("removes only the one named, keeping an entry written since boot", async () => {
    const { post, onDisk, writeOnDisk } = await mountWith({ customAgents: [agent("a"), agent("b")] });
    writeOnDisk({ customAgents: [agent("a"), agent("b"), agent("c")] });
    const res = await post("/api/config/custom-agents/remove", { id: "a" });
    expect(res.status).toBe(200);
    expect(onDisk().customAgents).toEqual([agent("b"), agent("c")]);
  });

  it("refuses with the problem, and writes nothing", async () => {
    const full = Array.from({ length: 8 }, (_, i) => agent(`a${i}`));
    const { post, onDisk } = await mountWith({ customAgents: full });
    const tooMany = await post("/api/config/custom-agents/add", { label: "Kimi", command: "run" });
    expect([tooMany.status, tooMany.body.error]).toEqual([409, "full"]);
    const noCommand = await post("/api/config/custom-agents/remove", {});
    expect(noCommand.status).toBe(400);
    expect(onDisk().customAgents).toEqual(full);
  });
});

describe("accounts, one entry at a time", () => {
  it("adds against the list on disk and installs the bundled skills for the new home", async () => {
    const { post, onDisk, writeOnDisk } = await mountWith({});
    writeOnDisk({ accounts: [{ id: "home", label: "Home", agent: "claude", home: "~/.claude-home" }] });
    const res = await post("/api/config/accounts/add", { label: "Work", agent: "codex", home: "~/.codex-work" });
    expect(res.status).toBe(200);
    expect(onDisk().accounts).toEqual([
      { id: "home", label: "Home", agent: "claude", home: "~/.claude-home" },
      { id: "work", label: "Work", agent: "codex", home: "~/.codex-work" },
    ]);
    expect(installs.count).toBe(1);
  });

  it("refuses a relative home and an unknown agent", async () => {
    const { post, onDisk } = await mountWith({});
    const relative = await post("/api/config/accounts/add", { label: "Work", agent: "claude", home: ".claude-work" });
    expect([relative.status, relative.body.error]).toEqual([409, "home"]);
    const unknownAgent = await post("/api/config/accounts/add", { label: "Work", agent: "grok", home: "~/.x" });
    expect(unknownAgent.status).toBe(400);
    expect(onDisk().accounts ?? []).toEqual([]);
    expect(installs.count).toBe(0);
  });

  it("removes only the one named", async () => {
    const both = [
      { id: "a", label: "A", agent: "claude", home: "~/.a" },
      { id: "b", label: "B", agent: "codex", home: "~/.b" },
    ];
    const { post, onDisk } = await mountWith({ accounts: both });
    await post("/api/config/accounts/remove", { id: "b" });
    expect(onDisk().accounts).toEqual([both[0]]);
  });
});

describe("providers, one entry at a time", () => {
  const draft = { label: "Moonshot", baseUrl: "https://api.moonshot.ai/anthropic", tokenEnv: "MOONSHOT_API_KEY", models: "kimi-k3", maxOutputTokens: "16000" };
  const openrouter = { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api", tokenEnv: "OPENROUTER_API_KEY", models: [] };

  it("adds to the list on disk and keeps what was written there since boot", async () => {
    const { post, onDisk, writeOnDisk } = await mountWith({});
    writeOnDisk({ providers: [openrouter] });
    const res = await post("/api/config/providers/add", draft);
    expect(res.status).toBe(200);
    expect(onDisk().providers).toEqual([
      openrouter,
      {
        id: "moonshot",
        label: "Moonshot",
        baseUrl: "https://api.moonshot.ai/anthropic",
        tokenEnv: "MOONSHOT_API_KEY",
        maxOutputTokens: 16000,
        models: ["kimi-k3"],
      },
    ]);
  });

  it("refuses a key where the variable's name belongs, and a /v1 base URL, writing nothing", async () => {
    const { post, onDisk } = await mountWith({ providers: [openrouter] });
    const key = await post("/api/config/providers/add", { ...draft, tokenEnv: "sk-ant-api03-secret" });
    expect([key.status, key.body.error]).toEqual([409, "tokenEnv"]);
    const v1 = await post("/api/config/providers/add", { ...draft, baseUrl: "https://api.moonshot.ai/v1" });
    expect([v1.status, v1.body.error]).toEqual([409, "baseUrlV1"]);
    const inUrl = await post("/api/config/providers/add", { ...draft, baseUrl: "https://u:sk-ant-in-url@api.moonshot.ai/anthropic" });
    expect([inUrl.status, inUrl.body.error]).toEqual([409, "baseUrl"]);
    const inModels = await post("/api/config/providers/add", { ...draft, models: "sk-ant-in-models" });
    expect([inModels.status, inModels.body.error]).toEqual([409, "models"]);
    expect(JSON.stringify(onDisk())).not.toContain("sk-ant");
    expect(onDisk().providers).toEqual([openrouter]);
  });

  it("removes only the one named", async () => {
    const { post, onDisk } = await mountWith({ providers: [openrouter, { ...openrouter, id: "other", label: "Other", models: ["m"] }] });
    await post("/api/config/providers/remove", { id: "openrouter" });
    expect(onDisk().providers.map((provider: { id: string }) => provider.id)).toEqual(["other"]);
  });
});
