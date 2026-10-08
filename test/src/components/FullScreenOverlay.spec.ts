import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FullScreenOverlay from "../../../src/components/FullScreenOverlay.vue";
import { en } from "../../../src/i18n/en";

const REGION_LABEL = "Some region";
const CLOSE_LABEL = "Close some region";

const mountFrame = () =>
  mount(FullScreenOverlay, {
    props: { regionLabel: REGION_LABEL, closeLabel: CLOSE_LABEL },
    slots: { header: '<span data-testid="title">Title</span>', default: '<p data-testid="body">Body</p>' },
  });

describe("FullScreenOverlay", () => {
  it("names the region and the close button by the labels it is given", () => {
    const w = mountFrame();
    expect(w.attributes("role")).toBe("region");
    expect(w.attributes("aria-label")).toBe(REGION_LABEL);
    const button = w.get("header button");
    expect(button.attributes("aria-label")).toBe(CLOSE_LABEL);
    expect(button.attributes("data-tip")).toBe(en.tips.overlays.close);
  });

  // The header slot sits left of the spacer, so the close button is always the last thing in it,
  // and the body comes after the header rather than inside it.
  it("puts the header slot before the close button and the body after the header", () => {
    const w = mountFrame();
    const headerChildren = w.get("header").element.children;
    expect(headerChildren[0]?.getAttribute("data-testid")).toBe("title");
    expect(headerChildren[headerChildren.length - 1]?.tagName).toBe("BUTTON");
    expect(w.element.children[1]?.getAttribute("data-testid")).toBe("body");
  });

  it("emits close once per click, with nothing attached", async () => {
    const w = mountFrame();
    await w.get("header button").trigger("click");
    await w.get("header button").trigger("click");
    expect(w.emitted("close")).toEqual([[], []]);
  });
});
