// The rate-limit gauge's hover and notes are translated (#2408); see tipCensus.ts.
import { describe, it, expect } from "vitest";
import { describeTipSurface } from "./tipCensus";
import { i18n } from "../../../src/i18n";
import { UI_LOCALES } from "../../../src/composables/uiLanguage";
import { rateLimitReadout } from "../../../src/composables/rateLimitGauge";
import RateLimitGaugeSource from "../../../src/components/RateLimitGauge.vue?raw";
import rateLimitGaugeSource from "../../../src/composables/rateLimitGauge.ts?raw";

// The surface this section covers.
describeTipSurface("rateLimit", {
  "RateLimitGauge.vue": RateLimitGaugeSource,
  "rateLimitGauge.ts": rateLimitGaugeSource,
});

// Several accounts can share the row, so a note that lost the account's name would not say whose
// gauge is missing — in any language.
describe("an account's note", () => {
  const NOW = 1_700_000_000_000;
  const snapshot = {
    claude: null,
    codex: null,
    accounts: [{ id: "work", label: "Work", agent: "claude" as const, limits: null, probe: "no-claude" as const }],
  };

  it.each(UI_LOCALES.map((locale) => locale.code))("names the account in %s", (locale) => {
    const translate = (key: string, named: Record<string, unknown>) => i18n.global.t(key, named, { locale });
    expect(rateLimitReadout(snapshot, NOW, translate).accountNotes[0]?.note).toContain("Work");
  });
});
