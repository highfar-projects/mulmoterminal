import { describe, it, expect } from "vitest";
import { isPeerId, peerWsHost, sanitizePeers, splitPeerPath } from "../../common/peers";

describe("sanitizePeers", () => {
  it("keeps a well-formed entry, with the url reduced to its origin", () => {
    expect(sanitizePeers([{ id: "win", label: "Windows", url: "http://127.0.0.1:34568/" }])).toEqual([
      { id: "win", label: "Windows", url: "http://127.0.0.1:34568" },
    ]);
  });

  it("labels an entry with its id when it has no label", () => {
    expect(sanitizePeers([{ id: "wsl", url: "http://localhost:34567" }])).toEqual([{ id: "wsl", label: "wsl", url: "http://localhost:34567" }]);
  });

  // The relay would silently drop, or forward, anything past the origin, and a non-http scheme is
  // not something it can dial at all.
  it.each([
    ["a path", "http://127.0.0.1:34568/sub"],
    ["a query", "http://127.0.0.1:34568/?x=1"],
    ["credentials", "http://me:pw@127.0.0.1:34568"],
    ["another scheme", "ws://127.0.0.1:34568"],
    ["not a url", "127.0.0.1:34568"],
    ["no url", undefined],
  ])("drops an entry whose url has %s", (_what, url) => {
    expect(sanitizePeers([{ id: "win", url }])).toEqual([]);
  });

  it.each([["Win"], ["-win"], ["w/in"], [""], ["x".repeat(33)], [7]])("drops an entry with the id %j", (id) => {
    expect(sanitizePeers([{ id, url: "http://127.0.0.1:1" }])).toEqual([]);
  });

  it("keeps the first of a repeated id", () => {
    const peers = sanitizePeers([
      { id: "win", url: "http://127.0.0.1:1" },
      { id: "win", url: "http://127.0.0.1:2" },
    ]);
    expect(peers.map((p) => p.url)).toEqual(["http://127.0.0.1:1"]);
  });

  it.each([[undefined], [null], [{}], ["win"]])("reads %j as no peers", (input) => {
    expect(sanitizePeers(input)).toEqual([]);
  });
});

describe("splitPeerPath", () => {
  it("splits the peer off and keeps the rest, query included", () => {
    expect(splitPeerPath("/peer/win/ws?session=abc&cols=80")).toEqual({ id: "win", rest: "/ws?session=abc&cols=80" });
    expect(splitPeerPath("/peer/win/api/peers")).toEqual({ id: "win", rest: "/api/peers" });
  });

  it.each([["/ws"], ["/peer/"], ["/peer/win"], ["/peer//ws"], ["/peer/WIN/ws"], ["/peers/win/ws"]])("is null for %j", (input) => {
    expect(splitPeerPath(input)).toBeNull();
  });
});

describe("peerWsHost", () => {
  it("is this server's host for a cell on this server", () => {
    expect(peerWsHost(null, "localhost:34567")).toBe("localhost:34567");
    expect(peerWsHost(undefined, "localhost:34567")).toBe("localhost:34567");
  });

  // Every endpoint builder writes `${proto}//${host}/${path}`, so the prefix lands before the path.
  it("puts the peer's prefix after the host", () => {
    expect(peerWsHost("win", "localhost:34567")).toBe("localhost:34567/peer/win");
  });
});

describe("isPeerId", () => {
  it("accepts a short lowercase id", () => {
    expect(isPeerId("win-11")).toBe(true);
  });
});
