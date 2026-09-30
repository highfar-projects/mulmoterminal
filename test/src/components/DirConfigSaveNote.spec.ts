// #2624. The line under the editor after a directory's config file is saved.
import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import DirConfigSaveNote from "../../../src/components/DirConfigSaveNote.vue";
import type { DirConfigSaveReport } from "../../../common/dirConfigSaveReport";

const note = (report: DirConfigSaveReport) => mount(DirConfigSaveNote, { props: { report }, global: { plugins: [i18n] } });

afterEach(() => {
  i18n.global.locale.value = "en";
});

describe("DirConfigSaveNote", () => {
  it("says it applied, with no link, when nothing is wrong", () => {
    const wrapper = note({ parsed: true, ignored: [], unknown: [] });
    expect(wrapper.findAll("p").map((line) => line.text())).toEqual([i18n.global.t("dirConfigSave.applied")]);
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("says a file that is not a JSON object applies nothing, and nothing else", () => {
    const wrapper = note({ parsed: false, ignored: ["x"], unknown: ["y"] });
    expect(wrapper.findAll("p")).toHaveLength(1);
    expect(wrapper.text()).toContain(i18n.global.t("dirConfigSave.notJson"));
  });

  it("names the ignored and the unknown keys, and links to the guide", () => {
    const wrapper = note({ parsed: true, ignored: ["headerColor", "fontSize"], unknown: ["colour"] });
    expect(wrapper.text()).toContain("headerColor, fontSize");
    expect(wrapper.text()).toContain("colour");
    expect(wrapper.find("a").attributes("href")).toBe("https://receptron.github.io/mulmoterminal/guide/en/config.html#per-dir");
  });

  it("links to the Japanese guide when the UI is Japanese", () => {
    i18n.global.locale.value = "ja";
    const wrapper = note({ parsed: true, ignored: ["x"], unknown: [] });
    expect(wrapper.find("a").attributes("href")).toContain("/guide/ja/config.html#per-dir");
  });

  it("asks to be dismissed from its close button", async () => {
    const wrapper = note({ parsed: true, ignored: [], unknown: [] });
    await wrapper.find('[data-testid="dir-config-save-note-close"]').trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
  });
});
