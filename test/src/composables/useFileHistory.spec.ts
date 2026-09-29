import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick, ref, shallowRef } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useFileHeadText } from "../../../src/composables/useFileHeadText";
import { backupTextFrom, useFileHistory } from "../../../src/composables/useFileHistory";
import { backupEntriesFrom } from "../../../common/fileBackups";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import type { CmEditor } from "../../../src/components/cmEditor";

// #2574. A file's history: listed from the backup store, compared through the change marks, and
// restored as an edit.
const BACKUPS = [
  { id: "000000000002000-002-a.ts.bak", at: 2000, bytes: 3 },
  { id: "000000000001000-001-a.ts.bak", at: 1000, bytes: 3 },
];
const [NEWER, OLDER] = BACKUPS as [(typeof BACKUPS)[number], (typeof BACKUPS)[number]];
const TEXTS: Record<string, string> = { [NEWER.id]: "two", [OLDER.id]: "one" };

function serve(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    if (url.pathname.endsWith("/head")) return { ok: true, json: async () => ({ text: "head" }) };
    if (url.pathname.endsWith("/backups")) return { ok: true, json: async () => ({ backups: BACKUPS }) };
    const text = TEXTS[url.searchParams.get("id") ?? ""];
    return text === undefined ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, json: async () => ({ text }) };
  }) as unknown as typeof fetch;
}

/** The usual answers, with `override` consulted first for requests it wants to answer itself. */
function serveWith(override: (init?: RequestInit) => { ok: boolean; status: number; json: () => Promise<unknown> } | null): typeof fetch {
  serve();
  const usual = globalThis.fetch;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => override(init) ?? usual(input, init)) as unknown as typeof fetch;
}

function setup() {
  const editor = fakeCmEditor("now");
  const openPath = ref<string | null>("a.ts");
  const editorRef = shallowRef<CmEditor | null>(editor);
  const head = useFileHeadText({ cwd: () => "/proj", openPath, unpreviewable: ref(null), editor: editorRef });
  const showChanges = ref(false);
  const dirty = ref(false);
  const saving = ref(false);
  const history = useFileHistory({ cwd: () => "/proj", openPath, editor: editorRef, head, showChanges, dirty, saving });
  return { editor, openPath, head, showChanges, dirty, saving, history };
}

describe("useFileHistory", () => {
  beforeEach(serve);

  it("lists the backups when opened", async () => {
    const { history } = setup();
    await history.toggle();
    expect(history.open.value).toBe(true);
    expect(history.entries.value.map((entry) => entry.at)).toEqual([2000, 1000]);
  });

  it("compares with a backup: the marks move off HEAD and the removed lines show", async () => {
    const { editor, head, showChanges, history } = setup();
    await history.compare(OLDER);
    expect(editor.setOriginal).toHaveBeenLastCalledWith("one");
    expect(head.comparingAt.value).toBe(1000);
    expect(history.comparing.value?.entry.at).toBe(1000);
    expect(showChanges.value).toBe(true);
    // HEAD is not read over the backup while it is being compared.
    await head.refresh();
    expect(editor.setOriginal).toHaveBeenLastCalledWith("one");
  });

  it("stops comparing: back to HEAD's marks", async () => {
    const { editor, head, history } = setup();
    await history.compare(NEWER);
    await head.stopComparing();
    await nextTick();
    expect(editor.setOriginal).toHaveBeenLastCalledWith("head");
    expect(history.comparing.value).toBeNull();
  });

  it("restores a backup as an edit and stops comparing", async () => {
    const { editor, head, history } = setup();
    await history.compare(NEWER);
    await history.restore(OLDER);
    expect(editor.replaceDoc).toHaveBeenCalledWith("one");
    expect(editor.setDoc).not.toHaveBeenCalled();
    expect(head.comparingAt.value).toBeNull();
  });

  it("forgets the comparison and the list when another file opens", async () => {
    const { openPath, head, history } = setup();
    await history.toggle();
    await history.compare(NEWER);
    openPath.value = "b.ts";
    await flushPromises();
    expect(head.comparingAt.value).toBeNull();
    expect(history.comparing.value).toBeNull();
    expect(history.entries.value).toEqual([]);
  });

  it("says so when a backup cannot be read, and changes nothing", async () => {
    const { editor, history } = setup();
    await history.restore({ id: "gone.bak", at: 1, bytes: 1 });
    expect(history.restoreFailed.value).toBe(true);
    expect(editor.replaceDoc).not.toHaveBeenCalled();
  });
});

