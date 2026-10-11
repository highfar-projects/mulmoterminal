// Whether a click asks for a NEW Files tab: Cmd on macOS, Ctrl elsewhere, the way a browser treats a
// link (#2461). One rule for the tree and for a path clicked in terminal output (#3005). On macOS
// Ctrl+click is a right click, so there only Cmd reaches here.
export const wantsNewTab = (event: Pick<MouseEvent, "metaKey" | "ctrlKey">): boolean => event.metaKey || event.ctrlKey;
