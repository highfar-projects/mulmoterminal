<script setup lang="ts">
// Every grid action by name, with the key it is bound to (#2266) — the way to an action for someone
// who has not written a keymap, and the place to learn which keys they have. The look and the keys
// follow the file finder's (FileFinder.vue), and so does the matching (filePathMatch).
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { KeymapAction } from "../../common/keymap";
import { activeKeymap } from "../composables/activeKeymap";
import { closeCommandPalette, paletteHost, paletteTerminals } from "../composables/commandPalette";
import { paletteRows, rowKey } from "../composables/commandPaletteRows";
import { SCREEN_OPENERS } from "../composables/paletteScreenOpeners";
import { SCREEN_LABEL_KEYS, visibleScreens } from "../composables/paletteScreens";
import { useGatedEntries } from "../composables/useGatedEntries";
import { openSettingsAt } from "../composables/settingsOpener";
import { fetchVoiceInputStatus } from "../composables/voiceModelStatus";
import { SETTINGS_TABS } from "./settings/settingsTabs";
import { useSettingsTabLabel } from "./settings/useSettingsTabLabel";
import { usePaletteChoices } from "../composables/usePaletteChoices";
import { usePaletteCollectionActions } from "../composables/usePaletteCollectionActions";
import { openCellAt, openTerminalAt } from "../composables/useNewTerminal";
import { useAppConfig } from "../composables/useAppConfig";
import { usePaletteResumes } from "../composables/usePaletteResumes";
import { usePaletteWikiPages } from "../composables/usePaletteWikiPages";
import { usePaletteGithubItems } from "../composables/usePaletteGithubItems";
import { wikiGotoPage } from "../composables/useWikiBrowse";
import { seedFilesPanel, takeFilesPanelSeed, type SeededFilesPanel } from "../composables/filesPanelSeed";
import { cellForPaletteResume, type PaletteResume } from "../composables/paletteResumes";
import { asTerminalAgent } from "../../common/sessionAgent";
import { relativeTime } from "./cellDisplay";
import { cellForPaletteStart, paletteStarts, type PaletteStart } from "../composables/paletteStarts";
import { launchAgentPick } from "../composables/launchAgentPick";
import { paletteLaunchAgent } from "../composables/paletteLaunchDirs";
import { paletteCollectionActionList } from "../composables/paletteCollectionActionList";
import { paletteHeaderEntriesFor } from "../composables/paletteHeaderEntries";
import { findHeaderButton, paletteCommandList } from "../composables/paletteCommandList";
import IconGlyph from "./IconGlyph.vue";
import { keymapLabelKey } from "./keymapLabels";

