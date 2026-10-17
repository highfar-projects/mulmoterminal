// What the overlay shows for a given heat, setting and theme: nothing when off or cold, the
// session's picture at its level when hot, the finale for a moment when told of one, and a blend
// that keeps the terminal text readable on either theme.
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { setPlayfulEffects } from "../../../src/composables/playfulEffects";
import HeatStage from "../../../src/components/cpuHeat/HeatStage.vue";
import { loadPlayfulMedia } from "../../../src/composables/playfulMedia";

const CpuHeatOverlay = (await import("../../../src/components/CpuHeatOverlay.vue")).default;

const FINALE_SHOW_MS = 2500;

// The user's own files reach the overlay through the list the server answers; set it the same way.
async function serveMedia(body: unknown): Promise<void> {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  await loadPlayfulMedia();
}

const GIF = { kind: "image", url: "/api/playful-media/0?v=1" };
const CLIP = { kind: "video", url: "/api/playful-media/0?v=2" };
const BOOM = { kind: "video", url: "/api/playful-media/0/finale?v=3" };

afterEach(async () => {
  await serveMedia({ builtIn: true, items: [] });
  vi.unstubAllGlobals();
  setPlayfulEffects(undefined);
  document.documentElement.removeAttribute("data-appearance");
  vi.useRealTimers();
});

describe("CpuHeatOverlay", () => {
  it("shows nothing while the session is cold", () => {
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 0, heatFinales: 0 } });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("shows nothing when switched off, however hot", () => {
    setPlayfulEffects("off");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 4, heatFinales: 0 } });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("shows nothing for a cell with no session yet", () => {
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: null, heatLevel: 4, heatFinales: 0 } });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("draws the chosen picture at the session's level", () => {
    setPlayfulEffects("volcano");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
    const stage = wrapper.getComponent(HeatStage);
    expect(stage.props("pattern")).toBe("volcano");
    expect(stage.props("level")).toBe(3);
  });

  it("plays the finale for a moment when told of one, then clears", async () => {
    vi.useFakeTimers();
    setPlayfulEffects("bomb");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
    await wrapper.setProps({ heatLevel: 0, heatFinales: 1 });
    expect(wrapper.getComponent(HeatStage).props("level")).toBe(5);
    vi.advanceTimersByTime(FINALE_SHOW_MS);
    await flushPromises();
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("does not replay the finale when the count merely resets on a new socket", async () => {
    setPlayfulEffects("bomb");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 0, heatFinales: 2 } });
    await wrapper.setProps({ heatFinales: 0 });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("blends so the lighter pixel wins on a dark theme and the darker on a light one", async () => {
    setPlayfulEffects("bomb");
    document.documentElement.setAttribute("data-appearance", "dark");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 2, heatFinales: 0 } });
    expect(wrapper.get('[data-testid="cpu-heat"]').classes()).toContain("mix-blend-screen");
    document.documentElement.setAttribute("data-appearance", "light");
    await flushPromises();
    expect(wrapper.get('[data-testid="cpu-heat"]').classes()).toContain("mix-blend-multiply");
  });

  it("gives each overlay its own gradient id, so two critical cells cannot share one", () => {
    setPlayfulEffects("bomb");
    // One app, as on the page: useId counts per app, so two separate mounts would each start at zero.
    const TwoCells = defineComponent(
      () => () =>
        h("div", [h(CpuHeatOverlay, { sessionId: "s1", heatLevel: 4, heatFinales: 0 }), h(CpuHeatOverlay, { sessionId: "s2", heatLevel: 4, heatFinales: 0 })]),
    );
    const ids = mount(TwoCells)
      .findAll("radialGradient")
      .map((gradient) => gradient.attributes("id"));
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips the finale for someone who asked for less motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    try {
      setPlayfulEffects("bomb");
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
      await wrapper.setProps({ heatLevel: 0, heatFinales: 1 });
      expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("the user's own files", () => {
    it("draws the file in place of a built-in picture, as solid as a built-in one at that level", async () => {
      await serveMedia({ builtIn: false, items: [{ media: GIF, finale: null }] });
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 2, heatFinales: 0 } });
      expect(wrapper.findComponent(HeatStage).exists()).toBe(false);
      expect(wrapper.get('[data-testid="cpu-heat-media"] img').attributes("src")).toBe(GIF.url);
      expect(wrapper.get('[data-testid="cpu-heat-media"]').attributes("style")).toContain("opacity: 0.5");
    });

    it("plays a video muted and on a loop", async () => {
      await serveMedia({ builtIn: false, items: [{ media: CLIP, finale: null }] });
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 1, heatFinales: 0 } });
      const video = wrapper.get<HTMLVideoElement>('[data-testid="cpu-heat-media"] video');
      expect(video.attributes("src")).toBe(CLIP.url);
      expect(video.element.muted).toBe(true);
      expect(video.element.loop).toBe(true);
    });

    it("keeps the same element across levels, so the file is not restarted", async () => {
      await serveMedia({ builtIn: false, items: [{ media: GIF, finale: null }] });
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 1, heatFinales: 0 } });
      const first = wrapper.get('[data-testid="cpu-heat-media"] img').element;
      await wrapper.setProps({ heatLevel: 3 });
      expect(wrapper.get('[data-testid="cpu-heat-media"] img').element).toBe(first);
    });

    it("plays the finale file once, at full strength, when told of a finale", async () => {
      await serveMedia({ builtIn: false, items: [{ media: GIF, finale: BOOM }] });
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
      await wrapper.setProps({ heatLevel: 0, heatFinales: 1 });
      const video = wrapper.get<HTMLVideoElement>('[data-testid="cpu-heat-media"] video');
      expect(video.attributes("src")).toBe(BOOM.url);
      expect(video.element.loop).toBe(false);
      expect(wrapper.get('[data-testid="cpu-heat-media"]').attributes("style")).toContain("opacity: 1");
    });

    it("simply goes at the finale when the file has none", async () => {
      await serveMedia({ builtIn: false, items: [{ media: GIF, finale: null }] });
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
      await wrapper.setProps({ heatLevel: 0, heatFinales: 1 });
      expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
    });

    it("falls back to a still built-in picture for someone who asked for less motion", async () => {
      await serveMedia({ builtIn: true, items: [{ media: GIF, finale: null }] });
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
      const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
      ids.forEach((id) => {
        const wrapper = mount(CpuHeatOverlay, { props: { sessionId: id, heatLevel: 2, heatFinales: 0 } });
        expect(wrapper.find('[data-testid="cpu-heat-media"]').exists()).toBe(false);
        expect(wrapper.findComponent(HeatStage).props("animate")).toBe(false);
      });
    });

    it("ignores a list whose files are not under our own route", async () => {
      await serveMedia({ builtIn: false, items: [{ media: { kind: "image", url: "https://example.com/a.gif" }, finale: null }] });
      const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 4, heatFinales: 0 } });
      expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
    });
  });
});
