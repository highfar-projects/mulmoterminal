import type { StepNotice, StepNoticeCode } from "../../../common/blueprint/stepNotice";
import type { StepState } from "../../../common/blueprint/state";
import type { Messages } from "../../i18n/messages";

type NoticeKey = keyof Messages["blueprints"]["notices"];
type Translate = (key: string, values: Record<string, string>) => string;

const NOTICE_KEYS: Record<StepNoticeCode, NoticeKey> = {
  "folder-busy": "folderBusy",
  untrusted: "untrusted",
  "answers-unwritten": "answersUnwritten",
  "session-lost": "sessionLost",
};

function valuesOf(notice: StepNotice): Record<string, string> {
  switch (notice.code) {
    case "folder-busy":
      return { runId: notice.runId };
    case "untrusted":
      return { dir: notice.dir };
    case "answers-unwritten":
      return { detail: notice.detail };
    default:
      return {};
  }
}

/** What a failed check reported: the executor's own notice in the person's language, a pack's check output as it is. */
export function checkOutputText(t: Translate, lastCheck: NonNullable<StepState["lastCheck"]>): string {
  const { notice } = lastCheck;
  return notice ? t(`blueprints.notices.${NOTICE_KEYS[notice.code]}`, valuesOf(notice)) : lastCheck.output;
}
