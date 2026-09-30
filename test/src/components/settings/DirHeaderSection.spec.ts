// #2727. A directory's header in its Settings form: the global button and chip editors pointed at this
// directory's lists, each change posted to /api/dir-config/entries with the list it is about, and the
// directory's detail from the answer handed up so the whole form redraws.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../../src/i18n";
import DirHeaderSection from "../../../../src/components/settings/DirHeaderSection.vue";
import { parseDirConfigDetail } from "../../../../src/components/dirConfigDetail";

const detail = (formValues: Record<string, unknown>) =>
  parseDirConfigDetail({ exists: true, file: "/p/.mulmoterminal.json", config: {}, source: {}, formValues });
const build = { id: "build", label: "Build", run: "shell", cmd: "yarn build" };

let sent: Record<string, unknown>[] = [];
let answer: () => Response = () => new Response(JSON.stringify({ exists: true, formValues: {} }));

beforeEach(() => {
  sent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return answer();
  });
});
afterEach(() => vi.restoreAllMocks());

const mountSection = (formValues: Record<string, unknown>) =>
  mount(DirHeaderSection, { props: { path: "/p", detail: detail(formValues) }, global: { plugins: [i18n] } });

describe("DirHeaderSection", () => {
  it("lists the directory's own buttons, and says an unset list leaves the global one in charge", () => {
    const wrapper = mountSection({ buttons: [build] });
    expect(wrapper.find('[data-testid="dir-form-row-buttons"]').text()).toContain("Build");
    expect(wrapper.find('[data-testid="dir-form-row-commands"]').text()).toContain(i18n.global.t("headerButtons.dirNone"));
    expect(wrapper.find('[data-testid="dir-form-row-chips"]').text()).toContain(i18n.global.t("headerChips.dirNone"));
  });

  it("offers every built-in chip for a directory with none, since its list starts empty", () => {
    const wrapper = mountSection({});
    const offered = wrapper.findAll('[data-testid="dir-form-row-chips"] [data-testid="header-chip-kind"] option').map((option) => option.attributes("value"));
    expect(offered).toEqual(expect.arrayContaining(["git", "work", "diff", "ctx", "usage", "env"]));
  });

  it("removes a button through the directory's route, naming the list, and hands the answer up", async () => {
    answer = () => new Response(JSON.stringify({ exists: true, formValues: {} }));
    const wrapper = mountSection({ buttons: [build] });
    await wrapper
      .find(`[data-testid="dir-form-row-buttons"] button[aria-label="${i18n.global.t("settings.common.remove", { name: "Build" })}"]`)
      .trigger("click");
    await flushPromises();
    expect(sent).toEqual([{ id: "build", cwd: "/p", list: "buttons", action: "remove" }]);
    expect(wrapper.emitted("saved")?.[0]?.[0]).toMatchObject({ formValues: {} });
  });

  it("adds a palette command to the commands list, not the buttons", async () => {
    const wrapper = mountSection({});
    const commands = wrapper.find('[data-testid="dir-form-row-commands"]');
    await commands.find('[data-testid="header-button-label"] input, input[data-testid="header-button-label"]').setValue("Release");
    await commands.find('[data-testid="header-button-payload"] input, input[data-testid="header-button-payload"]').setValue("make release");
    await commands.find('[data-testid="header-button-add"]').trigger("click");
    await flushPromises();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ cwd: "/p", list: "commands", action: "add", label: "Release", payload: "make release" });
  });

  it("offers no folder for a palette command, and does not describe one", () => {
    const wrapper = mountSection({ commands: [build] });
    expect(wrapper.find('[data-testid="dir-form-row-commands"]').text()).toContain(i18n.global.t("headerButtons.hintNoFolder", { example: "${branch}" }));
    expect(wrapper.find('[data-testid="dir-form-row-buttons"]').text()).toContain(i18n.global.t("headerButtons.hint", { example: "${branch}" }));
    expect(wrapper.find('[data-testid="dir-form-row-commands"] [data-testid="header-button-into-folder"]').exists()).toBe(false);
    expect(
      mountSection({ buttons: [build] })
        .find('[data-testid="dir-form-row-buttons"] [data-testid="header-button-into-folder"]')
        .exists(),
    ).toBe(true);
  });

  it("hands up the directory a refusal carries, so the form catches up", async () => {
    answer = () => new Response(JSON.stringify({ error: "stale", detail: { exists: true, formValues: { chips: ["diff"] } } }), { status: 409 });
    const wrapper = mountSection({ chips: ["git"] });
    const gitName = i18n.global.t("headerChips.builtins.git");
    await wrapper
      .find(`[data-testid="dir-form-row-chips"] button[aria-label="${i18n.global.t("settings.common.remove", { name: gitName })}"]`)
      .trigger("click");
    await flushPromises();
    expect(sent[0]).toMatchObject({ list: "chips", action: "remove", index: 0, chip: "git" });
    expect(wrapper.emitted("saved")?.[0]?.[0]).toMatchObject({ formValues: { chips: ["diff"] } });
  });
});
