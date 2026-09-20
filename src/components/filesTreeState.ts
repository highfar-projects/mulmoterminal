// What is worth remembering about a file tree between visits, and in what order to put it
// back. Kept out of the component because it is all decisions — which nodes count, and the
// parents-before-children ordering a lazy tree needs — and none of it needs a mounted editor
// to be tested.

/** The shape the tree renders from; only the parts this module reasons about. */
export interface TreeNode {
  path: string;
  dir: boolean;
  expanded: boolean;
  children: TreeNode[];
}

/** Every directory currently open, deepest last. Files are not remembered — the tree only ever
 *  shows them under an open directory, so their parents already imply them. */
export function expandedPaths(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    list.forEach((node) => {
      if (!node.dir || !node.expanded) return;
      out.push(node.path);
      walk(node.children);
    });
  };
  walk(nodes);
  return out;
}

/** The order to re-open them in, **grouped by depth**. Each expansion fetches that directory's
 *  children, so a child cannot be opened before its parent exists — depth-first order from a
 *  previous session is not enough on its own, because the remembered list may have been merged
 *  or truncated.
 *
 *  Grouped rather than flat because that constraint is between LEVELS and not between siblings:
 *  every directory at one depth can be fetched at the same time. Returning levels puts that in
 *  the type, where a flat list invited the caller to await them one after another — which is what
 *  it did, so a remembered set cost one round trip per directory instead of one per level (#2148).
 *  Restoring the cap's worth of directories is two levels deep and was two hundred waits. */
export function restoreLevels(paths: readonly string[]): string[][] {
  const depth = (p: string) => p.split("/").length;
  const byDepth = new Map<number, string[]>();
  [...new Set(paths)]
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .forEach((path) => {
      byDepth.set(depth(path), [...(byDepth.get(depth(path)) ?? []), path]);
    });
  return [...byDepth.keys()].sort((a, b) => a - b).map((level) => byDepth.get(level) ?? []);
}

/** The directories that have to be open for `pathRel` to be visible in the tree, outermost first
 *  — `a/b/c.ts` needs `a`, then `a/b`. Ordered because each expansion FETCHES that directory's
 *  children, so a child cannot be opened before its parent exists (the same rule `restoreLevels`
 *  exists for). A path at the root needs nothing. */
export function ancestorDirs(pathRel: string): string[] {
  const segments = pathRel.split("/").filter((segment) => segment !== "");
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}
