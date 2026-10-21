// #3153. Switched off, the usage gauge is not mounted, so nothing polls the refresh that runs a probe.
// Its own file because AppToolbar.spec.ts is near the length limit.
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import AppToolbar from "../../../src/components/AppToolbar.vue";
import { router } from "../../../src/router/index";
import { setUsageGauge } from "../../../src/composables/usageGauge";

vi.mock("../../../src/composables/useShortcuts", async () => {
  const { computed } = await import("vue");
  return { useShortcuts: () => ({ shortcuts: computed(() => []) }) };
});

const mountBar = async () => {
  await router.push("/terminals");
  await flushPromises();
  const wrapper = mount(AppToolbar, {
    global: { plugins: [router], stubs: { NotificationBell: true, RemoteHostControl: true, RateLimitGauge: true } },
  });
  await flushPromises();
  return wrapper;
};
const gauge = (wrapper: Awaited<ReturnType<typeof mountBar>>) => wrapper.findComponent({ name: "RateLimitGauge" });

afterEach(() => setUsageGauge(true));

describe("the usage gauge on the grid", () => {
  it("is there by default", async () => {
    const wrapper = await mountBar();
    expect(gauge(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });

  it("is not there when switched off", async () => {
    setUsageGauge(false);
    const wrapper = await mountBar();
    expect(gauge(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });
});
