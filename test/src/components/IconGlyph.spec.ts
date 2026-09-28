import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { GITHUB_ICON_PATHS } from "../../../common/githubIcons";
import IconGlyph from "../../../src/components/IconGlyph.vue";

describe("IconGlyph", () => {
  it("draws an Octicon for a github: icon, with the github size class", () => {
    const w = mount(IconGlyph, { props: { icon: "github:git-pull-request", materialClass: "m-cls", githubClass: "g-cls" } });
    const svg = w.find("svg");
    expect(svg.attributes("data-github-icon")).toBe("git-pull-request");
    expect(svg.classes()).toContain("g-cls");
    expect(svg.findAll("path")).toHaveLength(GITHUB_ICON_PATHS["git-pull-request"].length);
    expect(w.find(".material-symbols-outlined").exists()).toBe(false);
  });

  it("draws a Material Symbol for anything else, including an unknown github: name", () => {
    for (const icon of ["merge", "github:nope"]) {
      const w = mount(IconGlyph, { props: { icon, materialClass: "m-cls", githubClass: "g-cls" } });
      const span = w.find(".material-symbols-outlined");
      expect(span.text()).toBe(icon);
      expect(span.classes()).toContain("m-cls");
      expect(w.find("svg").exists()).toBe(false);
    }
  });
});
