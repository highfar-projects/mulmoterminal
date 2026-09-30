// #2722. The Settings form for one directory: a change is sent as one key's edit, the form redraws
// from the server's answer, and a failure says why and puts the input back.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import DirSettingsForm from "../../../src/components/settings/DirSettingsForm.vue";
import { parseDirConfigDetail } from "../../../src/components/dirConfigDetail";

const detail = (formValues: Record<string, unknown>, local: string[] = []) =>
  parseDirConfigDetail({ exists: true, file: "/p/.mulmoterminal.json", config: {}, source: { applied: Object.keys(formValues), local }, formValues });

let sent: unknown[] = [];
let posted: string[] = [];
let answer: () => Response = () => new Response("{}");

// What /api/launch-options answers: a backend a session can start on, and one it cannot (no key).
const LAUNCH_OPTIONS = {
  anyReady: true,
  providers: [
    {
      id: "router",
      label: "Router",
      ready: true,
      tokenEnv: "ROUTER_KEY",
      models: [
        { provider: "router", id: "vendor/big", label: "Big", contextLength: 200000, pricePerMTok: { input: 1, output: 2 }, trials: { status: "unmeasured" } },
      ],
    },
    {
      id: "nokey",
      label: "No key",
      ready: false,
      reason: "provider 'nokey' needs NOKEY_KEY in the server's environment",
      tokenEnv: "NOKEY_KEY",
      models: [
        { provider: "nokey", id: "vendor/small", label: "Small", contextLength: 8000, pricePerMTok: { input: 1, output: 1 }, trials: { status: "unmeasured" } },
      ],
    },
  ],
};

beforeEach(() => {
  sent = [];
  posted = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).includes("/api/launch-options")) return new Response(JSON.stringify(LAUNCH_OPTIONS));
    if (String(url).includes("/api/skills")) return new Response(JSON.stringify({ skills: [{ slug: "review" }, { slug: "ship" }] }));
    posted.push(String(url));
    sent.push(JSON.parse(String(init?.body)));
    return answer();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mountForm = (formValues: Record<string, unknown>, local: string[] = []) =>
  mount(DirSettingsForm, { props: { path: "/p", detail: detail(formValues, local) }, global: { plugins: [i18n] } });

const input = (wrapper: ReturnType<typeof mountForm>, key: string) => wrapper.find(`#dir-form-${key}`);
const inputValue = (wrapper: ReturnType<typeof mountForm>, key: string): string => {
  const element = input(wrapper, key).element;
  return element instanceof HTMLInputElement ? element.value : "";
};

