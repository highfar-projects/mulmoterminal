// The Keyboard shortcuts section is read-only, so the only thing it can get wrong is what it
// FAILS to say — and it failed silently for `keymap.send`.
//
// #1858: someone on macOS whose Cmd+ArrowLeft did nothing opened this section, saw every action
// marked "Not set", and found no mention anywhere that keys can be sent to the terminal at all.
// They cloned the repository and read the source to discover the feature existed. An action
// renders a row whether or not it is bound; `send` rendered rows only for entries that existed,
// so with none configured the whole mechanism was absent from the one screen meant to show what
// is configurable.
//
// So these assertions are about the EMPTY state, which is the state every user starts in.
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import KeyboardShortcutsSection from "../../../../src/components/settings/KeyboardShortcutsSection.vue";
import { setActiveKeymap } from "../../../../src/composables/activeKeymap";
import { i18n } from "../../../../src/i18n";
import { KEYMAP_ACTIONS, type Keymap } from "../../../../common/keymap";

// Spelled as escapes and named, the way test/common/keymapSend.spec.ts and
// test/src/components/keymapLabels.spec.ts already do: a raw C0 byte in the source is invisible
// in a diff, a review and a grep.
const CTRL_A = "\u0001";
const CTRL_E = "\u0005";

const sectionWith = (keymap: Keymap) => {
  setActiveKeymap(keymap);
  return mount(KeyboardShortcutsSection);
};

describe("the keyboard shortcuts section, with nothing bound", () => {
  it("names the send mechanism even though no send binding exists", () => {
    const w = sectionWith({});

    expect(w.find('[data-testid="send-none"]').exists()).toBe(true);
    // The row, not the wording — the words belong to i18n. Its ABSENCE is #1858.
    expect(w.get('[data-testid="send-none"]').text()).toContain("Send keys to the terminal");
  });

  it("marks it Not set, in the same grammar as the actions above it", () => {
    const w = sectionWith({});

    const row = w.get('[data-testid="send-none"]').text();
    expect(row).toContain("Not set");
    // The config key, so a reader can find it in the guide and in their own config file.
    expect(row).toContain("send");
  });

  // Derived, not counted. Written as `9 + 1` this went red the moment main added a tenth action
  // (`terminal-new-here`, #1867) — a spec about the SEND row failing for a reason that has nothing
  // to do with send. What it means to pin is that the placeholder is an ADDITION.
  it("still lists every action, so the empty send row is an addition and not a replacement", () => {
    const w = sectionWith({});

    expect(w.findAll('[role="listitem"]')).toHaveLength(KEYMAP_ACTIONS.length + 1);
  });

  // The intro is what sent the reporter to a text editor: it named the config file and the guide,
  // and never the skill-launch button directly beneath it. The route out of this screen has to be
  // the button, which is the thing that checks a proposed binding against the keymap already
  // configured and the traps a browser or a Mac adds. (It cannot see what the shell, vim or claude
  // binds — nothing here can, and saying otherwise was itself a finding in this PR.)
  it("points at the button rather than at hand-editing the config file", () => {
    const text = sectionWith({}).text();

    expect(text).not.toContain("~/.mulmoterminal/config.json");
    expect(text).toContain("button below");
  });
});

describe("the keyboard shortcuts section, with send bindings", () => {
  // The exact pair #1858 asked for: Ctrl+A and Ctrl+E, reached from the keys a Mac keyboard has.
  const MAC_LINE_EDITING = [
    { key: "Cmd+ArrowLeft", bytes: CTRL_A },
    { key: "Cmd+ArrowRight", bytes: CTRL_E },
  ];
  const macLineEditing: Keymap = { send: MAC_LINE_EDITING };

  // The assertions below check the DISPLAY, and `describeBytes` leaves printable text alone — so
  // `bytes: "^A"` would render "^A" as well and every assertion here would still pass while the
  // file had stopped testing control bytes at all. Pinning the fixture is what makes the caret
  // assertions mean something.
  //
  // Worth spelling out because the CI reviewer read those caret assertions as the fixture four
  // separate times. It was wrong about the source each time, and right that nothing proved it.
  it("uses the real control bytes, not their caret spelling", () => {
    expect(CTRL_A.codePointAt(0)).toBe(1);
    expect(CTRL_E.codePointAt(0)).toBe(5);
    expect(CTRL_A).toHaveLength(1);
    expect(CTRL_E).toHaveLength(1);
  });

  it("shows the real bindings instead of the placeholder", () => {
    const w = sectionWith(macLineEditing);

    expect(w.find('[data-testid="send-none"]').exists()).toBe(false);
    const text = w.text();
    expect(text).toContain("Cmd+ArrowLeft");
    expect(text).toContain("^A");
    expect(text).toContain("Cmd+ArrowRight");
    expect(text).toContain("^E");
  });

  it("keeps the placeholder out of the count, so the rows are every action plus each entry", () => {
    expect(sectionWith(macLineEditing).findAll('[role="listitem"]')).toHaveLength(KEYMAP_ACTIONS.length + MAC_LINE_EDITING.length);
  });
});

// A locale missing a key renders the key PATH and throws nothing — the same silent failure this
// whole change is about, one layer down. The setup file re-pins the locale to English before every
// test, so switching here cannot leak into the next one.
describe("in Japanese", () => {
  it("translates the send placeholder rather than printing its key path", () => {
    i18n.global.locale.value = "ja";

    const row = sectionWith({}).get('[data-testid="send-none"]').text();
    expect(row).not.toContain("settings.shortcuts");
    expect(row).toContain("ターミナル");
    expect(row).toContain("未設定");
  });

  // The English intro is pinned above; without this the Japanese one could be reverted to the
  // config-file wording with every test still green — half a fix shipping as a whole one, which is
  // the shape of the bug this PR is about.
  it("points a Japanese reader at the button too, not at the config file", () => {
    i18n.global.locale.value = "ja";

    const text = sectionWith({}).text();
    expect(text).not.toContain("~/.mulmoterminal/config.json");
    expect(text).toContain("下のボタン");
  });
});
