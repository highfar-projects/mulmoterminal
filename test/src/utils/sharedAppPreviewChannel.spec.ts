// The line between the preview pane and the page it is showing, which is a security boundary and
// not a detail of the component: everything the pane goes on to do with a message — running an
// intent, drawing a confirmation, writing a row — starts with having believed who sent it.
//
// `event.origin` cannot be what is asserted here, and that is the point of the module. The frame is
// sandboxed without `allow-same-origin`, so its messages and a hostile opaque-origin document's
// messages carry the same `origin === "null"`. What follows pins the check that does tell them
// apart, in both directions.
import { describe, it, expect, vi, afterEach } from "vitest";
import { listenToPreviewFrame } from "../../../src/utils/sharedAppPreviewChannel";

const stops: (() => void)[] = [];

/** A listener over a frame that is present unless `frame` says otherwise, plus what it received. */
const listening = (frame: () => HTMLIFrameElement | null) => {
  const received: unknown[] = [];
  const stop = listenToPreviewFrame(frame, (data) => received.push(data));
  stops.push(stop);
  return { received, stop };
};

/** An attached iframe, which is the only way it has a `contentWindow` to be recognised by. */
const attachedFrame = () => {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  return frame;
};

const post = (source: MessageEventSource | null, data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source, origin: "null" }));

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  document.body.innerHTML = "";
});

describe("listenToPreviewFrame", () => {
  it("delivers a message whose source is the frame", () => {
    const frame = attachedFrame();
    const { received } = listening(() => frame);

    post(frame.contentWindow, { hello: "page" });

    expect(received).toEqual([{ hello: "page" }]);
  });

  it("ignores a message from another window carrying the same opaque origin", () => {
    const ours = attachedFrame();
    const theirs = attachedFrame();
    const { received } = listening(() => ours);

    post(theirs.contentWindow, { hello: "impostor" });

    expect(received).toEqual([]);
  });

  it("ignores a message that names no source", () => {
    const frame = attachedFrame();
    const { received } = listening(() => frame);

    post(null, { hello: "nobody" });

    expect(received).toEqual([]);
  });

  it("ignores every message while there is no frame", () => {
    const frame = attachedFrame();
    const { received } = listening(() => null);

    post(frame.contentWindow, { hello: "too early" });

    expect(received).toEqual([]);
  });

  it("asks for the frame on every message, so a replaced one is not vouched for by the old one", () => {
    const first = attachedFrame();
    const second = attachedFrame();
    let current = first;
    const { received } = listening(() => current);

    current = second;
    post(first.contentWindow, { hello: "previous document" });
    post(second.contentWindow, { hello: "current document" });

    expect(received).toEqual([{ hello: "current document" }]);
  });

  it("stops listening when the returned function is called", () => {
    const frame = attachedFrame();
    const removal = vi.spyOn(window, "removeEventListener");
    const { received, stop } = listening(() => frame);

    stop();
    post(frame.contentWindow, { hello: "after unmount" });

    expect(received).toEqual([]);
    expect(removal).toHaveBeenCalledWith("message", expect.any(Function));
    removal.mockRestore();
  });
});
