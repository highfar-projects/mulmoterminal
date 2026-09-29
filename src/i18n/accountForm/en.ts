// The add-account form in Settings -> Models and backends. This fork's own (upstream's accounts are
// read-only in Settings), so its strings live apart from the bundles: they stay under the bundles'
// line limit, and an upstream merge does not have to thread them through its own edits.
export const accountFormEn = {
  accountIdField: "Account id",
  accountIdPlaceholder: "id (e.g. work)",
  accountLabelField: "Account label",
  accountLabelPlaceholder: "label (e.g. Work)",
  accountAgentField: "Agent",
  accountHomeField: "Config directory",
  accountHomePlaceholder: "~/.claude-work",
  accountTokenEnvVarField: "OAuth token env var (optional)",
  accountTokenEnvVarPlaceholder: "CLAUDE_WORK_OAUTH_TOKEN",
};
