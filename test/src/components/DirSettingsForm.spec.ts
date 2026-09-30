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
let answer: () => Response = () => new Response("{}");

beforeEach(() => {
  sent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
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
});
