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

function setup() {
  const editor = fakeCmEditor("now");
  const openPath = ref<string | null>("a.ts");
  const editorRef = shallowRef<CmEditor | null>(editor);
  const head = useFileHeadText({ cwd: () => "/proj", openPath, unpreviewable: ref(null), editor: editorRef });
  const showChanges = ref(false);
  const history = useFileHistory({ cwd: () => "/proj", openPath, editor: editorRef, head, showChanges });
  return { editor, openPath, head, showChanges, history };
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
    expect(history.comparing.value?.at).toBe(1000);
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
    expect(history.failed.value).toBe(true);
    expect(editor.replaceDoc).not.toHaveBeenCalled();
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
