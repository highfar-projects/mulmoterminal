import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, nextTick, ref, shallowRef } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useFilesPaneGit, type PaneGitFile } from "../../../src/composables/useFilesPaneGit";

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ entries: [], repo: true, files: {}, text: null }) })) as unknown as typeof fetch;
});

function paneGit() {
  const file: PaneGitFile = {
    openPath: ref<string | null>("a.md"),
    unpreviewable: ref<string | null>(null),
    dirty: ref(false),
    saving: ref(false),
    showPreview: ref(false),
    baseVersion: ref<string | null>("v1"),
    editor: shallowRef(null),
  };
  const scope = effectScope();
  const git = scope.run(() => useFilesPaneGit(() => "/proj", file));
  if (!git) throw new Error("no scope");
  return { file, git, scope };
}

describe("useFilesPaneGit", () => {
  it("puts the History menu away when the pane turns to Preview", async () => {
    const { file, git, scope } = paneGit();
    await git.history.toggle();
    expect(git.history.open.value).toBe(true);
    file.showPreview.value = true;
    await nextTick();
    expect(git.history.open.value).toBe(false);
    scope.stop();
  });

  it("reads git again when the open file's version moves", async () => {
    const { file, scope } = paneGit();
    await flushPromises();
    const gitReads = () => vi.mocked(globalThis.fetch).mock.calls.filter((c) => String(c[0]).includes("git-status"));
    const before = gitReads().length;
    file.baseVersion.value = "v2";
    await flushPromises();
    expect(gitReads()).toHaveLength(before + 1);
    scope.stop();
  });
});
