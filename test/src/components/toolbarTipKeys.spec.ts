// The toolbar's hover tips and aria-labels are translated (#2408); see tipCensus.ts.
import { describe, it, expect } from "vitest";
import { describeTipSurface } from "./tipCensus";
import { i18n } from "../../../src/i18n";
import { UI_LOCALES } from "../../../src/composables/uiLanguage";
import AppToolbarSource from "../../../src/components/AppToolbar.vue?raw";
import NotificationBellSource from "../../../src/components/NotificationBell.vue?raw";
import RemoteHostControlSource from "../../../src/components/RemoteHostControl.vue?raw";
import MachineLoadGaugeSource from "../../../src/components/MachineLoadGauge.vue?raw";
import soundButtonStateSource from "../../../src/components/soundButtonState.ts?raw";
import gridTabsSource from "../../../src/components/gridTabs.ts?raw";
import useGithubStarSource from "../../../src/composables/useGithubStar.ts?raw";

// The surface this section covers. A file added to the toolbar belongs here too.
describeTipSurface("toolbar", {
  "AppToolbar.vue": AppToolbarSource,
  "NotificationBell.vue": NotificationBellSource,
  "RemoteHostControl.vue": RemoteHostControlSource,
  "MachineLoadGauge.vue": MachineLoadGaugeSource,
  "soundButtonState.ts": soundButtonStateSource,
  "gridTabs.ts": gridTabsSource,
  "useGithubStar.ts": useGithubStarSource,
});

// The grid-status and load hovers carry counts; a translation that drops one says nothing.
describe("the toolbar's figures", () => {
  it.each(UI_LOCALES.map((locale) => locale.code))("keeps every count and figure in %s", (locale) => {
    const load = i18n.global.t("tips.toolbar.load", { averages: "1.00 / 2.00 / 3.00", cores: 20, ratio: "0.1" }, { locale });
    expect(load).toContain("1.00 / 2.00 / 3.00");
    expect(load).toContain("20");
    expect(i18n.global.t("tips.toolbar.needInput", { count: 7 }, { locale })).toContain("7");
  });
});
