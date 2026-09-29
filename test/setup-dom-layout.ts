// jsdom has no layout, and so no `scrollIntoView`; every browser the app runs in has one. The Files
// tree scrolls a row into view whenever the tab in front changes (#2495), which nearly every pane
// spec does — so the method is provided once here rather than stubbed file by file. A spec that
// wants to see the calls assigns its own over this one.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
