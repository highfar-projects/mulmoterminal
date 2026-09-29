<script setup lang="ts">
// Starting a build: where it goes, which template, and the template's interview. Nothing starts until
// every question that applies is answered — the first step writes the spec from these answers, and a
// gap here is a guess there.
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  listKnownFolders,
  listPacks,
  listPresets,
  previewPair,
  startRun,
  suggestFolder,
  type PackList,
  type PairPreview,
} from "../../composables/blueprintsApi";
import type { PresetListing } from "../../../common/blueprint/presets";
import { askedQuestions, unansweredQuestions, type HearingAnswer, type HearingAnswers } from "../../../common/blueprint/hearing";
import { basePacks, presetGroups, usecasesFor } from "./blueprintView";
import { latestOnly } from "./latestOnly";
import { failureText } from "./refusalText";
import { keepFormFill, takeFormFill, type FormFill } from "../../composables/useBlueprintsView";
import { openTerminalAt } from "../../composables/useNewTerminal";
import BlueprintHearingField from "./BlueprintHearingField.vue";

const emit = defineEmits<{ started: [runId: string] }>();
const { t } = useI18n();

const packs = ref<PackList>([]);
const base = ref("");
const usecase = ref("");
const preview = ref<PairPreview | null>(null);
const answers = ref<HearingAnswers>({});
const projectDir = ref("");
// The new folder the form offered; its note shows only while the field still holds it.
const suggestedDir = ref<string | null>(null);
const error = ref<string | null>(null);
const starting = ref(false);
const previews = latestOnly();
const suggestions = latestOnly();
const presets = ref<PresetListing[]>([]);
// Folders to pick instead of typing a path; none when they could not be read, and the field still takes any path.
const knownFolders = ref<string[]>([]);
// A chosen example waits here until its pair's interview has loaded: loading a pair clears the
// answers, so filling them any earlier would have them wiped.
const pendingPreset = ref<PresetListing | null>(null);
// The example whose answers are in the form. A pair changed by hand drops it, and with it its sample documents.
const appliedPreset = ref<PresetListing | null>(null);
// A form filled in advance — a finished build's next step, or this form as the person left it to trust its folder: it
// waits, as an example does, for its pair's interview, and then fills the folder and the answers. Taken once, on open.
const pendingFill = ref<FormFill | null>(takeFormFill());
const appliedFill = ref<FormFill | null>(null);
const filledNote = useTemplateRef<HTMLElement>("filledNote");
// Where to answer Claude Code's trust prompt, when the last start was refused for want of it.
const trustIn = ref<string | null>(null);

const bases = computed(() => basePacks(packs.value));
const usecases = computed(() => usecasesFor(packs.value, base.value));
const exampleGroups = computed(() => presetGroups(presets.value, packs.value));
const questions = computed(() => (preview.value ? askedQuestions(preview.value.hearing, answers.value) : []));
const ready = computed(
  () => !starting.value && projectDir.value.trim() !== "" && preview.value !== null && unansweredQuestions(preview.value.hearing, answers.value).length === 0,
);

async function loadKnownFolders(): Promise<void> {
  const known = await listKnownFolders();
  if (known.ok) knownFolders.value = known.value.folders;
}

onMounted(async () => {
  void loadKnownFolders();
  const listed = await listPresets();
  if (listed.ok) presets.value = listed.value.presets;
  const result = await listPacks();
  if (!result.ok) {
    error.value = failureText(t, result);
    return;
  }
  packs.value = result.value.packs;
  const fill = pendingFill.value;
  if (fill && !base.value) {
    projectDir.value = fill.projectDir;
    base.value = fill.base;
  }
  // Only when nothing was chosen yet: an example picked while this loaded must not be overwritten.
  if (!base.value) base.value = bases.value[0]?.slug ?? "";
});

watch(base, (baseSlug) => {
  const waiting = pendingPreset.value ?? pendingFill.value;
  usecase.value = waiting?.base === baseSlug ? waiting.usecase : (usecases.value[0]?.slug ?? "");
});

