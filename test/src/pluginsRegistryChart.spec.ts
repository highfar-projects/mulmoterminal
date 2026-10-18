// A chart may draw from a spreadsheet range: its View reads the range with
// useRuntime().dispatch and redraws on the workbook's file channel, so the
// registration must wrap it in the runtime provider under the "chart" scope the
// server's file-change matcher uses.
import { describe, it, expect } from "vitest";
import { getPlugin } from "../../src/plugins-registry";

describe("presentChart registration", () => {
  it("wraps the View in the plugin runtime provider under the chart scope", () => {
    expect(getPlugin("presentChart")?.viewComponent.name).toBe("PluginRuntimeScope:chart");
  });
});
