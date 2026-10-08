import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { pickerPanelKeyAction, type PickerPanelKeyAction } from "../../../src/components/pickerPanelKeys";
import { menuFocusMove } from "../../../src/components/filesRowActions";
import { usePickerPanelKeys } from "../../../src/composables/usePickerPanelKeys";

// The keyboard of the file finder and the search-in-files panel. Generated over every key the panels
// might see, with and without IME composition, across list sizes and selections — including a
// selection outside the list, which is what the arrows see before the first row exists.

const KEYS = ["Escape", "Enter", "ArrowUp", "ArrowDown", "Home", "End", "Tab", "a", " ", "PageDown", "ArrowLeft", ""];
const MAX_ROWS = 6;

function* cases(): Generator<{ key: string; isComposing: boolean; active: number; rowCount: number }> {
  for (const key of KEYS)
    for (const isComposing of [false, true])
      for (let rowCount = 0; rowCount <= MAX_ROWS; rowCount++)
        for (let active = -2; active <= rowCount + 1; active++) yield { key, isComposing, active, rowCount };
}

describe("pickerPanelKeyAction", () => {
  it("leaves every key alone while an IME is composing", () => {
    for (const c of cases()) if (c.isComposing) expect(pickerPanelKeyAction(c, c.active, c.rowCount)).toBeNull();
  });

  it("closes on Escape and picks the selected row on Enter, whatever the list holds", () => {
    for (const c of cases()) {
      if (c.isComposing) continue;
      const action = pickerPanelKeyAction(c, c.active, c.rowCount);
      if (c.key === "Escape") expect(action).toEqual({ kind: "close" });
      if (c.key === "Enter") expect(action).toEqual({ kind: "pick", index: c.active });
    }
  });

  it("moves only on the arrows, exactly where the row menu would, and never on Home or End", () => {
    for (const c of cases()) {
      if (c.isComposing || c.key === "Escape" || c.key === "Enter") continue;
      const action = pickerPanelKeyAction(c, c.active, c.rowCount);
      const isArrow = c.key === "ArrowUp" || c.key === "ArrowDown";
      const to = isArrow ? menuFocusMove(c.key, c.active, c.rowCount) : null;
      expect(action).toEqual(to === null ? null : { kind: "move", to });
    }
  });
});

const expectedCalls = (action: PickerPanelKeyAction | null): string[] => {
  if (action?.kind === "close") return ["close"];
  if (action?.kind === "pick") return [`pick:${action.index}`];
  return [];
};

describe("usePickerPanelKeys", () => {
  const setup = (rowCount: number, active: number) => {
    const log: string[] = [];
    const activeRef = ref(active);
    const handlers = usePickerPanelKeys({
      panel: ref(null),
      active: activeRef,
      rowCount: () => rowCount,
      pick: (index) => log.push(`pick:${index}`),
      close: () => log.push("close"),
    });
    return { log, activeRef, handlers };
  };

  it("prevents the default exactly when the key did something, and applies it", () => {
    for (const c of cases()) {
      const { log, activeRef, handlers } = setup(c.rowCount, c.active);
      let prevented = false;
      const event = new KeyboardEvent("keydown", { key: c.key, isComposing: c.isComposing, cancelable: true });
      event.preventDefault = () => {
        prevented = true;
      };
      handlers.onKeydown(event);
      const action = pickerPanelKeyAction(c, c.active, c.rowCount);
      expect(prevented).toBe(action !== null);
      expect(log).toEqual(expectedCalls(action));
      expect(activeRef.value).toBe(action?.kind === "move" ? action.to : c.active);
    }
  });

  it("closes on a pointerdown outside the panel and not on one inside it", () => {
    const panelEl = document.createElement("div");
    const child = document.createElement("span");
    panelEl.appendChild(child);
    const log: string[] = [];
    const { onOutside } = usePickerPanelKeys({ panel: ref(panelEl), active: ref(0), rowCount: () => 0, pick: () => {}, close: () => log.push("close") });
    onOutside(new PointerEvent("pointerdown"));
    expect(log).toEqual(["close"]);
    const inside = new PointerEvent("pointerdown");
    Object.defineProperty(inside, "target", { value: child });
    onOutside(inside);
    expect(log).toEqual(["close"]);
  });
});
