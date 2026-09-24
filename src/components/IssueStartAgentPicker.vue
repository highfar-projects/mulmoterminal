<script setup lang="ts">
// Which agent, and which of its logins, an issue's work starts in (#2226). One choice for the whole
// PRs & Issues view rather than a menu per row: the common case is a habit ("this project's issues
// go to Codex"), and a per-row menu would cost that habit a click on every issue.
//
// A non-Claude pick keeps its warning on screen, beside the choice rather than behind a per-click
// confirmation: every agent but a Claude draft runs the issue text at once, and the issue may be
// anyone's (#2234). An agent this machine cannot start is listed but disabled; a remembered pick
// that has since become unavailable says why, the same way the new-cell form does (#2230).
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent";
import type { AgentUnavailableReason } from "../../common/agentAvailability";
import { BUILTIN_AGENT_OPTIONS } from "./agentPicker";
import { issueStartWarning } from "./issueStartWarning";
import { useIssueStartAgent } from "../composables/useIssueStartAgent";
import { useAgentAvailability } from "../composables/useAgentAvailability";

const { t } = useI18n();
const { choice, accountChoices, chooseAgent, chooseAccount } = useIssueStartAgent();
const { unavailableAgents } = useAgentAvailability();

const labelOf = (agent: TerminalAgent): string => BUILTIN_AGENT_OPTIONS.find((option) => option.agent === agent)?.label ?? agent;

const options = computed(() =>
  BUILTIN_AGENT_OPTIONS.map((option) => {
    const agent = option.agent;
    const unavailable = isTerminalAgent(agent) && unavailableAgents.value.has(agent);
    return { agent, unavailable, text: unavailable ? t("issueStart.notInstalled", { agent: option.label }) : option.label };
  }),
);

const warning = computed(() => {
  const kind = issueStartWarning(choice.value.agent);
  return kind === "none" ? null : t(`issueStart.${kind}`, { agent: labelOf(choice.value.agent) });
});

const REASON_MESSAGE: Record<AgentUnavailableReason, string> = {
  missing: "launch.agentUnavailable.missing",
  "no-such-path": "launch.agentUnavailable.noSuchPath",
  "not-executable": "launch.agentUnavailable.notExecutable",
};

const blocked = computed(() => unavailableAgents.value.get(choice.value.agent) ?? null);
const blockedNotice = computed(() => (blocked.value ? t(REASON_MESSAGE[blocked.value.reason], { agent: labelOf(blocked.value.agent) }) : null));

const onAgent = (event: Event): void => {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
  if (isTerminalAgent(value)) chooseAgent(value);
};
const onAccount = (event: Event): void => {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : "";
  chooseAccount(value === "" ? null : value);
};
</script>

<template>
  <div data-testid="issue-start-agent-picker" class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 font-sans text-[12px]">
    <label class="flex flex-none items-center gap-1.5">
      <span class="text-[11px] uppercase tracking-[0.05em] text-dim">{{ t("issueStart.agentLabel") }}</span>
      <select
        data-testid="issue-start-agent"
        class="cursor-pointer rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[12px] text-fg focus:border-accent focus:outline-none"
        :value="choice.agent"
        @change="onAgent"
      >
        <option v-for="option in options" :key="option.agent" :value="option.agent" :disabled="option.unavailable">{{ option.text }}</option>
      </select>
    </label>
    <label v-if="accountChoices.length" class="flex flex-none items-center gap-1.5">
      <span class="text-[11px] uppercase tracking-[0.05em] text-dim">{{ t("issueStart.accountLabel") }}</span>
      <select
        data-testid="issue-start-account"
        class="cursor-pointer rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[12px] text-fg focus:border-accent focus:outline-none"
        :value="choice.account ?? ''"
        @change="onAccount"
      >
        <option value="">{{ t("issueStart.defaultLogin") }}</option>
        <option v-for="account in accountChoices" :key="account.id" :value="account.id">{{ account.label }}</option>
      </select>
    </label>
    <p v-if="blockedNotice" data-testid="issue-start-unavailable" role="status" class="min-w-0 basis-full text-[11px] leading-snug text-amber">
      {{ blockedNotice }}
      <a
        v-if="blocked?.installGuide"
        data-testid="issue-start-install-guide"
        :href="blocked.installGuide"
        target="_blank"
        rel="noopener noreferrer"
        class="text-current underline underline-offset-2 hover:opacity-80"
        >{{ t("launch.agentUnavailable.installGuide") }}</a
      >
      {{ t("launch.agentUnavailable.restartNote") }}
    </p>
    <p v-else-if="warning" data-testid="issue-start-warning" role="note" class="min-w-0 basis-full text-[11px] leading-snug text-amber">{{ warning }}</p>
  </div>
</template>
