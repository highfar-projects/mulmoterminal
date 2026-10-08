<script setup lang="ts">
// The pictures and sounds of one directory in the Settings form (#2726): its icon, its terminal
// background, and its attention sounds — one for every kind, then one per kind over it. Each row says
// what its key should become; the form saves it and redraws this from the answer.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { DirFormKey } from "../../../common/dirConfigForm";
import { NOTIFY_KINDS, type NotifyKind } from "../../../common/notifyKinds";
import { soundsFromValue, withDirKindSound } from "../dirMedia";
import { editForSet } from "../dirSettingsFormFields";
import DirBackgroundField from "./DirBackgroundField.vue";
import DirFormKeyActions from "./DirFormKeyActions.vue";
import DirIconField from "./DirIconField.vue";
import DirSoundChoice from "./DirSoundChoice.vue";
import type { DirSectionEmits, DirSectionProps } from "./dirFormContracts";
import { useDirFormKeys } from "./useDirFormKeys";

const props = defineProps<DirSectionProps>();
const emit = defineEmits<DirSectionEmits>();
const { t } = useI18n();

const { values, isSet, isLocal } = useDirFormKeys(() => props.detail);
const clear = (key: DirFormKey) => emit("save", { set: {}, unset: [key] });

const sound = computed(() => (typeof values.value.sound === "string" ? values.value.sound : ""));
const sounds = computed(() => soundsFromValue(values.value.sounds));

const onSound = (next: string) => emit("save", next === "" ? { set: {}, unset: ["sound"] } : { set: { sound: next }, unset: [] });
const onKindSound = (kind: NotifyKind, next: string) => emit("save", editForSet("sounds", withDirKindSound(sounds.value, kind, next)));

const LABEL = "text-[12px] text-dim";
const ROW = "flex min-w-0 items-center gap-1.5";
</script>

<template>
  <div class="mt-2 grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1" data-testid="dir-form-media">
    <label for="dir-form-icon" :class="LABEL">{{ t("dirSettingsForm.fields.icon") }}</label>
    <div :class="ROW" data-testid="dir-form-row-icon">
      <DirIconField :value="values.icon" :saving="saving" @change="(edit) => emit('save', edit)" />
      <DirFormKeyActions
        form-key="icon"
        :is-set="isSet('icon')"
        :is-local="isLocal('icon')"
        :saving="saving"
        @clear="clear('icon')"
        @move="(to) => emit('move', 'icon', to)"
      />
    </div>

    <label for="dir-form-backgroundImage" class="self-start text-[12px] text-dim">{{ t("dirSettingsForm.fields.backgroundImage") }}</label>
    <div :class="ROW" data-testid="dir-form-row-backgroundImage">
      <DirBackgroundField class="flex-auto" :value="values.backgroundImage" :saving="saving" @change="(edit) => emit('save', edit)" />
      <DirFormKeyActions
        class="self-start"
        form-key="backgroundImage"
        :is-set="isSet('backgroundImage')"
        :is-local="isLocal('backgroundImage')"
        :saving="saving"
        @clear="clear('backgroundImage')"
        @move="(to) => emit('move', 'backgroundImage', to)"
      />
    </div>

    <label for="dir-form-sound" :class="LABEL">{{ t("dirSettingsForm.fields.sound") }}</label>
    <div :class="ROW" data-testid="dir-form-row-sound">
      <DirSoundChoice input-id="dir-form-sound" :value="sound" :saving="saving" :unset-label="t('dirSettingsForm.themeGlobal')" @change="onSound" />
      <DirFormKeyActions
        form-key="sound"
        :is-set="isSet('sound')"
        :is-local="isLocal('sound')"
        :saving="saving"
        @clear="clear('sound')"
        @move="(to) => emit('move', 'sound', to)"
      />
    </div>

    <span class="self-start text-[12px] text-dim">{{ t("dirSettingsForm.fields.sounds") }}</span>
    <div class="flex min-w-0 flex-col gap-1" data-testid="dir-form-row-sounds">
      <span :class="ROW">
        <span class="text-[11px] text-dim">{{ t("dirSettingsForm.sound.perKindHint") }}</span>
        <DirFormKeyActions
          form-key="sounds"
          :is-set="isSet('sounds')"
          :is-local="isLocal('sounds')"
          :saving="saving"
          @clear="clear('sounds')"
          @move="(to) => emit('move', 'sounds', to)"
        />
      </span>
      <span v-for="kind in NOTIFY_KINDS" :key="kind" :class="ROW" :data-kind="kind">
        <label :for="`dir-form-sounds-${kind}`" class="w-28 flex-none text-[11px] text-dim">{{ t(`settings.sounds.kinds.${kind}`) }}</label>
        <DirSoundChoice
          :input-id="`dir-form-sounds-${kind}`"
          :value="sounds[kind] ?? ''"
          :saving="saving"
          :unset-label="t('dirSettingsForm.sound.sameAsAll')"
          @change="(next) => onKindSound(kind, next)"
        />
      </span>
    </div>
  </div>
</template>
