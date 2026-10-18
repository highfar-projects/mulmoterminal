import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FilesUnpreviewable from "../../../src/components/FilesUnpreviewable.vue";

const view = (kind: "image" | "pdf" | null) => mount(FilesUnpreviewable, { props: { kind, src: "/raw/x", name: "x", message: "Binary file" } });

describe("FilesUnpreviewable", () => {
  it("asks for the file to be opened in the OS", async () => {
    const w = view(null);
    await w.find('[data-testid="files-open-in-os"]').trigger("click");
    expect(w.emitted("open-in-os")).toHaveLength(1);
  });

  it("names a file it cannot draw, and draws one it can instead", () => {
    expect(view(null).text()).toContain("Binary file");
    expect(view("image").text()).not.toContain("Binary file");
  });

  it("gives a PDF the whole area and centres everything else", () => {
    expect(view("pdf").classes()).toContain("flex-auto");
    expect(view("image").classes()).toContain("m-auto");
  });
});
