import { describe, it, expect } from "vitest";
import { describeBytes, keymapRows, sendRows } from "../../../src/components/keymapLabels";
import { KEYMAP_ACTIONS } from "../../../common/keymap";
import { en } from "../../../src/i18n/en";
import { ja } from "../../../src/i18n/ja";

const CTRL_E = "\u0005";
const CTRL_A = "\u0001";
const ESC = "\u001b";

describe("keymapRows", () => {
  it("offers every action, bound or not — an unbound row is how the action is discovered", () => {
    const rows = keymapRows({ "zoom-next": "PageDown" });
    expect(rows).toHaveLength(KEYMAP_ACTIONS.length);
    expect(rows.find((r) => r.action === "zoom-next")?.binding).toBe("PageDown");
    expect(rows.find((r) => r.action === "zoom-prev")?.binding).toBeNull();
  });
});

// C0 control characters have no glyph, so the raw bytes would render an EMPTY row on the one
// screen that tells the user what they configured.
describe("describeBytes", () => {
  it.each([
    [CTRL_A, "^A"],
    [CTRL_E, "^E"],
    [ESC, "^["],
    ["\u007f", "^?"],
    ["\u000b", "^K"],
  ])("writes %j in the caret notation a terminal uses", (bytes, shown) => {
    expect(describeBytes(bytes)).toBe(shown);
  });

  it("leaves printable text alone, and handles a mixed sequence", () => {
    expect(describeBytes("git status")).toBe("git status");
    expect(describeBytes(`${ESC}b`)).toBe("^[b");
  });

  it("never returns empty for non-empty bytes, whatever they are", () => {
    expect(describeBytes(CTRL_E).length).toBeGreaterThan(0);
  });
});

describe("sendRows", () => {
  it("is empty when nothing is bound, so the list shows only what exists", () => {
    expect(sendRows({})).toEqual([]);
    expect(sendRows({ "zoom-next": "PageDown" })).toEqual([]);
  });

  it("shows the keystroke and what it sends", () => {
    expect(sendRows({ send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }] })).toEqual([{ id: "0:Cmd+ArrowRight", key: "Cmd+ArrowRight", label: "^E" }]);
  });

  // Codex review of #1023. Two entries may claim ONE keystroke: validation warns, but the config
  // still loads and sanitizeKeymap keeps both. Keyed by the binding string, Vue would see one key
  // twice and reuse DOM nodes across the rows — one binding disappears from the screen whose whole
  // job is showing what is configured.
  it("gives duplicate keystrokes distinct ids, so neither row is swallowed", () => {
    const rows = sendRows({
      send: [
        { key: "Cmd+ArrowRight", bytes: CTRL_E },
        { key: "Cmd+ArrowRight", bytes: CTRL_A },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    // Both are still shown as the user wrote them; which one actually fires is what validation
    // reports, and is not this list's job to decide.
    expect(rows.map((r) => r.label)).toEqual(["^E", "^A"]);
  });

  it("keeps ids unique across a longer list", () => {
    const send = Array.from({ length: 6 }, () => ({ key: "Cmd+ArrowRight", bytes: CTRL_E }));
    expect(new Set(sendRows({ send }).map((r) => r.id)).size).toBe(6);
  });

  it("keeps the configured order", () => {
    const rows = sendRows({
      send: [
        { key: "Alt+b", bytes: `${ESC}b` },
        { key: "Alt+f", bytes: `${ESC}f` },
      ],
    });
    expect(rows.map((r) => r.key)).toEqual(["Alt+b", "Alt+f"]);
  });
});

// `Messages` is derived from `en`'s shape and `ja` is typed as it, so a MISSING key is already a
// type error. What the type cannot see is a key that exists and holds English — the half-translated
// ship this repo keeps meeting. These read the message objects directly: no mount, and the
// assertion is about the data rather than about a rendered row.
describe("every action's label", () => {
  const labelKeyOf = (action: string): string => {
    const row = keymapRows({}).find((r) => r.action === action);
    if (!row) throw new Error(`keymapRows dropped ${action}`);
    return row.labelKey;
  };

  // Resolves the dotted key against a message object without vue-i18n, so a path that names
  // nothing comes back undefined instead of rendering itself.
  const lookup = (messages: unknown, key: string): unknown =>
    key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);

  it.each(KEYMAP_ACTIONS)("%s is named in English", (action) => {
    const text = lookup(en, labelKeyOf(action));
    expect(typeof text).toBe("string");
    expect(String(text).length).toBeGreaterThan(0);
  });

  // The point of #1894: the list read as ten English rows next to a translated one.
  it.each(KEYMAP_ACTIONS)("%s is actually translated in Japanese, not English pasted in", (action) => {
    const jaText = String(lookup(ja, labelKeyOf(action)));
    const enText = String(lookup(en, labelKeyOf(action)));

    expect(jaText.length).toBeGreaterThan(0);
    expect(jaText).not.toBe(enText);
    // A label with no CJK character at all is English wearing a Japanese key.
    expect(jaText).toMatch(/[぀-ヿ一-鿿]/u);
  });
});
