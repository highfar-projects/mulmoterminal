// The spreadsheet View loads and saves its workbook through useRuntime().dispatch, and
// useRuntime throws outside a runtime provider — so the registration must wrap it.
import { describe, it, expect } from "vitest";
import { getPlugin } from "../../src/plugins-registry";
import { CANVAS_CARD_HEIGHT_VAR } from "../../src/composables/useCanvasCardHeight";

describe("presentSpreadsheet registration", () => {
  const registration = getPlugin("presentSpreadsheet");

  it("is registered with a stylesheet slot", () => {
    // Vitest stubs `?inline` CSS to "", so the content is checked by `yarn build`, not here.
    expect(registration).toBeDefined();
    expect(typeof registration?.css).toBe("string");
  });

  it("wraps the View in the plugin runtime provider", () => {
    expect(registration?.viewComponent.name).toBe("PluginRuntimeScope:spreadsheet");
  });

  it("gets the measured card height, since the grid scrolls inside an h-full column", () => {
    expect(registration?.height).toContain(CANVAS_CARD_HEIGHT_VAR);
  });
});
