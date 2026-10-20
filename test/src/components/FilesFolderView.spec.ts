// #3120: the folder shown in the Files pane's empty file area.
import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import FilesFolderView from "../../../src/components/FilesFolderView.vue";
import type { FolderGroup, FolderViewMode } from "../../../src/components/folderView";
import { filesTreeEn } from "../../../src/i18n/filesTree/en";

const i18n = createI18n({ legacy: false, locale: "en", messages: { en: filesTreeEn } });
const GROUPS: FolderGroup[] = [
  {
    dirRel: "shots",
    entries: [
      { name: "z.png", dir: false, size: 2048 },
      { name: "sub", dir: true, size: 0 },
      { name: "notes.txt", dir: false, size: 10 },
    ],
  },
  { dirRel: "shots/sub", entries: [{ name: "clip.mp4", dir: false, size: 1 }] },
];

const mountView = (props: { groups?: FolderGroup[] | null; mode?: FolderViewMode; dir?: string; error?: string | null } = {}) =>
  mount(FilesFolderView, {
    props: {
      cwd: "/proj",
      dir: props.dir ?? "shots",
      groups: props.groups === undefined ? GROUPS : props.groups,
      error: props.error ?? null,
      mode: props.mode ?? "list",
      withSubfolders: false,
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FilesFolderView", () => {
  it("lists folders first, sizes for files, and each subfolder under its heading", () => {
    const w = mountView();
    expect(w.findAll('[data-testid="files-folder-row"]').map((row) => row.attributes("data-path"))).toEqual([
      "shots/sub",
      "shots/notes.txt",
      "shots/z.png",
      "shots/sub/clip.mp4",
    ]);
    expect(w.findAll('[data-testid="files-folder-heading"]').map((h) => h.text())).toEqual(["sub/"]);
    expect(w.text()).toContain("2.0 KB");
  });

  it("shows a folder row's folder, and opens a file row, in a new tab on Cmd/Ctrl", async () => {
    const w = mountView();
    const row = (path: string) => w.get(`[data-testid="files-folder-row"][data-path="${path}"]`);
    await row("shots/sub").trigger("click");
    await row("shots/z.png").trigger("click");
    await row("shots/notes.txt").trigger("click", { metaKey: true });
    expect(w.emitted("show")).toEqual([["shots/sub"]]);
    expect(w.emitted("open")).toEqual([
      ["shots/z.png", false],
      ["shots/notes.txt", true],
    ]);
  });

  it("goes up a folder, and has no up button at the root", async () => {
    const w = mountView({ dir: "shots/sub" });
    await w.get('[data-testid="files-folder-up"]').trigger("click");
    expect(w.emitted("show")).toEqual([["shots"]]);
    expect(mountView({ dir: "" }).find('[data-testid="files-folder-up"]').exists()).toBe(false);
  });

  it("asks for the other mode and for subfolders", async () => {
    const w = mountView();
    expect(w.get('[data-testid="files-folder-mode-list"]').attributes("aria-pressed")).toBe("true");
    await w.get('[data-testid="files-folder-mode-gallery"]').trigger("click");
    await w.get('[data-testid="files-folder-subfolders"]').trigger("click");
    expect(w.emitted("mode")).toEqual([["gallery"]]);
    expect(w.emitted("subfolders")).toEqual([[true]]);
  });

  it("draws the gallery of every group's media, with the same controls and no close", () => {
    const w = mountView({ mode: "gallery" });
    expect(w.findAll('[data-testid="files-gallery-tile"]')).toHaveLength(2);
    expect(w.find('[data-testid="files-gallery-close"]').exists()).toBe(false);
    expect(w.find('[data-testid="files-folder-mode-list"]').exists()).toBe(true);
  });

  it("says when the folder is being read, is empty, or could not be read", () => {
    expect(mountView({ groups: null }).text()).toContain("Reading the folder");
    expect(
      mountView({ groups: [{ dirRel: "shots", entries: [] }] })
        .find('[data-testid="files-folder-empty"]')
        .exists(),
    ).toBe(true);
    expect(mountView({ groups: null, error: "shots: HTTP 404" }).get('[role="alert"]').text()).toBe("shots: HTTP 404");
  });
});
