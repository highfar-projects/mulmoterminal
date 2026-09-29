// Picking the collection a build starts from: the choices are the ones the server offers, a choice becomes the answer,
// and an empty workspace says so rather than showing an empty list.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { listSourceCollections } = vi.hoisted(() => ({ listSourceCollections: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", () => ({ listSourceCollections }));

import BlueprintCollectionPicker from "../../../../src/components/blueprints/BlueprintCollectionPicker.vue";
import { en } from "../../../../src/i18n/en";

const pick = (answer = "") => mount(BlueprintCollectionPicker, { props: { fieldId: "blueprint-q-source", answer } });

describe("picking the source collection", () => {
  beforeEach(() => {
    listSourceCollections.mockReset();
    listSourceCollections.mockResolvedValue({
      ok: true,
      value: {
        collections: [
          { slug: "books", title: "Books" },
          { slug: "authors", title: "Authors" },
        ],
      },
    });
  });

  it("offers the server's collections by title and slug, and answers with the slug", async () => {
    const wrapper = pick();
    await flushPromises();
    const options = wrapper.findAll("option");
    expect(options.map((option) => [option.attributes("value"), option.text()])).toEqual([
      ["", en.blueprints.form.pickCollection],
      ["books", "Books (books)"],
      ["authors", "Authors (authors)"],
    ]);
    await wrapper.get("select").setValue("authors");
    expect(wrapper.emitted("update")).toEqual([["authors"]]);
  });

  it("keeps the answer it was given selected", async () => {
    const wrapper = pick("books");
    await flushPromises();
    expect(wrapper.get<HTMLSelectElement>("select").element.value).toBe("books");
  });

  it("says so when the workspace has no collections", async () => {
    listSourceCollections.mockResolvedValueOnce({ ok: true, value: { collections: [] } });
    const wrapper = pick();
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-collection-none"]').text()).toBe(en.blueprints.form.pickCollectionNone);
  });

  it("shows why the list could not be read", async () => {
    listSourceCollections.mockResolvedValueOnce({ ok: false, error: "the server is down" });
    const wrapper = pick();
    await flushPromises();
    expect(wrapper.text()).toContain("the server is down");
    expect(wrapper.find('[data-testid="blueprint-collection-none"]').exists()).toBe(false);
  });
});
