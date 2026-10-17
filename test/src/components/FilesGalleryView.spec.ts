// #3079: what a folder's gallery draws, and how it is moved through.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import FilesGallery from "../../../src/components/FilesGallery.vue";
import { GALLERY_PAGE_SIZE, type GalleryItem } from "../../../src/components/filesGallery";
import { filesTreeEn } from "../../../src/i18n/filesTree/en";

const i18n = createI18n({ legacy: false, locale: "en", messages: { en: filesTreeEn } });
const item = (name: string, kind: GalleryItem["kind"]): GalleryItem => ({ pathRel: `shots/${name}`, name, kind });
const ITEMS = [item("a.png", "image"), item("b.mp4", "video"), item("c.mp3", "audio"), item("d.pdf", "pdf"), item("e.webm", "video")];

const mountGallery = (items: GalleryItem[] | null = ITEMS, error: string | null = null) =>
  mount(FilesGallery, { props: { cwd: "/proj", dir: "shots", items, error }, global: { plugins: [i18n] }, attachTo: document.body });

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("FilesGallery", () => {
  it("draws every kind in its own way, from the raw route under the pane's root", () => {
    const w = mountGallery();
    expect(w.findAll('[data-testid="files-gallery-tile"]')).toHaveLength(ITEMS.length);
    expect(w.find("img").attributes("src")).toBe("/api/files/raw?cwd=%2Fproj&path=shots%2Fa.png");
    expect(w.findAll("video")).toHaveLength(2);
    expect(w.find("video").attributes()).toHaveProperty("controls");
    expect(w.findAll("audio")).toHaveLength(1);
    expect(w.text()).toContain("picture_as_pdf");
  });

  it("says when the folder is being read, is empty, or could not be read", () => {
    expect(mountGallery(null).text()).toContain("Reading the folder");
    expect(mountGallery([]).find('[data-testid="files-gallery-empty"]').exists()).toBe(true);
    expect(mountGallery(null, "shots: HTTP 404").find('[role="alert"]').text()).toBe("shots: HTTP 404");
  });

  it("draws one page of tiles, and the rest on asking", async () => {
    const many = Array.from({ length: GALLERY_PAGE_SIZE + 3 }, (_, index) => item(`${index}.png`, "image"));
    const w = mountGallery(many);
    expect(w.findAll('[data-testid="files-gallery-tile"]')).toHaveLength(GALLERY_PAGE_SIZE);
    expect(w.get('[data-testid="files-gallery-more"]').text()).toContain("3");
    await w.get('[data-testid="files-gallery-more"]').trigger("click");
    expect(w.findAll('[data-testid="files-gallery-tile"]')).toHaveLength(GALLERY_PAGE_SIZE + 3);
    expect(w.find('[data-testid="files-gallery-more"]').exists()).toBe(false);
  });

  it("shows a tile large, steps with the arrows round the ends, and goes back with Esc", async () => {
    const w = mountGallery();
    await w.findAll('[data-testid="files-gallery-tile"]')[0]?.find("button").trigger("click");
    const large = () => w.find('[data-testid="files-gallery-large"]');
    expect(large().find("img").attributes("alt")).toBe("a.png");
    await w.get('[data-testid="files-gallery"]').trigger("keydown", { key: "ArrowLeft" });
    expect(large().find("video").attributes("src")).toContain("e.webm");
    await w.get('[data-testid="files-gallery-next"]').trigger("click");
    expect(large().find("img").attributes("alt")).toBe("a.png");
    await w.get('[data-testid="files-gallery"]').trigger("keydown", { key: "Escape" });
    expect(large().exists()).toBe(false);
    expect(w.emitted("close")).toBeUndefined();
    await w.get('[data-testid="files-gallery"]').trigger("keydown", { key: "Escape" });
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("lets one tile play at a time", () => {
    const paused: HTMLMediaElement[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      paused.push(this);
    });
    const w = mountGallery();
    const [first] = w.findAll("video");
    first?.element.dispatchEvent(new Event("play"));
    const others = [...w.findAll("video"), ...w.findAll("audio")].map((media) => media.element).filter((media) => media !== first?.element);
    expect(paused).toEqual(expect.arrayContaining(others));
    expect(paused).not.toContain(first?.element);
  });

  it("closes from its button", async () => {
    const w = mountGallery();
    await w.get('[data-testid="files-gallery-close"]').trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  // The button pressed to go back is gone once the grid is back; the keyboard must not go with it.
  it("keeps the keyboard in the gallery going back from the large view by its button", async () => {
    const w = mountGallery();
    await w.findAll('[data-testid="files-gallery-tile"]')[0]?.find("button").trigger("click");
    const back = w.get<HTMLButtonElement>('[data-testid="files-gallery-back"]');
    back.element.focus(); // pressed by keyboard, as a real press leaves it
    await back.trigger("click");
    await w.vm.$nextTick();
    expect(document.activeElement).toBe(w.get('[data-testid="files-gallery"]').element);
  });
});