function usePreset(preset: PresetListing): void {
  pendingPreset.value = preset;
  appliedPreset.value = null;
  pendingFill.value = null;
  void suggestFor(preset);
  // The same pair raises no watch, so its interview is read again here and the answers fill in then.
  if (base.value === preset.base && usecase.value === preset.usecase) {
    void loadPreview(preset.base, preset.usecase);
    return;
  }
  base.value = preset.base;
  usecase.value = preset.usecase;
}

// An example needs a folder of its own; when none is typed yet, offer a new one the server found a trusted place for.
async function suggestFor(preset: PresetListing): Promise<void> {
  // Taken first: a later example outdates this one's answer even when the field is no longer empty.
  const ticket = suggestions.take();
  if (projectDir.value.trim() !== "" && projectDir.value !== suggestedDir.value) return;
  // An earlier example's folder, still as the form put it, is not this example's: it goes rather than stay labelled as one.
  projectDir.value = "";
  suggestedDir.value = null;
  const result = await suggestFolder(preset.id);
  // The example must still be the one being set up: a pair changed by hand meanwhile dropped it.
  const stillThisExample = pendingPreset.value?.id === preset.id || appliedPreset.value?.id === preset.id;
  if (!suggestions.isLatest(ticket) || !stillThisExample || !result.ok || result.value.path === null || projectDir.value.trim() !== "") return;
  projectDir.value = result.value.path;
  suggestedDir.value = result.value.path;
}

function fillFromPreset(): void {
  const preset = pendingPreset.value;
  if (!preset || preset.base !== base.value || preset.usecase !== usecase.value || !preview.value) return;
  answers.value = { ...preset.answers };
  appliedPreset.value = preset;
  pendingPreset.value = null;
}

function fillFromPending(): void {
  const fill = pendingFill.value;
  if (!fill || fill.base !== base.value || fill.usecase !== usecase.value || !preview.value) return;
  answers.value = { ...fill.answers };
  appliedFill.value = fill;
  pendingFill.value = null;
  // The example it was started from comes back with it, so its sample documents are still placed.
  appliedPreset.value = presets.value.find((known) => known.id === fill.preset && known.base === fill.base && known.usecase === fill.usecase) ?? null;
  void revealFilled();
}

// A filled form opens below every example: brought up to what was filled, or the person sees only the examples.
async function revealFilled(): Promise<void> {
  await nextTick();
  filledNote.value?.scrollIntoView({ block: "start" });
}

watch([base, usecase], ([baseSlug, usecaseSlug]) => loadPreview(baseSlug, usecaseSlug));
// A refusal names the folder it was about; another folder typed since is not the one to trust.
watch(projectDir, () => {
  trustIn.value = null;
});

async function loadPreview(baseSlug: string, usecaseSlug: string): Promise<void> {
  // A pair changed by hand drops a waiting example: coming back to its pair later must not refill it.
  const waiting = pendingPreset.value;
  if (waiting && (waiting.base !== baseSlug || waiting.usecase !== usecaseSlug)) pendingPreset.value = null;
  const filling = pendingFill.value;
  if (filling && (filling.base !== baseSlug || filling.usecase !== usecaseSlug)) pendingFill.value = null;
  appliedPreset.value = null;
  appliedFill.value = null;
  preview.value = null;
  answers.value = {};
  error.value = null;
  // Taken before the guard: an empty pair must still outdate the preview it replaces.
  const ticket = previews.take();
  if (!baseSlug || !usecaseSlug) return;
  const result = await previewPair(baseSlug, usecaseSlug);
  if (!previews.isLatest(ticket)) return;
  preview.value = result.ok ? result.value : null;
  error.value = result.ok ? null : failureText(t, result);
  fillFromPreset();
  fillFromPending();
}

function setAnswer(id: string, answer: HearingAnswer | undefined): void {
  const others = Object.fromEntries(Object.entries(answers.value).filter(([key]) => key !== id));
  answers.value = answer === undefined ? others : { ...others, [id]: answer };
}

