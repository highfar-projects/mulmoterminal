<script setup lang="ts">
// One directory's header in the Settings form (#2727): its buttons, its chips and its command-palette
// entries, each with the editor the global lists use, pointed at this directory's file.
import { useI18n } from "vue-i18n";
import type { DirConfigDetailView } from "../dirConfigDetail";
import DirButtonsScope from "./DirButtonsScope.vue";
import DirChipsScope from "./DirChipsScope.vue";

defineProps<{ path: string; detail: DirConfigDetailView }>();
const emit = defineEmits<{ (e: "saved", detail: DirConfigDetailView): void }>();
const { t } = useI18n();

const HEADING = "m-0 mt-3 text-[12px] text-fg";
</script>

<template>
  <section class="mt-3 border-t border-border pt-2" data-testid="dir-form-header">
    <p class="m-0 text-[12px] font-semibold text-fg">{{ t("dirSettingsForm.header.title") }}</p>
    <div data-testid="dir-form-row-buttons">
      <p :class="HEADING">{{ t("dirSettingsForm.header.buttons") }} (<code>buttons</code>)</p>
      <DirButtonsScope :path="path" :detail="detail" list="buttons" @saved="(next) => emit('saved', next)" />
    </div>
    <div data-testid="dir-form-row-chips">
      <p :class="HEADING">{{ t("dirSettingsForm.header.chips") }} (<code>chips</code>)</p>
      <DirChipsScope :path="path" :detail="detail" @saved="(next) => emit('saved', next)" />
    </div>
    <div data-testid="dir-form-row-commands">
      <p :class="HEADING">{{ t("dirSettingsForm.header.commands") }} (<code>commands</code>)</p>
      <DirButtonsScope :path="path" :detail="detail" list="commands" @saved="(next) => emit('saved', next)" />
    </div>
  </section>
</template>
