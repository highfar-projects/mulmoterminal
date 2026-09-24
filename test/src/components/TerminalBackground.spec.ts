// The picture behind a terminal: drawn only when configured, at the configured opacity and fit,
// never catching a click, and blended so the text on top stays readable on either theme.
import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const TerminalBackground = (await import("../../../src/components/TerminalBackground.vue")).default;

const BACKGROUND = { url: "/api/dir-background?cwd=%2Fw", opacity: 0.25, fit: "contain" as const };

afterEach(() => document.documentElement.removeAttribute("data-appearance"));

describe("TerminalBackground", () => {
  it("draws nothing when the directory sets no background", () => {
    expect(
      mount(TerminalBackground, { props: { background: null } })
        .find("img")
        .exists(),
    ).toBe(false);
  });

  it("draws the configured picture at its opacity and fit", () => {
    const img = mount(TerminalBackground, { props: { background: BACKGROUND } }).get('[data-testid="terminal-background"]');
    expect(img.attributes("src")).toBe(BACKGROUND.url);
    expect(img.attributes("style")).toContain("opacity: 0.25");
    expect(img.classes()).toContain("object-contain");
  });

  it("never takes a click meant for the terminal", () => {
    const wrapper = mount(TerminalBackground, { props: { background: BACKGROUND } });
    expect(wrapper.get("div").classes()).toContain("pointer-events-none");
  });

  it("blends by theme, following a switch", async () => {
    document.documentElement.setAttribute("data-appearance", "light");
    const wrapper = mount(TerminalBackground, { props: { background: BACKGROUND } });
    expect(wrapper.get("div").classes()).toContain("mix-blend-multiply");
    document.documentElement.setAttribute("data-appearance", "dark");
    await flushPromises();
    expect(wrapper.get("div").classes()).toContain("mix-blend-screen");
  });
});
