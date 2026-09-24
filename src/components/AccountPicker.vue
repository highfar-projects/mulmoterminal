<script setup lang="ts">
// Which login a NEW session starts on (#2215) — one of the user's `accounts`, each a second
// subscription kept in its own config directory. Sits in the launch form beside the model choice.
//
// Only shown when the picked agent has an account to choose; the empty value is the default login,
// which is what every cell used before accounts existed. Resuming a listed session ignores this —
// a session runs on the login it was started on (server/session/session-home.ts).
import { computed } from "vue";
import type { AgentAccount } from "../../common/agentAccounts";
import { SELECT_CONTROL } from "./selectClasses";
import { LAUNCH_ROW } from "./launchFormClasses";

const props = defineProps<{ accounts: AgentAccount[]; modelValue: string | null }>();
const emit = defineEmits<{ (e: "update:modelValue", account: string | null): void }>();

const selected = computed({
  get: () => props.modelValue ?? "",
  set: (value: string) => emit("update:modelValue", value || null),
});
</script>

<template>
  <div class="flex flex-col items-center gap-1.5" :class="LAUNCH_ROW">
    <span class="w-full font-sans text-[11px] uppercase tracking-[0.05em] text-dim">Account</span>
    <select v-model="selected" data-testid="cell-account-select" aria-label="Account for this session" :class="SELECT_CONTROL">
      <option value="">Default login</option>
      <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.label }}</option>
    </select>
  </div>
</template>
