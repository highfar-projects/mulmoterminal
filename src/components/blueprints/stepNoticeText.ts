import type { StepNotice, StepNoticeCode } from "../../../common/blueprint/stepNotice";
import type { StepState } from "../../../common/blueprint/state";
import type { Messages } from "../../i18n/messages";
import { rejectionReason } from "./blueprintView";

type NoticeKey = keyof Messages["blueprints"]["notices"];
type Translate = (key: string, values: Record<string, string>) => string;

const NOTICE_KEYS: Record<StepNoticeCode, NoticeKey> = {
  "folder-busy": "folderBusy",
  untrusted: "untrusted",
  "answers-unwritten": "answersUnwritten",
  "session-lost": "sessionLost",
  "round-limit": "roundLimit",
};

function valuesOf(notice: StepNotice): Record<string, string> {
  switch (notice.code) {
    case "folder-busy":
      return { runId: notice.runId };
    case "untrusted":
      return { dir: notice.dir };
    case "answers-unwritten":
      return { detail: notice.detail };
    case "round-limit":
      return { rounds: String(notice.rounds) };
    default:
      return {};
  }
}

const noticeText = (t: Translate, notice: StepNotice): string => t(`blueprints.notices.${NOTICE_KEYS[notice.code]}`, valuesOf(notice));

/** What a failed check reported: the executor's own notice in the person's language, a pack's check output as it is. */
export function checkOutputText(t: Translate, lastCheck: NonNullable<StepState["lastCheck"]>): string {
  return lastCheck.notice ? noticeText(t, lastCheck.notice) : lastCheck.output;
}

/** Why a step stopped, when it was not a failed check: the executor's notice in the person's language, or a person's own words. */
export function stopReasonText(t: Translate, stepState: StepState | undefined): string | null {
  const reason = rejectionReason(stepState);
  if (reason === null) return null;
  return stepState?.reasonNotice ? noticeText(t, stepState.reasonNotice) : reason;
}

/** The folder to open Claude Code in, to answer its trust prompt, when that is why the step stopped; null otherwise. */
export function untrustedFolder(stepState: StepState | undefined): string | null {
  const notices = [stepState?.reasonNotice, stepState?.lastCheck?.notice];
  return notices.flatMap((notice) => (notice?.code === "untrusted" ? [notice.dir] : []))[0] ?? null;
}
