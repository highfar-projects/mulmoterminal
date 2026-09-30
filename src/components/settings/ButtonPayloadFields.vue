<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import SettingsField from "../SettingsField.vue";
import { OPEN_TARGET_KINDS, isOpenTargetKind, openTargetTakesValue, type EditableRun } from "../../../common/headerButtonEntries";
import { CELL_ACTIONS } from "../../../common/headerActions";
import { APP_ACTIONS } from "../../../common/appActions";
import { VIEW_TARGETS } from "../../../common/viewTargets";
import { keymapLabelKey } from "../keymapLabels";

// What a new header button does, in the shape its kind takes (#2622): a command, text for the agent,
// something to open, or one of the app's named operations. The values go back to the form as they are
// chosen; the server builds and checks the button.
const props = defineProps<{ run: EditableRun; target: string; payload: string }>();
const emit = defineEmits<{ (e: "update:target" | "update:payload", value: string): void; (e: "submit"): void }>();

const { t } = useI18n();

const SELECT = "cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg";
const ACTIONS = [...CELL_ACTIONS, ...APP_ACTIONS];

const openKind = computed(() => (isOpenTargetKind(props.target) ? props.target : "url"));
const payloadModel = computed({ get: () => props.payload, set: (value: string) => emit("update:payload", value) });

function onSelect(event: Event, field: "target" | "payload") {
  if (!(event.target instanceof HTMLSelectElement)) return;
  if (field === "target") {
    emit("update:target", event.target.value);
    emit("update:payload", "");
  } else emit("update:payload", event.target.value);
}
</script>

<template>
  <template v-if="run === 'shell' || run === 'input'">
    <SettingsField
      v-model="payloadModel"
      class="min-w-0 flex-auto font-mono"
      data-testid="header-button-payload"
      :placeholder="run === 'shell' ? 'yarn build' : '/compact'"
      :aria-label="t(run === 'shell' ? 'headerButtons.cmdField' : 'headerButtons.textField')"
      spellcheck="false"
      @keydown.enter="emit('submit')"
    />
  </template>
  <template v-else-if="run === 'open'">
    <select
      :class="SELECT"
      data-testid="header-button-target"
      :value="openKind"
      :aria-label="t('headerButtons.targetField')"
      @change="onSelect($event, 'target')"
    >
      <option v-for="kind in OPEN_TARGET_KINDS" :key="kind" :value="kind">{{ t(`headerButtons.targets.${kind}`) }}</option>
    </select>
    <select
      v-if="openKind === 'view'"
      :class="SELECT"
      data-testid="header-button-view"
      :value="payload"
      :aria-label="t('headerButtons.viewField')"
      @change="onSelect($event, 'payload')"
    >
      <option value="" disabled>{{ t("headerButtons.choose") }}</option>
      <option v-for="view in VIEW_TARGETS" :key="view" :value="view">{{ t(`headerButtons.views.${view}`) }}</option>
    </select>
    <SettingsField
      v-else-if="openTargetTakesValue(openKind)"
      v-model="payloadModel"
      class="min-w-0 flex-auto font-mono"
      data-testid="header-button-payload"
      :placeholder="openKind === 'url' ? 'https://github.com/${repo}' : '${dir}/docs'"
      :aria-label="t(`headerButtons.targets.${openKind}`)"
      spellcheck="false"
      @keydown.enter="emit('submit')"
    />
  </template>
  <select
    v-else
    :class="[SELECT, 'min-w-0 flex-auto']"
    data-testid="header-button-action"
    :value="payload"
    :aria-label="t('headerButtons.actionField')"
    @change="onSelect($event, 'payload')"
  >
    <option value="" disabled>{{ t("headerButtons.choose") }}</option>
    <option v-for="action in ACTIONS" :key="action" :value="action">{{ t(keymapLabelKey(action)) }}</option>
  </select>
</template>