describe("useFileHistory, what restoring must not lose", () => {
  beforeEach(serve);

  // The version compared against can be rotated out of the store while an agent keeps rewriting the
  // file; its text was read to draw the marks, and Restore uses that.
  it("restores the compared version from memory, even once the store has lost it", async () => {
    const { editor, history } = setup();
    await history.compare(OLDER);
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    await history.restore(OLDER);
    expect(editor.replaceDoc).toHaveBeenCalledWith("one");
  });

  it("banks unsaved edits before replacing them, and changes nothing if that fails", async () => {
    const { editor, dirty, history } = setup();
    dirty.value = true;
    const puts: string[] = [];
    const answer = serveWith((init) => {
      if (init?.method === "PUT") {
        puts.push(String(init.body));
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return null;
    });
    globalThis.fetch = answer;
    await history.restore(OLDER);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toContain("now");
    expect(editor.replaceDoc).not.toHaveBeenCalled();
    expect(history.restoreFailed.value).toBe(true);
  });

  // The bank is a round trip. Whatever changed meanwhile — another file in the same editor, a save
  // starting — the restored text must not land.
  it("does not restore into another file opened while the unsaved edits were being banked", async () => {
    const { editor, dirty, openPath, history } = setup();
    dirty.value = true;
    globalThis.fetch = serveWith((init) => {
      if (init?.method !== "PUT") return null;
      openPath.value = "b.ts";
      return { ok: true, status: 200, json: async () => ({ stored: true }) };
    });
    await history.restore(OLDER);
    expect(editor.replaceDoc).not.toHaveBeenCalled();
  });

  it("treats a bank the disk refused as a failure", async () => {
    const { editor, dirty, history } = setup();
    dirty.value = true;
    globalThis.fetch = serveWith((init) => (init?.method === "PUT" ? { ok: true, status: 200, json: async () => ({ stored: false }) } : null));
    await history.restore(OLDER);
    expect(editor.replaceDoc).not.toHaveBeenCalled();
    expect(history.restoreFailed.value).toBe(true);
  });

  it("lands when the bank holds the unsaved edits", async () => {
    const { editor, dirty, history } = setup();
    dirty.value = true;
    globalThis.fetch = serveWith((init) => (init?.method === "PUT" ? { ok: true, status: 200, json: async () => ({ stored: true }) } : null));
    await history.restore(OLDER);
    expect(editor.replaceDoc).toHaveBeenCalledWith("one");
    expect(history.restoreFailed.value).toBe(false);
  });

  // A backup taken from disk keeps CRLF; the editor reads it as LF. Equal is equal.
  it("leaves a buffer alone that differs from the version only in its line endings", async () => {
    const { editor, history } = setup();
    editor.getDoc.mockReturnValue("one");
    TEXTS[OLDER.id] = "one";
    await history.restore({ ...OLDER, id: "crlf" });
    TEXTS.crlf = "one\r\n";
    editor.getDoc.mockReturnValue("one\n");
    await history.restore({ ...OLDER, id: "crlf" });
    expect(editor.replaceDoc).not.toHaveBeenCalled();
  });

  // The banner shows this flag; a list that failed to load is the menu's business, not a restore.
  it("keeps a failed list apart from a failed restore", async () => {
    const { history } = setup();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    await history.toggle();
    expect(history.failed.value).toBe(true);
    expect(history.restoreFailed.value).toBe(false);
  });

  it("does not restore while a save is in flight", async () => {
    const { editor, saving, history } = setup();
    saving.value = true;
    await history.restore(OLDER);
    expect(editor.replaceDoc).not.toHaveBeenCalled();
    expect(history.restoreFailed.value).toBe(true);
  });

  it("does nothing to a buffer that already holds that text", async () => {
    const { editor, history } = setup();
    editor.getDoc.mockReturnValue("one");
    await history.restore(OLDER);
    expect(editor.replaceDoc).not.toHaveBeenCalled();
  });

  it("puts the Changes switch back when comparing ends, and gives the keyboard to the editor", async () => {
    const { editor, head, showChanges, history } = setup();
    await history.compare(NEWER);
    expect(showChanges.value).toBe(true);
    expect(editor.focus).toHaveBeenCalled();
    await head.stopComparing();
    await nextTick();
    expect(showChanges.value).toBe(false);
  });
});

describe("the wire readers", () => {
  it("reads a list of entries and nothing else", () => {
    expect(backupEntriesFrom({ backups: BACKUPS })).toEqual(BACKUPS);
    expect(backupEntriesFrom({ backups: [{ id: "x", at: "1", bytes: 1 }] })).toBeNull();
    expect(backupEntriesFrom({})).toBeNull();
    expect(backupEntriesFrom(null)).toBeNull();
  });

  it("reads a backup's text", () => {
    expect(backupTextFrom({ text: "a" })).toBe("a");
    expect(backupTextFrom({ text: 1 })).toBeNull();
  });
});
