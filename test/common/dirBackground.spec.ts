// The browser's own check on the background it is sent: only this app's route or a remote image,
// an opacity in range, a known fit — anything else is no background at all.
import { describe, it, expect } from "vitest";
import { parsePublicDirBackground } from "../../common/dirBackground";

describe("parsePublicDirBackground", () => {
  it.each([
    { url: "/api/dir-background?cwd=%2Fw", opacity: 0.15, fit: "cover" },
    { url: "https://example.com/w.png", opacity: 1, fit: "contain" },
    { url: "data:image/png;base64,AAAA", opacity: 0.5, fit: "cover" },
  ])("keeps %j", (wire) => {
    expect(parsePublicDirBackground(wire)).toEqual(wire);
  });

  it.each([
    null,
    "https://example.com/w.png",
    { url: "/api/dir-icon?cwd=%2Fw", opacity: 0.2, fit: "cover" },
    { url: "/etc/passwd", opacity: 0.2, fit: "cover" },
    { url: "javascript:alert(1)", opacity: 0.2, fit: "cover" },
    { url: "data:text/html,<b>x</b>", opacity: 0.2, fit: "cover" },
    { url: "https://example.com/w.png", opacity: 0, fit: "cover" },
    { url: "https://example.com/w.png", opacity: 2, fit: "cover" },
    { url: "https://example.com/w.png", opacity: 0.2, fit: "tile" },
    { url: "https://example.com/w.png", fit: "cover" },
  ])("refuses %j", (wire) => {
    expect(parsePublicDirBackground(wire)).toBeNull();
  });
});
