import type { accountFormEn } from "./en";

export const accountFormJa: Record<keyof typeof accountFormEn, string> = {
  accountIdField: "アカウント ID",
  accountIdPlaceholder: "id（例: work）",
  accountLabelField: "アカウント名",
  accountLabelPlaceholder: "表示名（例: 仕事用）",
  accountAgentField: "エージェント",
  accountHomeField: "設定ディレクトリ",
  accountHomePlaceholder: "~/.claude-work",
  accountTokenEnvVarField: "OAuth トークンの環境変数（任意）",
  accountTokenEnvVarPlaceholder: "CLAUDE_WORK_OAUTH_TOKEN",
};
