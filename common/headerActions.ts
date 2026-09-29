// What a `run: "action"` header button may do to the cell it sits in. Shared because the server
// validates a config against this list and the client dispatches on it: an entry only one side
// knew would be dropped at load, or accepted and then do nothing.
//
// The panes are the ones the cell's History and Tools menus toggle, plus the files pane the path
// menu opens. Every one of them is also a RightPane, which TerminalGrid's dispatch pins by type.
export const HEADER_PANE_ACTIONS = ["files", "prompts", "transcript", "tools", "canvas", "collections"] as const;

export const HEADER_ACTIONS = ["restart", "new-here", "timeline", "talk", ...HEADER_PANE_ACTIONS] as const;

export type HeaderPaneAction = (typeof HEADER_PANE_ACTIONS)[number];
export type HeaderAction = (typeof HEADER_ACTIONS)[number];

export const isHeaderAction = (value: unknown): value is HeaderAction => HEADER_ACTIONS.some((action) => action === value);

export const isHeaderPaneAction = (value: HeaderAction): value is HeaderPaneAction => HEADER_PANE_ACTIONS.some((pane) => pane === value);
