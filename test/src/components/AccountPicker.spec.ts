import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

import AccountPicker from "../../../src/components/AccountPicker.vue";
import { reloadAccounts } from "../../../src/composables/useAccounts";

const ACCOUNTS = [
  { id: "work", label: "Work" },
  { id: "personal", label: "Personal" },
];

const serve = async (payload: unknown) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
  await reloadAccounts();
};

const picker = () => mount(AccountPicker, { props: { modelValue: null } });

beforeEach(() => vi.unstubAllGlobals());

describe("AccountPicker", () => {
  // Requirement 0: the select is ALWAYS offered, starting on "Default" — never greyed out and
  // never hidden, whatever /api/accounts answers.
  it("always shows a select starting on Default, even with nothing configured", async () => {
    await serve({ accounts: [] });
    const wrapper = picker();
    await flushPromises();
    const select = wrapper.get('[data-testid="cell-account-select"]');
    expect(select.findAll("option").map((o) => o.text())).toEqual(["Default"]);
    expect((select.element as HTMLSelectElement).value).toBe("");
  });

  it("lists every configured account beside Default", async () => {
    await serve({ accounts: ACCOUNTS });
    const wrapper = picker();
    await flushPromises();
    const options = wrapper.get('[data-testid="cell-account-select"]').findAll("option");
    expect(options.map((o) => o.text())).toEqual(["Default", "Work", "Personal"]);
    expect(options.map((o) => o.attributes("value"))).toEqual(["", "work", "personal"]);
  });

  it("emits the picked account id", async () => {
    await serve({ accounts: ACCOUNTS });
    const wrapper = picker();
    await flushPromises();
    await wrapper.get('[data-testid="cell-account-select"]').setValue("work");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["work"]);
  });

  // null is what tells the server to fall back to the directory's own default (or the host's).
  it("emits null when the user returns to Default", async () => {
    await serve({ accounts: ACCOUNTS });
    const wrapper = picker();
    await flushPromises();
    const select = wrapper.get('[data-testid="cell-account-select"]');
    await select.setValue("work");
    await select.setValue("");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([null]);
  });

  // A picker that cannot load its list must still work — every session already runs on Default.
  it("still offers Default when the list cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await reloadAccounts();
    const wrapper = picker();
    await flushPromises();
    const select = wrapper.get('[data-testid="cell-account-select"]');
    expect(select.findAll("option").map((o) => o.text())).toEqual(["Default"]);
  });
});