const { t } = useI18n();
const query = ref("");
const active = ref(0);
const input = useTemplateRef<HTMLInputElement>("input");
const listEl = useTemplateRef<HTMLElement>("listEl");
const gated = useGatedEntries();
const settingsTabLabel = useSettingsTabLabel();
const choices = usePaletteChoices();
const collectionActions = usePaletteCollectionActions();
// A new terminal starts next to the one commands act on, running the default agent (#2484). Through
// launchAgentPick, which follows the setting when it arrives late over HTTP.
const launchPick = launchAgentPick();
function launchAt(path: string): void {
  const uid = paletteTerminals.value?.current() ?? null;
  openTerminalAt(path, uid === null ? null : `cell-${uid}`, paletteLaunchAgent(launchPick.pick.value));
}
// An agent or a launcher starts in the acting terminal's directory, beside it (#2487).
const appConfig = useAppConfig();
const starts = computed(() => paletteStarts(appConfig.customAgents.value, appConfig.launchers.value));
function startHere(start: PaletteStart): void {
  const dir = paletteTerminals.value?.startDir() ?? null;
  if (dir === null) return;
  const uid = paletteTerminals.value?.current() ?? null;
  openCellAt(cellForPaletteStart(start, dir.path), uid === null ? null : `cell-${uid}`);
}
// The acting directory's past conversations, in the default agent's history: a custom agent runs
// Claude Code and a shell keeps none, so both read Claude's (#2498).
const resumeAgent = computed(() => asTerminalAgent(launchPick.pick.value));
const { resumes, recheck } = usePaletteResumes({
  dir: () => paletteTerminals.value?.startDir()?.path ?? null,
  agent: () => resumeAgent.value,
  openSessionIds: () => paletteTerminals.value?.openSessionIds() ?? [],
});
async function resumeHere(resume: PaletteResume): Promise<void> {
  if (actionPending) return;
  actionPending = true;
  actionError.value = null;
  try {
    const fresh = await recheck(resume);
    if (fresh === null) {
      actionError.value = t("commandPalette.resumeTaken");
      return;
    }
    closeCommandPalette();
    const uid = paletteTerminals.value?.current() ?? null;
    openCellAt(cellForPaletteResume(fresh, resumeAgent.value), uid === null ? null : `cell-${uid}`);
  } finally {
    actionPending = false;
  }
}
// `/` and `#`: the Files pane's own finder or search opens with what was typed already in it.
function handOff(action: SeededFilesPanel, query: string): void {
  seedFilesPanel(action, query);
  paletteHost.value?.run(action);
  // The grid took it synchronously if it ran the action; what is left was refused.
  takeFilesPanelSeed(action);
}
// The configured repos' open PRs and Issues, where the GitHub view is offered (#2517).
const { items: githubItems } = usePaletteGithubItems({ offered: () => gated.value.prs, repos: () => appConfig.prRepos.value.join("\n") });
// The Wiki's pages, read afresh each time the palette opens (#2503).
const { pages: wikiPages } = usePaletteWikiPages();
// The header buttons and commands of the terminal a command acts on (#2465).
const targetEntries = computed(() => {
  const uid = paletteTerminals.value?.current() ?? null;
  return uid === null ? null : paletteHeaderEntriesFor(`cell-${uid}`);
});
const commands = computed(() =>
  targetEntries.value
    ? paletteCommandList(targetEntries.value.buttons(), targetEntries.value.commands(), {
        fromHeader: t("commandPalette.fromHeader"),
        fromCommands: t("commandPalette.fromCommands"),
      })
    : [],
);
function runCommand(id: string): void {
  const entries = targetEntries.value;
  const button = entries ? findHeaderButton([...entries.commands(), ...entries.buttons()], id) : null;
  if (entries && button) entries.run(button);
}
// Settings hides its Voice section on a machine that cannot transcribe, so the palette does too —
// asked the same way Settings asks, once per opening.
const voiceCapable = ref(false);
onMounted(async () => {
  voiceCapable.value = (await fetchVoiceInputStatus())?.capable ?? false;
});
const settingsTabs = computed(() => SETTINGS_TABS.filter((tab) => tab !== "voice" || voiceCapable.value));

// The description's key is the label's last segment, so a new action cannot have one without the
// other: the label table is a full Record over the actions.
const descriptionKey = (action: KeymapAction): string => `commandPalette.descriptions.${keymapLabelKey(action).split(".").pop() ?? ""}`;

