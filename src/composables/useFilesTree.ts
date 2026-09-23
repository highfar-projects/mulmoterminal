// The Files pane's directory tree: what has been read, what is expanded, and what is on screen.
// Lifted out of FilesPane.vue, which sits at the repo's file-length limit and had two more features
// queued behind it (#2158). The pane keeps the markup — this is the half that fetches and decides.
//
// It owns three pieces of state that only make sense together: the forest (`null` until a listing
// comes back, because an empty ARRAY has to mean "the directory is empty"), the error that replaces
// it, and the request generation that decides which answer is still wanted.
import { computed, ref, type ComputedRef, type Ref } from "vue";
import { cacheListing, cachedListingFor, type ListingEntry } from "../components/filesTreeCache";
import { browseQuery } from "../components/filesPaneApi";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export interface TreeNode {
  name: string;
  path: string; // relative to the project root
  dir: boolean;
  size: number;
  expanded: boolean;
  loaded: boolean;
  children: TreeNode[];
}

/** One visible row: a node and how deep it sits, so the template renders a flat list rather than a
 *  recursive component. */
export interface TreeRow {
  node: TreeNode;
  depth: number;
}

// The listing arrives off the wire, so an entry is checked before it becomes one — the tree renders
// `name` and branches on `dir`, and a malformed entry would render as blank rather than as absent.
const isListingEntry = (value: unknown): value is ListingEntry =>
  isRecord(value) && typeof value.name === "string" && typeof value.dir === "boolean" && typeof value.size === "number";

const makeNode = (entry: ListingEntry, parentPath: string): TreeNode => ({
  name: entry.name,
  path: parentPath ? `${parentPath}/${entry.name}` : entry.name,
  dir: entry.dir,
  size: entry.size,
  expanded: false,
  loaded: false,
  children: [],
});

/** Depth-first flatten of the visible rows, descending only into expanded directories. */
export function flattenRows(nodes: TreeNode[]): TreeRow[] {
  const out: TreeRow[] = [];
  const walk = (level: TreeNode[], depth: number) => {
    for (const node of level) {
      out.push({ node, depth });
      if (node.dir && node.expanded) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

/** The node at `target`, anywhere in the forest. */
export function findIn(nodes: TreeNode[], target: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === target) return node;
    const hit = findIn(node.children, target);
    if (hit) return hit;
  }
  return null;
}

/** A fresh listing as nodes, carrying over any directory that was EXPANDED AND LOADED in `before`.
 *  Without that, a tree painted from the cache collapses under the user a round trip after they
 *  clicked it — which is exactly the window the cache exists to fill. What is carried is REAL:
 *  those children were fetched, whatever painted the parent. */
export function adoptListing(before: TreeNode[] | null, entries: ListingEntry[]): TreeNode[] {
  const open = new Map((before ?? []).filter((node) => node.loaded).map((node) => [node.path, node]));
  return entries.map((entry) => {
    const node = makeNode(entry, "");
    const was = open.get(node.path);
    if (was?.dir && node.dir) Object.assign(node, { children: was.children, loaded: true, expanded: was.expanded });
    return node;
  });
}

/** One directory's listing, off the wire. */
async function fetchListing(cwd: string | null, pathRel: string): Promise<ListingEntry[]> {
  const res = await fetchWithTimeout(`/api/files/browse/list?${browseQuery(cwd, pathRel)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await jsonBody(res);
  // A directory with no children answers `{ entries: [] }`, so an ABSENT array is a body we could
  // not read — different from an empty directory, and the callers treat the two differently (one
  // marks the node loaded, the other collapses it again).
  if (!isUnknownArray(data.entries)) throw new Error("GET /api/files/browse/list → body has no entries array");
  return data.entries.filter(isListingEntry);
}

export interface FilesTree {
  /** `null` until a listing comes back for this root: an empty array means the directory is empty. */
  roots: Ref<TreeNode[] | null>;
  error: Ref<string | null>;
  rows: ComputedRef<TreeRow[]>;
  loadRoot: () => Promise<void>;
  toggleDir: (node: TreeNode) => Promise<void>;
  findNode: (target: string) => TreeNode | null;
  /** Nothing has been read for the root this pane is moving to. Bumps the generation too, so an
   *  answer already in flight cannot land in the new tree. */
  reset: () => void;
}

export function useFilesTree(cwd: () => string | null): FilesTree {
  const roots = ref<TreeNode[] | null>(null);
  const error = ref<string | null>(null);
  let reqId = 0;

  /** Show this directory's last listing, if there is one. Says whether it painted, because what
   *  happens to it when the read fails is not what happens to a tree that was really read. */
  function paintCachedRoot(): boolean {
    const cached = cachedListingFor(cwd());
    if (!cached) return false;
    roots.value = cached.map((entry) => makeNode(entry, ""));
    return true;
  }

  async function loadRoot(): Promise<void> {
    const id = ++reqId;
    error.value = null;
    // Paint what this directory held last time, so the wait shows the tree rather than "Loading…".
    // Only when nothing is on screen: the header's Reload button comes through here with a real
    // tree already up, and replacing that with an older copy would be a step backwards (#2148).
    const painted = roots.value === null && paintCachedRoot();
    try {
      const entries = await fetchListing(cwd(), "");
      if (id === reqId) {
        roots.value = adoptListing(roots.value, entries);
        cacheListing(cwd(), entries);
      }
    } catch (e) {
      if (id !== reqId) return;
      error.value = e instanceof Error ? e.message : String(e);
      // A painted cache is a guess, and the error says we cannot confirm it — so it goes, and the
      // error stands alone. A tree that was really READ stays: that one we know was true once.
      if (painted) roots.value = null;
    }
  }

  async function toggleDir(node: TreeNode): Promise<void> {
    node.expanded = !node.expanded;
    if (node.expanded && !node.loaded) {
      try {
        node.children = (await fetchListing(cwd(), node.path)).map((entry) => makeNode(entry, node.path));
        node.loaded = true;
      } catch {
        node.expanded = false; // couldn't read — collapse again
      }
    }
  }

  return {
    roots,
    error,
    rows: computed(() => flattenRows(roots.value ?? [])),
    loadRoot,
    toggleDir,
    findNode: (target) => findIn(roots.value ?? [], target),
    reset: () => {
      reqId += 1;
      roots.value = null;
      error.value = null;
    },
  };
}
