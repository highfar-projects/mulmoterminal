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
          { slug: "books", title: "Books", kind: "collection" },
          { slug: "authors", title: "Authors", kind: "collection" },
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

  it("puts shared apps under their own heading, after the collections, and answers with the app's value", async () => {
    listSourceCollections.mockResolvedValueOnce({
      ok: true,
      value: {
        collections: [
          { slug: "app:f00d", title: "Council votes", kind: "app" },
          { slug: "books", title: "Books", kind: "collection" },
        ],
      },
    });
    const wrapper = pick();
    await flushPromises();
    const groups = wrapper.findAll("optgroup");
    expect(groups.map((group) => [group.attributes("label"), group.findAll("option").map((option) => option.text())])).toEqual([
      [en.blueprints.form.pickGroupCollections, ["Books (books)"]],
      [en.blueprints.form.pickGroupApps, ["Council votes"]],
    ]);
    await wrapper.get("select").setValue("app:f00d");
    expect(wrapper.emitted("update")).toEqual([["app:f00d"]]);
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