async function start(): Promise<void> {
  if (!ready.value) return;
  starting.value = true;
  const preset = appliedPreset.value?.id;
  const result = await startRun({
    projectDir: projectDir.value.trim(),
    base: base.value,
    usecase: usecase.value,
    answers: answers.value,
    ...(preset === undefined ? {} : { preset }),
  });
  starting.value = false;
  trustIn.value = !result.ok && result.refusal?.code === "untrusted" ? result.refusal.trustIn : null;
  if (!result.ok) {
    error.value = failureText(t, result);
    return;
  }
  error.value = null;
  emit("started", result.value.runId);
}

// The prompt is the person's to answer, in a terminal of their own; the form waits for them with everything in it.
function openToTrust(): void {
  if (trustIn.value === null) return;
  const preset = appliedPreset.value?.id;
  keepFormFill({
    base: base.value,
    usecase: usecase.value,
    answers: answers.value,
    projectDir: projectDir.value,
    ...(preset === undefined ? {} : { preset }),
  });
  openTerminalAt(trustIn.value, null, "claude");
}
</script>

<template>
  <form class="flex max-w-[760px] flex-col gap-5 p-5" data-testid="blueprint-new-form" @submit.prevent="start">
    <h2 class="m-0 font-sans text-[16px] font-[650] text-fg">{{ t("blueprints.form.title") }}</h2>

    <section v-if="presets.length" class="flex flex-col gap-2" data-testid="blueprint-presets">
      <h3 class="m-0 font-sans text-[13px] font-[650] text-fg">{{ t("blueprints.form.presets") }}</h3>
      <div v-for="group in exampleGroups" :key="group.base" class="flex flex-col gap-1.5" data-testid="blueprint-preset-group">
        <h4 class="m-0 font-sans text-[12px] font-[650] text-secondary">{{ group.title }}</h4>
        <div class="flex flex-wrap gap-2">
          <article
            v-for="preset in group.presets"
            :key="`${preset.usecase}/${preset.id}`"
            class="flex max-w-[360px] flex-col gap-1.5 rounded-md border border-border bg-panel p-3"
            data-testid="blueprint-preset"
          >
            <span class="font-sans text-[13px] font-[650] text-fg">{{ preset.title }}</span>
            <span class="font-sans text-[12px] text-secondary">{{ preset.description }}</span>
            <div>
              <button
                type="button"
                data-testid="blueprint-preset-use"
                class="cursor-pointer rounded-[4px] border border-border bg-base px-3 py-1 font-sans text-[12px] text-fg hover:bg-hover"
                @click="usePreset(preset)"
              >
                {{ t("blueprints.form.presetUse") }}
              </button>
            </div>
          </article>
        </div>
      </div>
      <p v-if="appliedPreset" class="m-0 font-sans text-[12px] text-ok" data-testid="blueprint-preset-applied">
        {{ t("blueprints.form.presetApplied", { title: appliedPreset.title }) }}
      </p>
      <p v-if="appliedPreset?.samples.length" class="m-0 font-sans text-[12px] text-secondary" data-testid="blueprint-preset-samples">
        {{ t("blueprints.form.presetSamples", { files: appliedPreset.samples.join(", ") }) }}
      </p>
    </section>

    <div v-if="appliedFill" ref="filledNote">
      <p v-if="appliedFill.after" class="m-0 font-sans text-[12px] text-ok" data-testid="blueprint-follow-up">
        {{ t("blueprints.form.followUp", { title: appliedFill.after }) }}
      </p>
      <p v-else class="m-0 font-sans text-[12px] text-ok" data-testid="blueprint-form-restored">
        {{ t("blueprints.form.restored") }}
      </p>
    </div>

    <div class="flex flex-col gap-1">
      <label for="blueprint-project-dir" class="font-sans text-[13px] text-fg">{{ t("blueprints.form.projectDir") }}</label>
      <input
        id="blueprint-project-dir"
        v-model="projectDir"
        data-testid="blueprint-project-dir"
        class="w-full rounded-[4px] border border-border bg-input px-2 py-1.5 font-mono text-[12px] text-fg"
        spellcheck="false"
        list="blueprint-known-folders"
        :placeholder="knownFolders.length > 0 ? t('blueprints.form.projectDirPick') : ''"
      />
      <datalist id="blueprint-known-folders" data-testid="blueprint-known-folders">
        <option v-for="folder in knownFolders" :key="folder" :value="folder"></option>
      </datalist>
      <p
        v-if="appliedPreset !== null && suggestedDir !== null && projectDir === suggestedDir"
        class="m-0 font-sans text-[12px] text-ok"
        data-testid="blueprint-folder-suggested"
      >
        {{ t("blueprints.form.folderSuggested") }}
      </p>
      <p class="m-0 font-sans text-[11px] text-dim">{{ t("blueprints.form.projectDirHint") }}</p>
    </div>

    <div class="flex flex-wrap gap-4">
      <label class="flex flex-col gap-1 font-sans text-[13px] text-fg">
        {{ t("blueprints.form.base") }}
        <select v-model="base" data-testid="blueprint-base" class="min-w-[200px] rounded-[4px] border border-border bg-input px-2 py-1.5 text-[12px] text-fg">
          <option v-for="pack in bases" :key="pack.slug" :value="pack.slug">{{ pack.manifest.title }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 font-sans text-[13px] text-fg">
        {{ t("blueprints.form.usecase") }}
        <select
          v-model="usecase"
          data-testid="blueprint-usecase"
          class="min-w-[200px] rounded-[4px] border border-border bg-input px-2 py-1.5 text-[12px] text-fg"
        >
          <option v-for="pack in usecases" :key="pack.slug" :value="pack.slug">{{ pack.manifest.title }}</option>
        </select>
      </label>
    </div>
    <p v-if="base && !usecases.length" class="m-0 font-sans text-[12px] text-dim">{{ t("blueprints.form.noUsecase") }}</p>

    <template v-if="preview">
      <fieldset class="m-0 flex flex-col gap-4 border-0 p-0">
        <legend class="mb-3 font-sans text-[14px] font-[650] text-fg">{{ t("blueprints.form.questions") }}</legend>
        <BlueprintHearingField
          v-for="question in questions"
          :key="question.id"
          :question="question"
          :answer="answers[question.id]"
          :project-dir="projectDir"
          @update="(answer) => setAnswer(question.id, answer)"
        />
      </fieldset>

      <details class="font-sans text-[12px] text-secondary">
        <summary class="cursor-pointer">{{ t("blueprints.form.steps") }}</summary>
        <ol class="m-0 mt-2 pl-5">
          <li v-for="step in preview.steps" :key="step.id" class="mb-0.5">{{ step.title }}</li>
        </ol>
      </details>
    </template>

    <p v-if="error" data-testid="blueprint-new-error" class="m-0 font-sans text-[12px] text-err-text">{{ error }}</p>
    <div v-if="error && trustIn" class="flex flex-col items-start gap-1" data-testid="blueprint-trust">
      <button
        type="button"
        data-testid="blueprint-open-trust"
        class="flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-base px-3 py-1.5 font-sans text-[13px] text-fg hover:bg-hover"
        @click="openToTrust"
      >
        <span class="material-symbols-outlined text-[16px]" aria-hidden="true">terminal</span>
        {{ t("blueprints.form.openToTrust") }}
      </button>
      <p class="m-0 font-sans text-[11px] text-dim">{{ t("blueprints.form.openToTrustHint", { dir: trustIn }) }}</p>
    </div>

    <div>
      <button
        type="submit"
        data-testid="blueprint-start"
        class="cursor-pointer rounded-[4px] border-none bg-accent px-4 py-1.5 font-sans text-[13px] text-on-accent hover:bg-accent-bg-hover disabled:cursor-default disabled:opacity-40"
        :disabled="!ready"
      >
        {{ starting ? t("blueprints.form.starting") : t("blueprints.form.start") }}
      </button>
    </div>
  </form>
</template>
