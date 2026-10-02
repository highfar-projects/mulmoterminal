// The skills.sh mode of the Skills viewer (#2835): nothing is sent until Search, a hit already on disk
// says so, and a skill that brings files which run code says that before anyone installs it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SkillsShPane from "../../../src/components/SkillsShPane.vue";
import type { RemoteSkill, RemoteSkillDoc } from "../../../common/skillsSh";

const m = vi.hoisted(() => ({
  search: vi.fn<(query: string) => Promise<RemoteSkill[] | null>>(),
  load: vi.fn<(skill: Pick<RemoteSkill, "source" | "skillId">) => Promise<RemoteSkillDoc | null>>(),
}));
vi.mock("../../../src/composables/useSkillsShSearch", () => ({ searchRemoteSkills: m.search, loadRemoteSkill: m.load }));

const PDF: RemoteSkill = { source: "anthropics/skills", skillId: "pdf", name: "pdf", installs: 200 };
const DOCX: RemoteSkill = { source: "anthropics/skills", skillId: "docx", name: "docx", installs: 100 };

const mountPane = (localSlugs: string[] = []) => mount(SkillsShPane, { props: { localSlugs: new Set(localSlugs) } });

async function searchFor(w: ReturnType<typeof mountPane>, text: string): Promise<void> {
  await w.find('[data-testid="skills-sh-query"]').setValue(text);
  await w.find("form").trigger("submit");
  await flushPromises();
}

describe("SkillsShPane", () => {
  beforeEach(() => {
    m.search.mockReset().mockResolvedValue([PDF, DOCX]);
    m.load.mockReset().mockResolvedValue({ markdown: "---\nname: pdf\n---\nRead PDFs.", files: [{ path: "SKILL.md", bytes: 9 }] });
  });

  it("sends nothing while typing, only on Search", async () => {
    const w = mountPane();
    await w.find('[data-testid="skills-sh-query"]').setValue("pdf");
    expect(m.search).not.toHaveBeenCalled();
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(m.search).toHaveBeenCalledWith("pdf");
    expect(w.findAll('[data-testid="skills-sh-item"]')).toHaveLength(2);
  });

  it("marks a hit whose name is already on disk", async () => {
    const w = mountPane(["docx"]);
    await searchFor(w, "office");
    const badges = w.findAll('[data-testid="skills-sh-item"]').map((row) => row.find('[data-testid="skills-sh-installed"]').exists());
    expect(badges).toEqual([false, true]);
  });

  it("says when skills.sh could not be searched, with a way out", async () => {
    m.search.mockResolvedValue(null);
    const w = mountPane();
    await searchFor(w, "pdf");
    expect(w.find('[data-testid="skills-sh-error"] a').attributes("href")).toBe("https://skills.sh");
  });

  it("shows the SKILL.md without its frontmatter, and the install line to copy", async () => {
    const w = mountPane();
    await searchFor(w, "pdf");
    await w.find('[data-testid="skills-sh-item"]').trigger("click");
    await flushPromises();
    expect(m.load).toHaveBeenCalledWith(PDF);
    expect(w.text()).toContain("Read PDFs.");
    expect(w.text()).not.toContain("name: pdf");
    expect(w.find("code").text()).toBe("npx skills add anthropics/skills --skill pdf");
    expect(w.find('[data-testid="skills-sh-executables"]').exists()).toBe(false);
  });

  it("draws no image from the stranger's SKILL.md, so rendering it requests nothing", async () => {
    m.load.mockResolvedValue({ markdown: "![probe](/api/skills/remote/search?q=probe)", files: [{ path: "SKILL.md", bytes: 1 }] });
    const w = mountPane();
    await searchFor(w, "pdf");
    await w.find('[data-testid="skills-sh-item"]').trigger("click");
    await flushPromises();
    expect(w.find("section img").exists()).toBe(false);
    expect(w.find('section a[href="/api/skills/remote/search?q=probe"]').exists()).toBe(true);
  });

  it("lists the files that can run code before anything else", async () => {
    m.load.mockResolvedValue({
      markdown: "x",
      files: [
        { path: "SKILL.md", bytes: 1 },
        { path: "scripts/run.py", bytes: 1 },
        { path: "notes.md", bytes: 1 },
      ],
    });
    const w = mountPane();
    await searchFor(w, "pdf");
    await w.find('[data-testid="skills-sh-item"]').trigger("click");
    await flushPromises();
    expect(
      w
        .find('[data-testid="skills-sh-executables"]')
        .findAll("li")
        .map((li) => li.text()),
    ).toEqual(["scripts/run.py"]);
  });

  it("copies the install line rather than running anything", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const w = mountPane();
    await searchFor(w, "pdf");
    await w.find('[data-testid="skills-sh-item"]').trigger("click");
    await flushPromises();
    await w.find('[data-testid="skills-sh-copy"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith("npx skills add anthropics/skills --skill pdf");
  });
});
