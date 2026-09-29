<script setup lang="ts">
// What a finished build may go on to in the same folder (a house style, then writing with it): each opens the
// new-build form with the folder and the answers filled in, so the person only reads and presses Start.
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { listPacks, type PackList } from "../../composables/blueprintsApi";
import { blueprintsViewFollowUp } from "../../composables/useBlueprintsView";
import { nextOptions, usecaseTitle, type NextOption } from "./nextSteps";
import type { HearingAnswers } from "../../../common/blueprint/hearing";

// `answers`: the finished build's own, for the steps that carry some of them over.
const props = defineProps<{ pair: { base: string; usecase: string }; projectDir: string; answers: HearingAnswers }>();
const { t } = useI18n();

const packs = ref<PackList>([]);
const options = ref<NextOption[]>([]);

onMounted(async () => {
  const result = await listPacks();
  if (!result.ok) return;
  packs.value = result.value.packs;
  options.value = nextOptions(result.value.packs, props.pair, props.answers);
});

function goOn(option: NextOption): void {
  blueprintsViewFollowUp({
    base: props.pair.base,
    usecase: option.usecase,
    answers: option.answers,
    projectDir: props.projectDir,
    after: usecaseTitle(packs.value, props.pair.usecase),
  });
}
</script>

<template>
  <section v-if="options.length" class="flex flex-col gap-2" data-testid="blueprint-next-steps">
    <h3 class="m-0 font-sans text-[13px] font-[650] text-fg">{{ t("blueprints.run.nextSteps") }}</h3>
    <p class="m-0 font-sans text-[12px] text-secondary">{{ t("blueprints.run.nextStepsHint") }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in options"
        :key="option.usecase"
        type="button"
        data-testid="blueprint-next-step"
        class="flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-base px-3 py-1.5 font-sans text-[12px] text-fg hover:bg-hover"
        @click="goOn(option)"
      >
        <span class="material-symbols-outlined text-[15px]" aria-hidden="true">arrow_forward</span>{{ option.title }}
      </button>
    </div>
  </section>
</template>
