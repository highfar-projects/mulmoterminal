// The Bot jobs section (plans/feat-bot-gpu-jobs.md): the switch and the interpreter save through
// /api/config, and the token list mints and revokes through /api/bot-tokens. What matters most is
// that a token cannot be minted without the mobile-remote connection it belongs to, and that its
// secret is shown once — gone after the next look at the list.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import BotJobsSection from "../../../../src/components/settings/BotJobsSection.vue";
import { setBotJobs } from "../../../../src/composables/botJobs";

const SECRET = `mtb_${"a".repeat(43)}`;
const ENDPOINTS = { submit: "https://x/submitBotJob", result: "https://x/getBotJob" };
const ROW = { tokenId: "b".repeat(64), name: "GrokBot", hostId: "mulmoterminal-0a1b2c3d", createdAt: "2026-10-26T00:00:00.000Z" };

interface Server {
  connected: boolean;
  tokens: (typeof ROW)[];
  config: Record<string, unknown>;
}

let server: Server;
const sent: { url: string; method: string; body: unknown }[] = [];

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  sent.length = 0;
  server = { connected: true, tokens: [], config: {} };
  setBotJobs(undefined);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ url, method, body });
    if (url === "/api/remote-host/status") return reply(200, { status: { connected: server.connected, uid: null } });
    if (url === "/api/config" && method === "POST") return reply(200, body);
    if (url === "/api/bot-tokens" && method === "GET") return reply(200, { tokens: server.tokens, endpoints: ENDPOINTS });
    if (url === "/api/bot-tokens" && method === "POST") {
      server.tokens = [...server.tokens, ROW];
      return reply(200, { token: SECRET, record: ROW, endpoints: ENDPOINTS });
    }
    if (url.startsWith("/api/bot-tokens/") && method === "DELETE") {
      server.tokens = [];
      return reply(200, { ok: true });
    }
    return reply(404, { error: "no route" });
  }) as unknown as typeof fetch;
});

const mountSection = async () => {
  const wrapper = mount(BotJobsSection);
  await flushPromises();
  return wrapper;
};

describe("Bot jobs section", () => {
  it("switches bot jobs on through /api/config, keeping the interpreter", async () => {
    setBotJobs({ enabled: false, python: "~/venv/bin/python" });
    const wrapper = await mountSection();
    const box = wrapper.get<HTMLInputElement>('[data-testid="bot-jobs-enabled"]');
    box.element.checked = true;
    await box.trigger("change");
    await flushPromises();
    expect(sent.find((call) => call.url === "/api/config")?.body).toEqual({ botJobs: { enabled: true, python: "~/venv/bin/python" } });
    expect(box.element.checked).toBe(true);
  });

  it("saves the interpreter only once it changed", async () => {
    const wrapper = await mountSection();
    const save = wrapper.get('[data-testid="bot-jobs-python-save"]');
    expect(save.attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="bot-jobs-python"]').setValue("  ~/venvs/gpu/bin/python ");
    await save.trigger("click");
    await flushPromises();
    expect(sent.find((call) => call.url === "/api/config")?.body).toEqual({ botJobs: { enabled: false, python: "~/venvs/gpu/bin/python" } });
  });

  it("will not mint without the mobile-remote connection, and says why", async () => {
    server.connected = false;
    const wrapper = await mountSection();
    expect(wrapper.find('[data-testid="bot-jobs-not-connected"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="bot-jobs-mint"]').attributes("disabled")).toBeDefined();
  });

  // Connecting happens in the toolbar while this pane stays mounted.
  it("offers minting once the connection comes up, without reopening Settings", async () => {
    vi.useFakeTimers();
    try {
      server.connected = false;
      const wrapper = await mountSection();
      expect(wrapper.get('[data-testid="bot-jobs-mint"]').attributes("disabled")).toBeDefined();
      server.connected = true;
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();
      expect(wrapper.get('[data-testid="bot-jobs-mint"]').attributes("disabled")).toBeUndefined();
      expect(wrapper.find('[data-testid="bot-jobs-not-connected"]').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("mints a token, shows its secret and the two addresses, and lists it", async () => {
    const wrapper = await mountSection();
    await wrapper.get('[data-testid="bot-jobs-token-name"]').setValue("GrokBot");
    await wrapper.get('[data-testid="bot-jobs-mint"]').trigger("click");
    await flushPromises();
    expect(sent.find((call) => call.method === "POST" && call.url === "/api/bot-tokens")?.body).toEqual({ name: "GrokBot" });
    expect(wrapper.get<HTMLInputElement>('[data-testid="bot-jobs-secret"]').element.value).toBe(SECRET);
    expect(wrapper.get('[data-testid="bot-jobs-minted"]').text()).toContain(ENDPOINTS.submit);
    expect(wrapper.get('[data-testid="bot-jobs-tokens"]').text()).toContain("GrokBot");
  });

  it("forgets the secret on remount: it is shown once", async () => {
    server.tokens = [ROW];
    const wrapper = await mountSection();
    expect(wrapper.find('[data-testid="bot-jobs-minted"]').exists()).toBe(false);
    expect(wrapper.html()).not.toContain(SECRET);
  });

  it("revokes after a confirm, and not without one", async () => {
    server.tokens = [ROW];
    const wrapper = await mountSection();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const remove = () => wrapper.get('[data-testid="bot-jobs-tokens"] button').trigger("click");
    await remove();
    await flushPromises();
    expect(sent.some((call) => call.method === "DELETE")).toBe(false);
    await remove();
    await flushPromises();
    expect(sent.find((call) => call.method === "DELETE")?.url).toBe(`/api/bot-tokens/${ROW.tokenId}`);
    expect(wrapper.find('[data-testid="bot-jobs-tokens"]').exists()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("shows the server's refusal", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/remote-host/status") return reply(200, { status: { connected: true } });
      if (url === "/api/bot-tokens" && (init?.method ?? "GET") === "GET") return reply(200, { tokens: [], endpoints: ENDPOINTS });
      return reply(502, { error: "createBotToken failed: no such host" });
    }) as unknown as typeof fetch;
    const wrapper = await mountSection();
    await wrapper.get('[data-testid="bot-jobs-mint"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="bot-jobs-error"]').text()).toBe("createBotToken failed: no such host");
    expect(wrapper.find('[data-testid="bot-jobs-minted"]').exists()).toBe(false);
  });
});
