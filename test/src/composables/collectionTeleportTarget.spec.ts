import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";

// Mocked rather than exercised through the real module: collectionUi pulls the whole host binding
// (configureCollectionUi and every /api/* helper) in on import, and none of it decides anything
// here. What this spec is about is WHEN the composable pushes and pops.
vi.mock("../../../src/composables/collectionUi", () => ({
  pushCollectionTeleportTarget: vi.fn(),
  popCollectionTeleportTarget: vi.fn(),
}));

const { useCollectionTeleportTarget } = await import("../../../src/composables/useCollectionTeleportTarget");
const { pushCollectionTeleportTarget, popCollectionTeleportTarget } = await import("../../../src/composables/collectionUi");

const push = vi.mocked(pushCollectionTeleportTarget);
const pop = vi.mocked(popCollectionTeleportTarget);

// A probe the composable can resolve a ShadowRoot from, the way PluginFrame's mount does.
const probeInShadow = (): HTMLElement => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = document.createElement("div");
  host.attachShadow({ mode: "open" }).appendChild(el);
  return el;
};

// The composable registers `onBeforeUnmount` from inside a function the component calls, so it is
// only bound if it runs during setup — which is exactly what an extraction out of a component can
// break without a single type or existing test noticing.
const mountWithProbe = (probe: Ref<HTMLElement | undefined>) =>
  mount(
    defineComponent({
      setup() {
        useCollectionTeleportTarget(probe);
        return () => h("div");
      },
    }),
  );

describe("useCollectionTeleportTarget", () => {
  beforeEach(() => {
    push.mockClear();
    pop.mockClear();
  });

  it("registers the probe's shadow root once it appears", async () => {
    const probe = ref<HTMLElement>();
    mountWithProbe(probe);
    expect(push).not.toHaveBeenCalled();

    const el = probeInShadow();
    probe.value = el;
    await Promise.resolve();

    expect(push).toHaveBeenCalledWith(el.getRootNode());
  });

  // The detail page this rides is `v-if`ed, so the probe comes and goes while the surface stays
  // mounted. Without the unregister-first, a surface would leave an entry on the stack per swap.
  it("drops the previous root before registering the next", async () => {
    const probe = ref<HTMLElement>();
    mountWithProbe(probe);

    const first = probeInShadow();
    probe.value = first;
    await Promise.resolve();

    const second = probeInShadow();
    probe.value = second;
    await Promise.resolve();

    expect(pop).toHaveBeenCalledWith(first.getRootNode());
    expect(push).toHaveBeenLastCalledWith(second.getRootNode());
  });

  it("drops it again on unmount, so a closed surface leaves nothing behind", async () => {
    const probe = ref<HTMLElement>();
    const wrapper = mountWithProbe(probe);

    const el = probeInShadow();
    probe.value = el;
    await Promise.resolve();
    pop.mockClear();

    wrapper.unmount();

    expect(pop).toHaveBeenCalledWith(el.getRootNode());
  });

  // A probe that is not inside a shadow root resolves to the document, and registering THAT would
  // send the modal to a target that defeats the point — the styles live in the shadow root.
  it("ignores a probe that is not inside a shadow root", async () => {
    const probe = ref<HTMLElement>();
    mountWithProbe(probe);

    const el = document.createElement("div");
    document.body.appendChild(el);
    probe.value = el;
    await Promise.resolve();

    expect(push).not.toHaveBeenCalled();
  });
});
