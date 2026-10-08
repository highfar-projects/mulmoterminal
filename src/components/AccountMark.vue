<script setup lang="ts">
// Which login a cell's session runs on (#2215), worn in its header. Nothing for the default login:
// a mark on every ordinary cell would be noise, and the default is what "no account" means.
//
// Identity rather than status, like the collection mark beside it — so it stays on a filmstrip
// thumbnail too, where two cells on the same directory differ only by this.
//
// On a rotated cell it is also the way to move the session to another subscription (#2950): with
// `choices` it opens a menu, and without them it stays the plain mark.
import { computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import AnchoredMenu from "./AnchoredMenu.vue";
import { ANCHORED_MENU_ITEM_CLASS, ANCHORED_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import type { AnchoredMenuInitialFocus } from "./anchoredMenuFocus";
import type { AccountSwitchChoice } from "../composables/accountSwitchChoices";

const { t } = useI18n();
// `detail` is the longer name the hover gives — a rotation token's label with its address (#2919).
const props = defineProps<{ label: string | null; detail?: string | null; choices?: AccountSwitchChoice[] }>();
const emit = defineEmits<{ switch: [tokenId: string] }>();

const MARK_CLASS =
  "inline-flex max-w-[12ch] flex-none items-center gap-1 rounded-[10px] border border-border bg-elevated px-[7px] py-px font-mono text-[11px] text-secondary";
const ITEM_SELECTOR = '[role^="menuitem"]:not(:disabled)';
const INITIAL_FOCUS: AnchoredMenuInitialFocus = "checkedOrFirst";

const menu = useTemplateRef<InstanceType<typeof AnchoredMenu>>("menu");
const switchable = computed(() => (props.choices?.length ?? 0) > 1);
const tip = computed(() => t("tips.cell.runsOnAccount", { account: props.detail ?? props.label }));
const switchTip = computed(() => [tip.value, t("accountSwitch.hint")].join(" - "));

function pick(choice: AccountSwitchChoice): void {
  menu.value?.leave();
  if (!choice.current) emit("switch", choice.id);
}
</script>

<template>
  <AnchoredMenu
    v-if="label && switchable"
    ref="menu"
    :item-selector="ITEM_SELECTOR"
    :initial-focus="INITIAL_FOCUS"
    :panel-class="ANCHORED_MENU_PANEL_CLASS"
    testid="cell-account-menu"
    :label="t('accountSwitch.title')"
  >
    <template #trigger="{ open }">
      <button
        type="button"
        data-testid="cell-account-mark"
        :class="[MARK_CLASS, 'cursor-pointer hover:bg-hover']"
        :data-tip="switchTip"
        :aria-label="t('accountSwitch.title')"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="menu?.toggle()"
      >
        <span class="material-symbols-outlined text-[13px]" aria-hidden="true">account_circle</span><span class="truncate">{{ label }}</span>
      </button>
    </template>
    <p class="m-0 px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-dim">{{ t("accountSwitch.explain") }}</p>
    <button
      v-for="choice in choices"
      :key="choice.id"
      type="button"
      role="menuitemcheckbox"
      :aria-checked="choice.current"
      :data-testid="`cell-account-choice-${choice.id}`"
      :class="ANCHORED_MENU_ITEM_CLASS"
      @click="pick(choice)"
    >
      <span class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">account_circle</span>
      <span class="min-w-0 flex-auto">
        <span class="block text-[13px]">{{ choice.label }}</span>
        <span v-if="choice.detail" class="block truncate text-[11px] leading-snug text-dim">{{ choice.detail }}</span>
      </span>
      <span v-if="choice.current" class="material-symbols-outlined mt-px text-[16px] text-accent" aria-hidden="true">check</span>
    </button>
  </AnchoredMenu>
  <span v-else-if="label" data-testid="cell-account-mark" :class="MARK_CLASS" :data-tip="tip"
    ><span class="material-symbols-outlined text-[13px]" aria-hidden="true">account_circle</span><span class="truncate">{{ label }}</span></span
  >
</template>
