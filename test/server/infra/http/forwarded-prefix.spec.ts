// @vitest-environment node
// The relay's prefix as a peer reads it (common/peers.ts): only the exact `/peer/<id>` shape is taken,
// because it is written into the documents this server renders.
import { describe, it, expect } from "vitest";
import { forwardedPrefix } from "../../../../server/infra/http/forwarded-prefix";
import { servedImageSrc } from "../../../../server/files/mdImageSrc";

describe("forwardedPrefix", () => {
  it("takes the prefix a relay sends", () => {
    expect(forwardedPrefix({ headers: { "x-forwarded-prefix": "/peer/win" } })).toBe("/peer/win");
  });

  it.each([[undefined], ["/peer/"], ["/peer/WIN"], ["/peer/win/x"], ['/peer/win" onload="x'], ["/other/win"], [["/peer/win"]]])(
    "takes nothing else (%j)",
    (value) => {
      expect(forwardedPrefix({ headers: { "x-forwarded-prefix": value as string | undefined } })).toBe("");
    },
  );
});

describe("a Markdown image under a relay", () => {
  it("is linked through the relay's prefix, so it comes back from the server that rendered it", () => {
    expect(servedImageSrc("img/a.png", { base: "/p", dirRel: "docs", prefix: "/peer/win" })).toBe("/peer/win/api/files/raw?cwd=%2Fp&path=docs%2Fimg%2Fa.png");
  });

  it("is linked as before when asked for directly", () => {
    expect(servedImageSrc("img/a.png", { base: "/p", dirRel: "docs" })).toBe("/api/files/raw?cwd=%2Fp&path=docs%2Fimg%2Fa.png");
  });
});