const rows = computed(() =>
  paletteRows(
    query.value,
    activeKeymap.value,
    {
      zoomed: paletteHost.value?.zoomed() ?? false,
      available: paletteHost.value?.available() ?? false,
      manualOrder: paletteHost.value?.manualOrder() ?? false,
      filesOpen: paletteHost.value?.filesOpen() ?? false,
    },
    {
      label: (action) => t(keymapLabelKey(action)),
      description: (action) => t(descriptionKey(action)),
      needsEnlarged: t("commandPalette.needsEnlarged"),
      needsNothingEnlarged: t("commandPalette.needsNothingEnlarged"),
      needsManualOrder: t("commandPalette.needsManualOrder"),
      needsFilesPane: t("commandPalette.needsFilesPane"),
      gridHidden: t("commandPalette.gridHidden"),
      screenLabel: (screen) => t(SCREEN_LABEL_KEYS[screen]),
      screenDescription: (screen) => t("commandPalette.openScreen", { name: t(SCREEN_LABEL_KEYS[screen]) }),
      settingsLabel: settingsTabLabel,
      openInSettings: t("commandPalette.openInSettings"),
      fromCollection: t("commandPalette.fromCollection"),
      newTerminalIn: (dir) => t("commandPalette.newTerminalIn", { dir }),
      launchDetail: t("commandPalette.launchDetail", { agent: paletteLaunchAgent(launchPick.pick.value) }),
      gridFull: t("commandPalette.gridFull"),
      startAgent: (agent) => t("commandPalette.startAgent", { agent }),
      runLauncher: (label) => t("commandPalette.runLauncher", { label }),
      startDetail: (dir) => t("commandPalette.startDetail", { dir }),
      resumeLabel: (title) => t("commandPalette.resumeLabel", { title }),
      wikiPage: (title) => t("commandPalette.wikiPage", { title }),
      wikiDetail: t("commandPalette.wikiDetail"),
      githubItem: (kind, number, title) => t(kind === "pr" ? "commandPalette.githubPr" : "commandPalette.githubIssue", { number, title }),
      handoff: (action, query) => t(action === "files-find" ? "commandPalette.findFilesNamed" : "commandPalette.searchFilesFor", { query }),
      resumeDetail: ({ mtime, account }) => [relativeTime(mtime, Date.now()), account].filter((part) => part !== null).join(" · "),
      currentChoice: t("commandPalette.choices.current"),
      switchChoice: t("commandPalette.choices.switch"),
      scopeLabel: (kind) => t(`commandPalette.scopes.${kind}`),
    },
    {
      screens: visibleScreens(gated.value),
      terminals: paletteTerminals.value?.list() ?? [],
      settings: settingsTabs.value,
      choices: choices.choices.value,
      commands: commands.value,
      collectionActions: paletteCollectionActionList(collectionActions.groups.value),
      launchDirs: paletteTerminals.value?.launchDirs() ?? [],
      starts: starts.value,
      startDir: paletteTerminals.value?.startDir()?.label ?? null,
      resumes: resumes.value,
      wikiPages: wikiPages.value,
      githubItems: githubItems.value,
      gridFull: paletteTerminals.value?.full() ?? false,
    },
  ),
);

watch(query, () => {
  active.value = 0;
  if (listEl.value) listEl.value.scrollTop = 0;
});

// The list scrolls, and a row the arrows reach below its edge would be picked by Enter unseen.
watch(active, (index) => {
  listEl.value?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
});

/** Run the row, if it can run now. A disabled row keeps the palette open, with its reason on it. */
function pick(index: number): void {
  const row = rows.value[index];
  if (!row || row.disabledReason !== null) return;
  // A symbol narrows the search rather than running anything: the palette stays open on it.
  if (row.kind === "prefix") {
    query.value = row.symbol;
    input.value?.focus();
    return;
  }
  // A collection action can fail on the server: the palette stays open to say so.
  if (row.kind === "collection") {
    void runCollectionAction(row.slug, row.id);
    return;
  }
  // A resume is checked against a fresh list first, and says so here when the row was taken.
  if (row.kind === "resume") {
    void resumeHere(row.resume);
    return;
  }
  closeCommandPalette();
  if (row.kind === "screen") SCREEN_OPENERS[row.screen]();
  else if (row.kind === "terminal") paletteTerminals.value?.goTo(row.uid);
  else if (row.kind === "settings") openSettingsAt(row.tab);
  else if (row.kind === "choice") choices.apply(row.id);
  else if (row.kind === "command") runCommand(row.id);
  else if (row.kind === "launch") launchAt(row.path);
  else if (row.kind === "start") startHere(row.start);
  else if (row.kind === "wiki") wikiGotoPage(row.slug);
  else if (row.kind === "github") window.open(row.item.url, "_blank", "noopener,noreferrer");
  else if (row.kind === "handoff") handOff(row.action, row.query);
  else paletteHost.value?.run(row.action);
}