describe("DirSettingsForm", () => {
  it("shows what the directory's files say", () => {
    const wrapper = mountForm({ name: "shop", fontSize: 14, headerColor: "#112233" });
    expect(inputValue(wrapper, "name")).toBe("shop");
    expect(inputValue(wrapper, "fontSize")).toBe("14");
    expect(wrapper.find('[data-testid="dir-form-row-headerColor"]').text()).toContain("#112233");
    expect(wrapper.find('[data-testid="dir-form-row-cellColor"]').text()).toContain(i18n.global.t("dirSettingsForm.notSet"));
  });

  it("offers to use the global setting only for a key the files set, and marks a local one", () => {
    const wrapper = mountForm({ name: "shop", theme: "dark" }, ["theme"]);
    expect(wrapper.find('[data-testid="dir-form-clear-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dir-form-clear-fontSize"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dir-form-row-theme"]').text()).toContain(i18n.global.t("dirSettingsForm.local"));
  });

  it("saves one key on change and emits the server's answer", async () => {
    answer = () => new Response(JSON.stringify({ exists: true, formValues: { name: "renamed" } }));
    const wrapper = mountForm({ name: "shop" });
    await input(wrapper, "name").setValue("renamed");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: { name: "renamed" }, unset: [] }]);
    expect(wrapper.emitted("saved")?.[0]?.[0]).toMatchObject({ formValues: { name: "renamed" } });
  });

  it("sends an unset from the use-global button", async () => {
    const wrapper = mountForm({ fontSize: 14 });
    await wrapper.find('[data-testid="dir-form-clear-fontSize"]').trigger("click");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: {}, unset: ["fontSize"] }]);
  });

  it("does not save a value that did not change", async () => {
    const wrapper = mountForm({ name: "shop" });
    await input(wrapper, "name").setValue("shop");
    await flushPromises();
    expect(sent).toEqual([]);
  });

  it("refuses a fraction without asking the server, and puts the input back", async () => {
    const wrapper = mountForm({ fontSize: 14 });
    await input(wrapper, "fontSize").setValue("14.5");
    await flushPromises();
    expect(sent).toEqual([]);
    expect(wrapper.find('[data-testid="dir-settings-form-error"]').text()).toBe(i18n.global.t("dirSettingsForm.errors.wholeNumber"));
    expect(inputValue(wrapper, "fontSize")).toBe("14");
  });

  it("names the file when the server will not write over it, and puts the input back", async () => {
    answer = () => new Response(JSON.stringify({ error: "x", file: "/p/.mulmoterminal.json" }), { status: 422 });
    const wrapper = mountForm({ name: "shop" });
    await input(wrapper, "name").setValue("other");
    await flushPromises();
    expect(wrapper.find('[data-testid="dir-settings-form-error"]').text()).toContain("/p/.mulmoterminal.json");
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(inputValue(wrapper, "name")).toBe("shop");
  });

  it("says it could not save when the request fails", async () => {
    answer = () => {
      throw new Error("offline");
    };
    const wrapper = mountForm({});
    await input(wrapper, "name").setValue("x");
    await flushPromises();
    expect(wrapper.find('[data-testid="dir-settings-form-error"]').text()).toBe(i18n.global.t("dirSettingsForm.errors.failed"));
  });

  it("saves the status style from its own list, and the global choice takes the key out", async () => {
    const wrapper = mountForm({ headerStatusTint: "none" });
    const select = wrapper.find("#dir-form-headerStatusTint");
    await select.setValue("background");
    await flushPromises();
    await wrapper.setProps({ detail: detail({ headerStatusTint: "none" }) });
    await wrapper.find("#dir-form-headerStatusTint").setValue("");
    await flushPromises();
    expect(sent).toEqual([
      { cwd: "/p", set: { headerStatusTint: "background" }, unset: [] },
      { cwd: "/p", set: {}, unset: ["headerStatusTint"] },
    ]);
  });

  it("writes the status colours in the file's own shape", async () => {
    const wrapper = mountForm({ headerStatusColors: { working: "#111111" } });
    const working = wrapper.find('[data-testid="dir-form-row-headerStatusColors"] [data-status="working"]');
    await working.find('[data-testid="header-color-background"]').setValue("#00aa00");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: { headerStatusColors: { working: "#00aa00" } }, unset: [] }]);
  });

  it("takes the status colours out when the last one goes back to the theme", async () => {
    const wrapper = mountForm({ headerStatusColors: { done: "#222222" } });
    await wrapper.find('[data-testid="dir-form-row-headerStatusColors"] [data-status="done"] [data-testid="header-color-reset"]').trigger("click");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: {}, unset: ["headerStatusColors"] }]);
  });

  it("adds one palette colour to what the file holds, and clearing the last takes the key out", async () => {
    const wrapper = mountForm({ colors: { red: "#ff0000" } });
    await wrapper.find('[data-testid="dir-palette-input-blue"]').setValue("#0000ff");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { colors: { red: "#ff0000", blue: "#0000ff" } }, unset: [] });
    await wrapper.find('[data-testid="dir-palette-clear-red"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: {}, unset: ["colors"] });
  });

  it("offers the global setting for a whole set the directory holds", async () => {
    const wrapper = mountForm({ colors: { red: "#ff0000" } }, ["colors"]);
    expect(wrapper.find('[data-testid="dir-form-row-colors"]').text()).toContain(i18n.global.t("dirSettingsForm.local"));
    await wrapper.find('[data-testid="dir-form-clear-colors"]').trigger("click");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: {}, unset: ["colors"] }]);
    expect(wrapper.find('[data-testid="dir-form-clear-headerStatusColors"]').exists()).toBe(false);
  });

  it("counts the palette colours the file sets, in the singular for one", () => {
    expect(
      mountForm({ colors: { red: "#ff0000" } })
        .find('[data-testid="dir-palette"] summary')
        .text(),
    ).toContain("1 colour set");
    expect(
      mountForm({ colors: { red: "#ff0000", blue: "#0000ff" } })
        .find('[data-testid="dir-palette"] summary')
        .text(),
    ).toContain("2 colours set");
  });

  // Deliberate: the file schema refuses a `colors` holding an unknown key or a non-colour, so a save
  // that kept such an entry would be refused whole. The form writes the set it shows.
  it("writes the palette without entries the app ignores, since the file schema would refuse the save", async () => {
    const wrapper = mountForm({ colors: { red: "#ff0000", teal: "#00ffff", green: "lime" } });
    await wrapper.find('[data-testid="dir-palette-input-blue"]').setValue("#0000ff");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: { colors: { red: "#ff0000", blue: "#0000ff" } }, unset: [] }]);
  });

  // A provider the server cannot start a session on is not a choice: as this directory's default,
  // every cell here would refuse to start. The launch picker leaves it out for the same reason.
  it("offers the configured models of the providers that can start a session, and writes the backend and the model together", async () => {
    const wrapper = mountForm({});
    await flushPromises();
    const select = wrapper.find('[data-testid="dir-form-model-select"]');
    expect(select.findAll("option").map((option) => option.attributes("value"))).toEqual(["", "router|vendor/big"]);
    await select.setValue("router|vendor/big");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: { provider: "router", model: "vendor/big" }, unset: [] }]);
  });

  it("still shows a file's choice on a provider that is not ready", async () => {
    const wrapper = mountForm({ provider: "nokey", model: "vendor/small" });
    await flushPromises();
    const values = wrapper.findAll('[data-testid="dir-form-model-select"] option').map((option) => option.attributes("value"));
    expect(values).toEqual(["", "nokey|vendor/small", "router|vendor/big"]);
  });

  it("keeps showing a model choice the list does not hold, and 'Use global' takes both keys out", async () => {
    const wrapper = mountForm({ provider: "gone", model: "old/model" });
    await flushPromises();
    const select = wrapper.find('[data-testid="dir-form-model-select"]');
    expect(select.element instanceof HTMLSelectElement ? select.element.value : "").toBe("gone|old/model");
    await wrapper.find('[data-testid="dir-form-clear-model"]').trigger("click");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: {}, unset: ["provider", "model"] }]);
  });

  it("saves the closing-summary switch as a boolean", async () => {
    const wrapper = mountForm({ appendSystemPrompt: true });
    await wrapper.find("#dir-form-appendSystemPrompt").setValue("false");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: { appendSystemPrompt: false }, unset: [] }]);
  });

  it("adds, rewrites and removes an extra directory, and removing the last takes the key out", async () => {
    const wrapper = mountForm({ addDirs: ["../shared", 7] });
    expect(wrapper.findAll('[data-testid^="dir-add-dirs-entry-"]')).toHaveLength(1);
    await wrapper.find('[data-testid="dir-add-dirs-new"]').setValue(" ../docs ");
    await wrapper.find('[data-testid="dir-add-dirs-add"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { addDirs: ["../shared", "../docs"] }, unset: [] });
    await wrapper.find('[data-testid="dir-add-dirs-entry-0"]').setValue("../common");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { addDirs: ["../common"] }, unset: [] });
    await wrapper.find('[data-testid="dir-add-dirs-remove-0"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: {}, unset: ["addDirs"] });
  });

  it("switches the icon off, and waits for a path before writing an image", async () => {
    const wrapper = mountForm({});
    await wrapper.find("#dir-form-icon").setValue("none");
    await flushPromises();
    expect(sent).toEqual([{ cwd: "/p", set: { icon: false }, unset: [] }]);
    await wrapper.setProps({ detail: detail({ icon: false }) });
    await wrapper.find("#dir-form-icon").setValue("image");
    await flushPromises();
    expect(sent).toHaveLength(1);
    await wrapper.find('[data-testid="dir-form-icon-path"]').setValue("public/logo.png");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { icon: "public/logo.png" }, unset: [] });
  });

  it("sets a background, then its strength and fit, and an empty picture takes it out", async () => {
    const wrapper = mountForm({ backgroundImage: "wall.jpg" });
    const slider = wrapper.find('[data-testid="dir-background-opacity"]');
    await slider.setValue("0.3");
    await slider.trigger("change");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { backgroundImage: { image: "wall.jpg", opacity: 0.3 } }, unset: [] });
    await wrapper.find('[data-testid="dir-background-fit"]').setValue("contain");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { backgroundImage: { image: "wall.jpg", fit: "contain" } }, unset: [] });
    await wrapper.find("#dir-form-backgroundImage").setValue("");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: {}, unset: ["backgroundImage"] });
  });

  it("picks a preset sound or a file of the directory's own", async () => {
    const wrapper = mountForm({});
    await wrapper.find("#dir-form-sound").setValue("preset:coin");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { sound: "preset:coin" }, unset: [] });
    await wrapper.find("#dir-form-sound").setValue("file");
    await flushPromises();
    expect(sent).toHaveLength(1);
    await wrapper.find('[data-testid="dir-form-sound-path"]').setValue("sounds/ding.mp3");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { sound: "sounds/ding.mp3" }, unset: [] });
  });

  it("sets one kind's sound in the per-kind map, and clearing the last takes the map out", async () => {
    const wrapper = mountForm({ sounds: { finished: "preset:chime" } });
    await wrapper.find("#dir-form-sounds-waiting").setValue("preset:coin");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { sounds: { finished: "preset:chime", waiting: "preset:coin" } }, unset: [] });
    await wrapper.setProps({ detail: detail({ sounds: { finished: "preset:chime" } }) });
    await wrapper.find("#dir-form-sounds-finished").setValue("");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: {}, unset: ["sounds"] });
  });

  it("offers every skill the directory can see, and reorders the menu's list", async () => {
    const wrapper = mountForm({ skills: ["ship", "review"] });
    await flushPromises();
    expect(wrapper.findAll("#dir-skills-suggestions option").map((option) => option.attributes("value"))).toEqual([]);
    await wrapper.find('[data-testid="dir-skills-move-1-up"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { skills: ["review", "ship"] }, unset: [] });
  });

  it("suggests the skills not on the list yet", async () => {
    const wrapper = mountForm({ skills: ["ship"] });
    await flushPromises();
    expect(wrapper.findAll("#dir-skills-suggestions option").map((option) => option.attributes("value"))).toEqual(["review"]);
  });

  it("adds a deck", async () => {
    const wrapper = mountForm({});
    await wrapper.find('[data-testid="dir-decks-new"]').setValue("decks/talk.json");
    await wrapper.find('[data-testid="dir-decks-add"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { decks: ["decks/talk.json"] }, unset: [] });
  });

  it("declares a per-worktree variable, changes its kind, and removing the last takes the key out", async () => {
    const wrapper = mountForm({});
    await wrapper.find('[data-testid="dir-worktree-env-new-name"]').setValue("PORT");
    await wrapper.find('[data-testid="dir-worktree-env-add"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { worktreeEnv: { PORT: { kind: "port", base: 3000 } } }, unset: [] });
    await wrapper.setProps({ detail: detail({ worktreeEnv: { PORT: { kind: "port", base: 3000 } } }) });
    await wrapper.find('[data-testid="dir-worktree-env-value-PORT"]').setValue("4000");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: { worktreeEnv: { PORT: { kind: "port", base: 4000 } } }, unset: [] });
    await wrapper.find('[data-testid="dir-worktree-env-remove-PORT"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", set: {}, unset: ["worktreeEnv"] });
  });

  it("moves a key to this checkout's own file, and back", async () => {
    const wrapper = mountForm({ name: "shop" });
    await wrapper.find('[data-testid="dir-form-move-name"]').trigger("click");
    await flushPromises();
    expect(posted.at(-1)).toBe("/api/dir-config/move");
    expect(sent.at(-1)).toEqual({ cwd: "/p", key: "name", to: "local" });
    await wrapper.setProps({ detail: detail({ name: "shop" }, ["name"]) });
    await wrapper.find('[data-testid="dir-form-move-name"]').trigger("click");
    await flushPromises();
    expect(sent.at(-1)).toEqual({ cwd: "/p", key: "name", to: "shared" });
  });

  it("offers no move for the model row, which is two keys", () => {
    expect(mountForm({ provider: "router", model: "vendor/big" }).find('[data-testid="dir-form-move-model"]').exists()).toBe(false);
  });
});
