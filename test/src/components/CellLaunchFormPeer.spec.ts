// The launch form with a PEER server picked (common/peers.ts): its saved folders, its past sessions
// and every check it makes are that server's, and a resumed row keeps saying where it lives.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import CellLaunchForm from "../../../src/components/CellLaunchForm.vue";
import { providePaneHost } from "../../../src/composables/paneHost";
import type { AgentPick } from "../../../common/customAgents";

const asked: string[] = [];

beforeEach(() => {
  asked.length = 0;
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    asked.push(u);
    if (u.startsWith("/peer/win/api/config"))
      return {
        ok: true,
        json: async () => ({
          cwd: "/home/them",
          cwdPresets: [{ label: "theirs", path: "/home/them/proj" }],
          accounts: [{ id: "their-work", label: "Their work", agent: "claude", home: "~/.claude-work" }],
        }),
      };
    if (u.startsWith("/peer/win/api/sessions"))
      return { ok: true, json: async () => ({ cwd: "/home/them/proj", sessions: [{ id: "s-peer", title: "on the peer", mtime: 1 }] }) };
    if (u.startsWith("/peer/win/api/worktrees")) return { ok: true, json: async () => ({ isGit: false, worktrees: [] }) };
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
});

// As TerminalCell and LaunchPanel mount it: the picked server provided to everything under the form.
function mountOnPeer() {
  const events: { resume: unknown[] } = { resume: [] };
  const wrapper = mount(
    defineComponent({
      setup() {
        providePaneHost(ref("win"));
        return () =>
          h(CellLaunchForm, {
            dir: "/home/them/proj",
            agent: "claude" as AgentPick,
            choice: null,
            defaultCwd: "/home/me/ws",
            presets: [{ label: "mine", path: "/home/me/local" }],
            accounts: [{ id: "my-work", label: "My work", agent: "claude", home: "~/.claude-mine" }],
            peers: [{ id: "win", label: "Windows" }],
            host: "win",
            onResume: (value: unknown) => events.resume.push(value),
          });
      },
    }),
    { global: { stubs: { ModelPicker: true } } },
  );
  return { events, wrapper };
}

describe("the launch form on a peer", () => {
  it("offers the peer's saved folders, not this server's, and no way to delete them from here", async () => {
    const { wrapper } = mountOnPeer();
    await flushPromises();
    const tips = wrapper.findAll('[data-testid="cell-chip-main"]').map((el) => el.attributes("data-tip") ?? "");
    expect(tips.some((tip) => tip.startsWith("/home/them/proj"))).toBe(true);
    expect(tips.some((tip) => tip.startsWith("/home/me/local"))).toBe(false);
    expect(wrapper.find('[data-testid="cell-chip-del"]').exists()).toBe(false);
  });

  it("lists the peer's past sessions, and resumes one as the peer's", async () => {
    const { events, wrapper } = mountOnPeer();
    // The peer's default workspace arrives with its config, after mount, and the lists are read again
    // for it once the form's reload debounce has passed.
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await flushPromises();
    const row = wrapper.find('[data-testid="cell-resume-item"]');
    expect(row.text()).toContain("on the peer");
    await row.trigger("click");
    expect(events.resume).toEqual([{ id: "s-peer", cwd: "/home/them/proj", agent: "claude", account: null, host: "win" }]);
  });

  // The id picked travels to the peer, which binds it against ITS accounts: one of this server's
  // would be ignored there and the session would start on the default login, silently.
  it("offers the peer's accounts, not this server's", async () => {
    const { wrapper } = mountOnPeer();
    await flushPromises();
    const options = wrapper.findAll('[data-testid="cell-account-select"] option').map((el) => el.text());
    expect(options).toContain("Their work");
    expect(options).not.toContain("My work");
  });

  // A new read in the form that forgets the server is the leak this catches.
  it("asks this server for nothing but the peer list", async () => {
    mountOnPeer();
    await flushPromises();
    expect(asked.filter((u) => u.startsWith("/api/") && u !== "/api/peers")).toEqual([]);
  });
});
