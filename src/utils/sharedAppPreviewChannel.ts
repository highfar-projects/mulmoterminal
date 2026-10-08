// THE BOUNDARY between this app and the page inside the preview frame, in a module of its own so
// the one rule it holds is testable and so the `sonarjs/post-message` exception it needs covers
// this listener and nothing else.
//
// That rule asks for `event.origin` to be compared, and here such a comparison would identify
// nobody: the frame is `sandbox="allow-scripts"` with no `allow-same-origin`, so its document has
// an OPAQUE origin and every message it sends arrives with `origin === "null"` — as does one from
// any other opaque-origin document on the page. `event.source` is the sending window itself, which
// only this frame can be, so that is what draws the line.

/** `frame` is a GETTER rather than the element: a caller may replace the iframe (re-key it), and one
 *  captured here would go on vouching for a frame that has since gone. Note what this does NOT
 *  tell apart: `contentWindow` stays the same object while the SAME frame navigates, so a document
 *  being replaced by another still passes — a caller that trusts one document and not another has
 *  to give each its own frame. Returns the function that stops listening. */
export const listenToPreviewFrame = (frame: () => HTMLIFrameElement | null, receive: (data: unknown) => void): (() => void) => {
  const onMessage = (event: MessageEvent<unknown>) => {
    const element = frame();
    if (element === null || event.source !== element.contentWindow) return;
    receive(event.data);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
};
