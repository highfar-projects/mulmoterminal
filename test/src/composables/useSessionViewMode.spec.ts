// #3075: the store behind the carried view, and which choices reach it.
import { describe, it, expect, beforeEach } from "vitest";
import { ref } from "vue";
import { useCarriedView, useSessionViewMode } from "../../../src/composables/useSessionViewMode";

beforeEach(() => localStorage.clear());

describe("useSessionViewMode", () => {
  it("keeps one view per session, and none without a session", () => {
    const session = ref<string | null>("s1");
    const store = useSessionViewMode(() => session.value);
    store.remember("canvas");
    expect(store.mode()).toBe("canvas");
    session.value = "s2";
    expect(store.mode()).toBe("edit");
    session.value = null;
    store.remember("preview");
    expect(store.mode()).toBe("edit");
    session.value = "s1";
    expect(store.mode()).toBe("canvas");
  });

  it("answers the editor when storage holds junk", () => {
    localStorage.setItem("files_view_mode", "{not json");
    expect(useSessionViewMode(() => "s1").mode()).toBe("edit");
  });
});

describe("useCarriedView — what the reader chose", () => {
  const pane = () => {
    const showPreview = ref(false);
    const active = ref(false);
    const openPath = ref<string | null>("a.md");
    const carried = useCarriedView({
      props: { viewModeSession: "s1" },
      file: { showPreview, openPath },
      canvas: () => ({ has: () => false, openable: ref(true), active, show: async () => true }),
    });
    return { showPreview, active, openPath, carried, mode: () => useSessionViewMode(() => "s1").mode() };
  };

  it("records a switch that happened", async () => {
    const p = pane();
    await p.carried.choose(async () => {
      p.showPreview.value = true;
    });
    expect(p.mode()).toBe("preview");
    await p.carried.choose(async () => {
      p.active.value = true;
    });
    expect(p.mode()).toBe("canvas");
  });

  // The toggles leave the view as it was when the buffer could not be saved; that is not a choice.
  it("records nothing when the switch was refused", async () => {
    const p = pane();
    await p.carried.choose(async () => {
      p.showPreview.value = true;
    });
    p.showPreview.value = false; // a tab of its own brought the editor back
    await p.carried.choose(async () => {});
    expect(p.mode()).toBe("preview");
  });

  // A switch still saving when another file opens: what is on screen afterwards is that file's own
  // view, not anything the reader picked.
  it("records nothing when another file came to the front meanwhile", async () => {
    const p = pane();
    await p.carried.choose(async () => {
      p.openPath.value = "b.md";
      p.active.value = true; // b.md's own Canvas view
    });
    expect(p.mode()).toBe("edit");
  });
});
