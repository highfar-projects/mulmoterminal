// The images a plugin view draws for a peer's cell. The markdown view builds them as this
// server's `/api/files/raw?path=…` and, for an absolute posix document, without the leading slash —
// so on a WSL peer the Canvas showed no images while the Preview (server-rendered) did.
import { describe, it, expect } from "vitest";
import { peerImageSrc, watchPeerImages } from "../../../src/composables/peerImageSrc";

const DOC = "/home/u/ws/proj/README.md";
const raw = (path: string): string => `/api/files/raw?path=${encodeURIComponent(path)}`;

describe("peerImageSrc", () => {
  it("leaves every URL alone on this server", () => {
    expect(peerImageSrc(raw("home/u/ws/proj/x.png"), null, DOC)).toBe(raw("home/u/ws/proj/x.png"));
  });

  it("sends a file image to the peer, with the slash markdown-utils dropped put back", () => {
    expect(peerImageSrc(raw("home/u/ws/proj/img/x.png"), "wsl", DOC)).toBe(`/peer/wsl${raw("/home/u/ws/proj/img/x.png")}`);
  });

  // `![](/images/x.png)` is resolved from the root and means workspace-relative; it does not start
  // with the document's own first segment, so it is not made absolute.
  it("keeps a workspace-relative path relative", () => {
    expect(peerImageSrc(raw("images/x.png"), "wsl", DOC)).toBe(`/peer/wsl${raw("images/x.png")}`);
  });

  it("does not touch the path of a document that is not absolute posix", () => {
    expect(peerImageSrc(raw("proj/x.png"), "wsl", "proj/README.md")).toBe(`/peer/wsl${raw("proj/x.png")}`);
    expect(peerImageSrc(raw("D:/ws/x.png"), "wsl", "D:/ws/README.md")).toBe(`/peer/wsl${raw("D:/ws/x.png")}`);
  });

  it("keeps the other query parameters", () => {
    expect(peerImageSrc(`${raw("home/u/x.png")}&v=3`, "wsl", DOC)).toBe(`/peer/wsl${raw("/home/u/x.png")}&v=3`);
  });

  it("sends the artifact mount to the peer as it is", () => {
    expect(peerImageSrc("/artifacts/images/a.png", "wsl", DOC)).toBe("/peer/wsl/artifacts/images/a.png");
  });

  it("leaves data:, external and already relayed URLs alone", () => {
    for (const src of ["data:image/png;base64,AAAA", "https://example.com/a.png", "/peer/wsl/api/files/raw?path=%2Fa.png", "img/a.png"]) {
      expect(peerImageSrc(src, "wsl", DOC)).toBe(src);
    }
  });
});

describe("watchPeerImages", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("rewrites the images already there, the ones added later, and a src changed later", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<img src="${raw("home/u/a.png")}">`;
    const stop = watchPeerImages(root, "wsl", () => DOC);
    expect(root.querySelector("img")?.getAttribute("src")).toBe(`/peer/wsl${raw("/home/u/a.png")}`);

    root.insertAdjacentHTML("beforeend", `<p><img id="b" src="${raw("home/u/b.png")}"></p>`);
    await flush();
    const added = root.querySelector<HTMLImageElement>("#b");
    expect(added?.getAttribute("src")).toBe(`/peer/wsl${raw("/home/u/b.png")}`);

    added?.setAttribute("src", raw("home/u/c.png"));
    await flush();
    expect(added?.getAttribute("src")).toBe(`/peer/wsl${raw("/home/u/c.png")}`);

    stop();
    added?.setAttribute("src", raw("home/u/d.png"));
    await flush();
    expect(added?.getAttribute("src")).toBe(raw("home/u/d.png"));
  });
});
