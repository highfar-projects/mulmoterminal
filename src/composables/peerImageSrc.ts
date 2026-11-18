// The images a plugin view draws for a PEER's cell (common/peers.ts), pointed at the peer.
//
// A view builds its image URLs itself, root-relative to whatever server served the page: the
// markdown view turns `![](x.png)` into `/api/files/raw?path=…` through @mulmoclaude/markdown-utils,
// whose base URL is ONE module-level setting (`setFilesRawUrl`) and so cannot differ per cell. On a
// peer's cell that asks this server for a file only the peer has. The view's DOM is the only place
// left to correct it, which is what `watchPeerImages` does — the requests the view makes through the
// runtime (pluginRuntime.ts) are already the peer's.
//
// Second, and separate: for a document reached by an ABSOLUTE posix path — every file the Files
// pane opens on the Canvas, since it hands the view `cwd + path` — markdown-utils resolves the
// document's directory segment by segment and drops the leading `/`, so `/home/u/ws/a/x.png` comes
// out as `path=home/u/ws/a/x.png`, which the peer resolves under its workspace and answers 404.
// (A Windows document keeps working by accident: `D:/…` is absolute with or without the slash.)
// The slash is put back when the path starts with the document's own first segment — a ref the
// view resolved from the root (`/images/x.png`, meaning workspace-relative) does not, and is left.
import { peerApiPath } from "../../common/peers";

const RAW_ROUTE = "/api/files/raw";

/** Root-relative URLs that name the view's server: its API and its artifact mount. */
const SERVER_PATHS = ["/api/", "/artifacts/"];

/** The first segment of an absolute posix path, or null for anything else. */
function firstSegment(docPath: string | null | undefined): string | null {
  if (!docPath?.startsWith("/")) return null;
  const segment = docPath.slice(1).split("/")[0];
  return segment ? segment : null;
}

/** `src` with the leading slash markdown-utils dropped put back, when that is what happened. */
function restoreAbsolutePath(src: string, docPath: string | null | undefined): string {
  const segment = firstSegment(docPath);
  if (segment === null || !src.startsWith(`${RAW_ROUTE}?`)) return src;
  // Any base will do: `src` is root-relative, and only its path and query are read back.
  const url = new URL(src, "https://host.invalid");
  const filePath = url.searchParams.get("path");
  if (filePath === null || !filePath.startsWith(`${segment}/`)) return src;
  url.searchParams.set("path", `/${filePath}`);
  return `${url.pathname}${url.search}`;
}

/** Where an image the view drew should come from on `host`; `src` unchanged when it is not this
 *  server's URL (data:, http(s):, relative) or there is no peer. */
export function peerImageSrc(src: string, host: string | null, docPath?: string | null): string {
  if (!host || !SERVER_PATHS.some((prefix) => src.startsWith(prefix))) return src;
  return peerApiPath(host, restoreAbsolutePath(src, docPath));
}

function rewriteImage(img: HTMLImageElement, host: string, docPath: string | null): void {
  const src = img.getAttribute("src");
  if (src === null) return;
  const next = peerImageSrc(src, host, docPath);
  if (next !== src) img.setAttribute("src", next);
}

function rewriteUnder(node: Node, host: string, docPath: string | null): void {
  if (node instanceof HTMLImageElement) rewriteImage(node, host, docPath);
  else if (node instanceof Element) node.querySelectorAll("img").forEach((img) => rewriteImage(img, host, docPath));
}

/** Keep every image under `root` pointed at `host`, as the view renders and re-renders. Returns
 *  the function that stops watching. A rewritten src starts with `/peer/`, so it is not rewritten
 *  again. */
export function watchPeerImages(root: Element, host: string, docPath: () => string | null): () => void {
  rewriteUnder(root, host, docPath());
  const observer = new MutationObserver((records) => {
    const doc = docPath();
    for (const record of records) {
      if (record.type === "attributes") rewriteUnder(record.target, host, doc);
      else record.addedNodes.forEach((node) => rewriteUnder(node, host, doc));
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  return () => observer.disconnect();
}
