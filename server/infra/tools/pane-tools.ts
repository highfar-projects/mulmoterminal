// The tools that drive the right pane of the cell that calls them (#3022). Host tools, because they
// need the session the broker names and the pub/sub the grid listens on (routes/pane-tool-routes.ts).
import type { ToolDefinition } from "gui-chat-protocol";
import { MAX_CHECK_ITEMS, PANE_VIEWS, checkClosedNotice } from "../../../common/paneCommand.js";

const VIEW_DESCRIPTION =
  "How to show it: `editor` (the source, default), `preview` (rendered Markdown / HTML / CSV), `canvas` (the plugin view the Canvas uses — Markdown, HTML, MulmoScript, ShapeScript), `split` (a Markdown file's editor beside its Canvas view).";

const TARGET_PROPERTIES = {
  path: { type: "string", description: "The file, relative to your working directory (or absolute inside it)." },
  view: { type: "string", enum: [...PANE_VIEWS], description: VIEW_DESCRIPTION },
  line: { type: "integer", description: "1-based line to open at. Opens the editor at that line, whatever `view` says." },
};

export const SHOW_IN_PANE: ToolDefinition = {
  type: "function",
  name: "showInPane",
  description:
    "Open a file in the Files pane on the right of YOUR terminal in MulmoTerminal, in a given view and at a given line, so the user sees exactly what you want them to look at. Returns at once.",
  prompt:
    "Use `showInPane` when the user should LOOK at a file rather than read your description of it — the change you just made, the line an error points at, a rendered document. " +
    "Prefer it to pasting file contents into the conversation. The file must be inside your working directory. " +
    "If your cell is not the one on screen, the pane opens when the user enlarges your cell; nothing else is disturbed.",
  parameters: {
    type: "object",
    properties: TARGET_PROPERTIES,
    required: ["path"],
  },
};

export const REQUEST_CHECK: ToolDefinition = {
  type: "function",
  name: "requestCheck",
  description:
    "Put a checklist in the right pane of YOUR terminal in MulmoTerminal for the user to work through: each item can open a file in a given view, and the user marks it OK or NG with a note. Returns at once; the results arrive later as the user's next message.",
  prompt:
    "Use `requestCheck` when something you built needs a HUMAN to confirm it works — a UI change, a rendered output, behaviour you could not observe yourself. " +
    "Write each item as one concrete thing to look at and what 'right' means (e.g. 'The formula is drawn, not shown as $…$'), and give it the file to open (`path`, `view`, `line`) so the user gets there in one click. " +
    `At most ${MAX_CHECK_ITEMS} items. ` +
    "Do NOT wait, poll or ask again after calling it: finish your turn. When the user has answered every item, their results are typed in as their next message — one entry per item, `OK` or `NG` with their note. Fix each NG, then call `requestCheck` again for what you changed. " +
    `If the user closes the checklist instead, the message is \`${checkClosedNotice({ title: "<title>" })}\`: they chose not to answer, so do not post it again unless they ask.`,
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "What is being checked, in a few words." },
      items: {
        type: "array",
        description: "The things to check, in order.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "One concrete thing to look at, and what counts as right." },
            ...TARGET_PROPERTIES,
          },
          required: ["label"],
        },
      },
    },
    required: ["title", "items"],
  },
};
