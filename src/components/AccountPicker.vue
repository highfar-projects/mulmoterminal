<script setup lang="ts">
// Which Claude Code LOGIN a session starts on, chosen at launch — for someone juggling several
// Claude accounts (work / personal). Sits in the empty cell's launch form, beside ModelPicker.
//
// Unlike ModelPicker this select is ALWAYS shown, even with zero accounts configured: "Default"
// is always a valid, working choice (the host's own `~/.claude` login, exactly as before this
// feature existed), so there is never a reason to hide or grey out the control — only to leave it
// at its one option.
import { computed } from "vue";
import { useAccounts } from "../composables/useAccounts";
import { SELECT_CONTROL } from "./selectClasses";
import { LAUNCH_ROW } from "./launchFormClasses";

const props = defineProps<{ modelValue: string | null }>();
const emit = defineEmits<{ (e: "update:modelValue", accountId: string | null): void }>();

const { accounts } = useAccounts();

// One flat <select>: the empty string is "Default" (this directory's own default, or the host's).
const selected = computed({
  get: () => props.modelValue ?? "",
  set: (value: string) => emit("update:modelValue", value || null),
});
</script>

<template>
  <div class="flex flex-col items-center gap-1.5" :class="LAUNCH_ROW">
    <span class="flex w-full items-center justify-between">
      <span class="font-sans text-[11px] uppercase tracking-[0.05em] text-dim">Account</span>
    </span>

    <select v-model="selected" data-testid="cell-account-select" aria-label="Claude account for this session" :class="[SELECT_CONTROL, 'font-mono']">
      <option value="">Default</option>
      <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.label }}</option>
    </select>
  </div>
</template>
