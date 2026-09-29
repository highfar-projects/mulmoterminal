import { describe, it, expect } from "vitest";
import { cellForPaletteResume, paletteResumes } from "../../../src/composables/paletteResumes";
import { cellForPanelResume } from "../../../src/components/launchCell";
import type { ResumableList } from "../../../src/composables/useDirLists";

const LIST: ResumableList = {
  cwd: "/w/app",
  sessions: [
    { id: "a", title: "Fix login", mtime: 3 },
    { id: "b", title: "Held elsewhere", mtime: 2, attached: true },
    { id: "c", title: "Open here", mtime: 1 },
    { id: "d", title: "Running under a minted key", mtime: 0, runningKey: "k-d", account: "work" },
    { id: "e", title: "Open under its running key", mtime: 0, runningKey: "k-e" },
  ],
};

describe("paletteResumes", () => {
  it("offers what nobody holds, and nothing already open in this grid by either id", () => {
    expect(paletteResumes(LIST, ["c", "k-e"]).map((resume) => resume.title)).toEqual(["Fix login", "Running under a minted key"]);
  });

  it("resumes a running session by the key it runs under, in the directory the list was read for", () => {
    const [, running] = paletteResumes(LIST, []).filter((resume) => resume.title.startsWith("Running") || resume.title === "Fix login");
    expect(running).toEqual({ id: "k-d", title: "Running under a minted key", mtime: 0, cwd: "/w/app", account: "work" });
  });

  it("has no rows for an empty list", () => {
    expect(paletteResumes({ cwd: null, sessions: [] }, [])).toEqual([]);
  });
});

describe("cellForPaletteResume", () => {
  it("builds the cell the launch panel's resume row builds", () => {
    const resume = { id: "k-d", title: "t", mtime: 0, cwd: "/w/app", account: "work" };
    expect(cellForPaletteResume(resume, "codex")).toEqual(cellForPanelResume({ id: "k-d", cwd: "/w/app", agent: "codex", account: "work" }));
    expect(cellForPaletteResume({ ...resume, account: null }, "claude")).toEqual(
      cellForPanelResume({ id: "k-d", cwd: "/w/app", agent: "claude", account: null }),
    );
  });
});
