import { describe, it, expect } from "vitest";
import { forgeSectionOf } from "../../../src/components/forgeLinks";

const forge = (kind: string, webUrl: unknown) => ({ host: "h", kind, path: "p", webUrl });

describe("forgeSectionOf", () => {
  it("names GitHub and links its own pages", () => {
    expect(forgeSectionOf(forge("github", "https://github.com/o/r"))).toEqual({
      name: "GitHub",
      links: [
        { icon: "repo", label: "Repository", url: "https://github.com/o/r" },
        { icon: "issue-opened", label: "Issues", url: "https://github.com/o/r/issues" },
        { icon: "git-pull-request", label: "Pull requests", url: "https://github.com/o/r/pulls" },
        { icon: "play", label: "Actions", url: "https://github.com/o/r/actions" },
      ],
    });
  });

  // GitLab keeps its pages under `/-/` and calls them merge requests and pipelines.
  it("names GitLab, including a nested group, and links its own pages", () => {
    expect(forgeSectionOf(forge("gitlab", "https://gitlab.example.com/g/sub/proj"))).toEqual({
      name: "GitLab",
      links: [
        { icon: "repo", label: "Repository", url: "https://gitlab.example.com/g/sub/proj" },
        { icon: "issue-opened", label: "Issues", url: "https://gitlab.example.com/g/sub/proj/-/issues" },
        { icon: "git-pull-request", label: "Merge requests", url: "https://gitlab.example.com/g/sub/proj/-/merge_requests" },
        { icon: "play", label: "Pipelines", url: "https://gitlab.example.com/g/sub/proj/-/pipelines" },
      ],
    });
  });

  it("does not double a trailing slash", () => {
    expect(forgeSectionOf(forge("github", "https://github.com/o/r/"))?.links[1].url).toBe("https://github.com/o/r/issues");
  });

  it("shows nothing for no remote, an unknown host, or a malformed value", () => {
    for (const value of [
      null,
      undefined,
      "",
      42,
      [],
      {},
      forge("unknown", null),
      forge("unknown", "https://x.org/o/r"),
      forge("github", null),
      forge("github", 7),
    ]) {
      expect(forgeSectionOf(value)).toBeNull();
    }
  });

  // The URL becomes a window.open target, so only an https page is accepted.
  it("refuses a non-https page", () => {
    for (const webUrl of ["ssh://github.com/o/r", "javascript:alert(1)", "//github.com/o/r", "file:///etc/passwd"])
      expect(forgeSectionOf(forge("github", webUrl))).toBeNull();
  });

  it("does not treat inherited object keys as a forge kind", () => {
    for (const kind of ["constructor", "toString", "__proto__"]) expect(forgeSectionOf(forge(kind, "https://x.org/o/r"))).toBeNull();
  });
});
