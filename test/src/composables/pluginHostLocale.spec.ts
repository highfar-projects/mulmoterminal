// Collection and accounting are handed the display language through their host bindings, and the
// two deliberately differ for Traditional Chinese: collection's tag also keys the server's exact-key
// translation route, accounting reads the region off the tag.
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@mulmoclaude/collection-plugin/vue", () => ({ configureCollectionUi: vi.fn() }));
vi.mock("@mulmoclaude/accounting-plugin/vue", () => ({ configureAccountingHost: vi.fn() }));

const { configureCollectionUi } = await import("@mulmoclaude/collection-plugin/vue");
const { configureAccountingHost } = await import("@mulmoclaude/accounting-plugin/vue");
await import("../../../src/composables/collectionUi");
await import("../../../src/composables/accountingUi");
const { i18n } = await import("../../../src/i18n");

const collectionLocaleTag = vi.mocked(configureCollectionUi).mock.calls[0][0].localeTag;
const accountingLocaleTag = vi.mocked(configureAccountingHost).mock.calls[0][0].localeTag;

afterEach(() => {
  i18n.global.locale.value = "en";
});

describe("host bindings' locale tag", () => {
  it("follows the display language", () => {
    i18n.global.locale.value = "ja";
    expect(collectionLocaleTag()).toBe("ja");
    expect(accountingLocaleTag()).toBe("ja");
    i18n.global.locale.value = "en";
    expect(collectionLocaleTag()).toBe("en");
    expect(accountingLocaleTag()).toBe("en");
  });

  it("gives collection the table key and accounting the full tag for Traditional Chinese", () => {
    i18n.global.locale.value = "zh-TW";
    expect(collectionLocaleTag()).toBe("zh");
    expect(accountingLocaleTag()).toBe("zh-TW");
  });
});
