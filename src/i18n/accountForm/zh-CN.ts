import type { accountFormEn } from "./en";

export const accountFormZhCN: Record<keyof typeof accountFormEn, string> = {
  accountIdField: "账户 id",
  accountIdPlaceholder: "id（例如 work）",
  accountLabelField: "账户名称",
  accountLabelPlaceholder: "名称（例如 工作）",
  accountAgentField: "智能体",
  accountHomeField: "配置目录",
  accountHomePlaceholder: "~/.claude-work",
  accountTokenEnvVarField: "OAuth 令牌环境变量（可选）",
  accountTokenEnvVarPlaceholder: "CLAUDE_WORK_OAUTH_TOKEN",
};
