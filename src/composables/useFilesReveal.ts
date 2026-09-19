// "Show me this file": open a path AND put the tree on it, plus the finder panel that is one way
// of asking for that. Lifted out of FilesPane.vue with the tree (#2169) and the open file (#2174)
// before it; the panel's markup stays in the pane, as theirs did.
//
// The two halves are here together because the finder has no other purpose: picking in it is a
// reveal, and the panel closes because the reveal is starting. Splitting them would leave two
// files whose only content is each other's call.
import { nextTick, ref, type Ref, type ShallowRef } from "vue";
import { ancestorDirs } from "../components/filesTreeState";
import type { FilesTree } from "./useFilesTree";

export interface FilesRevealDeps {
  tree: FilesTree;
  /** The pane's template ref for the scrolling tree container — this does not render it. */
  treeEl: Readonly<ShallowRef<HTMLElement | null>>;
  /** The pane's current startup, as a GETTER: `reload()` replaces the promise, and a reveal that
   *  captured the old one would wait for a tree that is no longer being built. */
  started: () => Promise<void>;
  /** Open the file itself — the other half of "reveal", which this does not own. */
  open: (pathRel: string) => Promise<void>;
  /** What the editor is REALLY showing, which is not always what was asked for. */
  openPath: Ref<string | null>;
}

export interface FilesReveal {
  finderOpen: Ref<boolean>;
  closeFinder: () => void;
  onFinderPick: (pathRel: string) => void;
  /** Open `pathRel` and scroll the tree to it. Returns whether the editor ended up on it. */
  revealPath: (pathRel: string) => Promise<boolean>;
  /** The pane is re-rooting: a reveal in flight must not scroll the new tree to a row from the
   *  project it just left, and the panel must not go on offering the old project's paths. */
  reset: () => void;
}

/** The tree row for a path. Found by walking the rendered rows rather than with an attribute
 *  selector: a path holds `"` and `\` as readily as any other character, and one would break a
 *  selector built by concatenation. Exported because that is the whole point of it and a mounted
 *  pane cannot easily be given a file named `a"b`. */
export function rowElementFor(treeEl: HTMLElement | null, pathRel: string): HTMLElement | undefined {
  return [...(treeEl?.querySelectorAll<HTMLElement>("[data-path]") ?? [])].find((el) => el.dataset.path === pathRel);
}

export function useFilesReveal(deps: FilesRevealDeps): FilesReveal {
  // "Open by name" (#2099). Its own state rather than a route or a prop: the finder belongs to
  // whichever pane the user is in, and BOTH mounts of the pane have one — the pane beside a zoomed
  // cell, where a keymap action opens it, and the full-screen view, where the button is the way in.
  const finderOpen = ref(false);
  const closeFinder = (): void => {
    finderOpen.value = false;
  };

  // Which reveal is the current one. A reveal spends most of its time FETCHING — one request per
  // ancestor directory — so a second pick can overtake the first and finish before it. A read takes
  // the newest generation as it goes, so the loser landing second would replace the file the user
  // actually chose with the one they abandoned (CodeRabbit on #2102). Bumped by the pane's teardown
  // too: a re-rooted pane must not be scrolled to a row from the project it just left.
  let revealId = 0;

  /** Open `pathRel` and put the tree on it. The ancestors are expanded OUTERMOST FIRST because each
   *  expansion fetches that directory's children — a child cannot be opened before its parent has
   *  been (the rule `restoreOrder` exists for). */
  async function revealPath(pathRel: string): Promise<boolean> {
    const id = ++revealId;
    await deps.started(); // the tree may still be loading — expanding into an unread `roots` finds nothing
    if (id !== revealId) return false;
    for (const dirPath of ancestorDirs(pathRel)) {
      const node = deps.tree.findNode(dirPath);
      if (node?.dir && !node.expanded) await deps.tree.toggleDir(node);
      if (id !== revealId) return false; // a later pick took over while this one was fetching
    }
    await deps.open(pathRel);
    await nextTick(); // the row only exists once the expansions above have rendered
    if (id !== revealId) return false;
    rowElementFor(deps.treeEl.value, pathRel)?.scrollIntoView({ block: "nearest" });
    // Whether the editor is REALLY showing what was asked for. `open` returns nothing and has
    // several ways to end without opening anything — the file is gone, the fetch failed, or it
    // declined to leave a dirty buffer that could not be saved — and in each the editor keeps the
    // previous document. A caller that goes on to scroll to a line number needs to know that, or it
    // scrolls an unrelated file to an arbitrary place while looking deliberate.
    return deps.openPath.value === pathRel;
  }

  // Picking is "show me this file", not only "open it": the tree is how the user goes on to its
  // neighbours, and a file opened with the tree still collapsed leaves them where they started.
  function onFinderPick(pathRel: string): void {
    closeFinder();
    void revealPath(pathRel);
  }

  return {
    finderOpen,
    closeFinder,
    onFinderPick,
    revealPath,
    reset: () => {
      revealId += 1;
      closeFinder();
    },
  };
}
