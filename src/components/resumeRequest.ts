import type { TerminalAgent } from "../../common/sessionAgent";

// What the launch form's `resume` carries. LaunchPanel re-emits the form's event unchanged, so the
// two declarations must be one: a field added to only one would be dropped on the way through.
export interface ResumeRequest {
  id: string;
  cwd: string | null;
  agent?: TerminalAgent;
  account?: string | null;
}
