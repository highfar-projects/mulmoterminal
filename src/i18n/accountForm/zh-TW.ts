import type { accountFormEn } from "./en";

export const accountFormZhTW: Record<keyof typeof accountFormEn, string> = {
  accountIdField: "帳戶 id",
  accountIdPlaceholder: "id（例如 work）",
  accountLabelField: "帳戶名稱",
  accountLabelPlaceholder: "名稱（例如 工作）",
  accountAgentField: "代理程式",
  accountHomeField: "設定目錄",
  accountHomePlaceholder: "~/.claude-work",
  accountTokenEnvVarField: "OAuth 權杖環境變數（選填）",
  accountTokenEnvVarPlaceholder: "CLAUDE_WORK_OAUTH_TOKEN",
};
