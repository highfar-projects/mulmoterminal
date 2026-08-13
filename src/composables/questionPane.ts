import { createGlobalFlag } from "./globalFlag";

// Whether a session's AskUserQuestion choices are offered as buttons in a right pane (#1679).
// Off unless the config asks for it: answering from the pane types into the live terminal dialog,
// so it must never arrive by default.
//
// Only Settings renders this. The pane itself needs no flag — with the switch off the server
// publishes nothing, so no question ever reaches the browser (server/routes/app-routes.ts).
const flag = createGlobalFlag("questionPaneEnabled", false);

export const questionPaneEnabled = flag.state;
export const setQuestionPaneEnabled = flag.set;
export const saveQuestionPaneEnabled = flag.save;