const actionError = ref<string | null>(null);
// The palette stays open while an action runs, so a second Enter would run it again: one at a time,
// as the collection's own button does.
let actionPending = false;
async function runCollectionAction(slug: string, id: string): Promise<void> {
  if (actionPending) return;
  actionPending = true;
  actionError.value = null;
  try {
    const error = await collectionActions.run(slug, id);
    if (error === null) closeCommandPalette();
    else actionError.value = error;
  } finally {
    actionPending = false;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return; // an IME candidate list owns Enter and the arrows while composing
  if (e.key === "Escape") {
    e.preventDefault();
    closeCommandPalette();
  } else if (e.key === "Enter") {
    e.preventDefault();
    pick(active.value);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const count = rows.value.length;
    if (count > 0) active.value = (active.value + (e.key === "ArrowDown" ? 1 : count - 1)) % count;
  }
}

onMounted(() => input.value?.focus());
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[80] font-sans" data-testid="command-palette-backdrop" @click.self="closeCommandPalette">
      <div
        data-testid="command-palette"
        class="absolute left-1/2 top-12 w-[min(600px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-panel shadow-xl"
        role="dialog"
        :aria-label="t('commandPalette.open')"
        @keydown="onKeydown"
      >
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <span class="material-symbols-outlined flex-none text-[18px] text-dim" aria-hidden="true">keyboard_command_key</span>
          <input
            ref="input"
            v-model="query"
            data-testid="command-palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            :aria-activedescendant="rows.length > 0 ? `command-palette-row-${active}` : undefined"
            :placeholder="t('commandPalette.placeholder')"
            class="min-w-0 flex-auto border-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-dim"
          />
          <button
            type="button"
            class="h-[22px] flex-none cursor-pointer rounded border-0 bg-transparent px-1 text-dim hover:text-fg"
            :aria-label="t('commandPalette.close')"
            @click="closeCommandPalette"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </div>
        <p v-if="rows.length === 0" data-testid="command-palette-empty" class="px-3 py-2 text-[12px] text-muted">{{ t("commandPalette.empty") }}</p>
        <ul v-else id="command-palette-list" ref="listEl" role="listbox" class="max-h-[360px] overflow-auto py-1">
          <li
            v-for="(row, index) in rows"
            :id="`command-palette-row-${index}`"
            :key="rowKey(row)"
            :data-index="index"
            data-testid="command-palette-row"
            :data-action="rowKey(row)"
            role="option"
            :aria-selected="index === active"
            :aria-disabled="row.disabledReason !== null"
            class="flex cursor-pointer items-center gap-3 px-3 py-1.5"
            :class="[index === active ? 'bg-hover' : '', row.disabledReason !== null ? 'cursor-default opacity-50' : '']"
            @pointerenter="active = index"
            @click="pick(index)"
          >
            <IconGlyph
              v-if="row.kind !== 'action'"
              :icon="row.icon"
              material-class="flex-none text-[18px] text-dim"
              github-class="flex-none text-[16px] text-dim"
            />
            <span class="min-w-0 flex-auto">
              <span class="block truncate text-[13px] text-fg">
                <span v-for="(part, at) in row.label" :key="at" :class="part.hit ? 'font-bold text-accent' : ''">{{ part.text }}</span>
              </span>
              <span class="block truncate text-[11px] text-dim">{{ row.disabledReason ?? row.description }}</span>
            </span>
            <code
              v-if="row.kind === 'action' && row.binding"
              class="flex-none rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg"
              >{{ row.binding }}</code
            >
            <span v-else-if="row.kind === 'action'" class="flex-none text-[11px] text-muted">{{ t("commandPalette.notSet") }}</span>
          </li>
        </ul>
        <p v-if="actionError" data-testid="command-palette-error" role="alert" class="border-t border-border px-3 py-1.5 text-[11px] text-warn">
          {{ actionError }}
        </p>
        <p v-else class="border-t border-border px-3 py-1.5 text-[11px] text-muted">{{ t("commandPalette.hint") }}</p>
      </div>
    </div>
  </Teleport>
</template>
