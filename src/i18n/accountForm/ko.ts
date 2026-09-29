import type { accountFormEn } from "./en";

export const accountFormKo: Record<keyof typeof accountFormEn, string> = {
  accountIdField: "계정 id",
  accountIdPlaceholder: "id (예: work)",
  accountLabelField: "계정 이름",
  accountLabelPlaceholder: "이름 (예: 업무용)",
  accountAgentField: "에이전트",
  accountHomeField: "설정 디렉터리",
  accountHomePlaceholder: "~/.claude-work",
  accountTokenEnvVarField: "OAuth 토큰 환경 변수 (선택)",
  accountTokenEnvVarPlaceholder: "CLAUDE_WORK_OAUTH_TOKEN",
};
