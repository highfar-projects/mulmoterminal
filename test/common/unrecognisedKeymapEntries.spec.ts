import { describe, it, expect } from "vitest";
import { KEYMAP_ACTIONS, unrecognisedKeymapEntries } from "../../common/keymap";

// #2650. The entries a write must put back: named for an action this build does not know. Everything
// else in the keymap is this build's to write (or to drop, as a malformed binding is).
describe("unrecognisedKeymapEntries", () => {
  it("picks the entries named for an unknown action, whatever they hold", () => {
    const keymap = { "some-future-action": "Ctrl+j", "zoom-toogle": "F9", later: { nested: true }, "files-find": "F2" };
    expect(unrecognisedKeymapEntries(keymap)).toEqual({ "some-future-action": "Ctrl+j", "zoom-toogle": "F9", later: { nested: true } });
  });

  it("leaves out every action this build knows, and send", () => {
    const known = Object.fromEntries([...KEYMAP_ACTIONS.map((action) => [action, "not a key ++"]), ["send", "not a list"]]);
    expect(unrecognisedKeymapEntries(known)).toEqual({});
  });

  it.each([null, undefined, 42, "Ctrl+j", [["some-future-action", "Ctrl+j"]]])("has nothing to carry from %j", (input) => {
    expect(unrecognisedKeymapEntries(input)).toEqual({});
  });

  it("keeps a key named __proto__ as an entry", () => {
    const out = unrecognisedKeymapEntries(JSON.parse('{"__proto__":"Ctrl+j"}'));
    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});
