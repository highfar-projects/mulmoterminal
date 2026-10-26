<script setup lang="ts">
// Bot jobs (plans/feat-bot-gpu-jobs.md): whether a remote bot's Python may run here, with which
// interpreter, and the tokens such a bot holds. A token is minted for this machine's mobile-remote
// connection, so minting waits for that connection; its secret is shown here once and never again.
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { botJobsSetting, saveBotJobs } from "../../composables/botJobs";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";
import { listBotTokens, mintBotToken, remoteHostConnected, revokeBotToken, type BotEndpoints, type BotTokenRow, type MintedBotToken } from "./botJobTokensApi";
import type { BundledSkillName } from "../../../common/bundledSkills";

const emit = defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();
const { t } = useI18n();

const saving = ref(false);
const error = ref<string | null>(null);

async function save(next: { enabled: boolean; python: string }): Promise<void> {
  saving.value = true;
  const ok = await saveBotJobs(next);
  saving.value = false;
  error.value = ok ? null : t("settingsControls.botJobs.saveFailed");
}

async function onToggle(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return;
  const input = event.target;
  await save({ ...botJobsSetting.value, enabled: input.checked });
  input.checked = botJobsSetting.value.enabled;
}

// A draft, so a half-typed path is not saved on every keystroke; Save is offered once it differs.
const pythonDraft = ref(botJobsSetting.value.python);
watch(
  () => botJobsSetting.value.python,
  (python) => {
    pythonDraft.value = python;
  },
);
const pythonChanged = computed(() => pythonDraft.value.trim() !== "" && pythonDraft.value.trim() !== botJobsSetting.value.python);
const savePython = () => save({ ...botJobsSetting.value, python: pythonDraft.value.trim() });

const tokens = ref<BotTokenRow[]>([]);
const endpoints = ref<BotEndpoints | null>(null);
const connected = ref(false);
const busy = ref(false);
const newName = ref("GrokBot");
const minted = ref<MintedBotToken | null>(null);
const copied = ref(false);

async function refresh(): Promise<void> {
  const [listed, isConnected] = await Promise.all([listBotTokens(), remoteHostConnected()]);
  connected.value = isConnected;
  if (listed.ok) {
    tokens.value = listed.value.tokens;
    endpoints.value = listed.value.endpoints;
  } else {
    error.value = listed.error;
  }
}

async function mint(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  busy.value = true;
  copied.value = false;
  const answer = await mintBotToken(name);
  busy.value = false;
  if (!answer.ok) {
    error.value = answer.error;
    return;
  }
  error.value = null;
  minted.value = answer.value;
  await refresh();
}

async function revoke(row: BotTokenRow): Promise<void> {
  if (!window.confirm(t("settingsControls.botJobs.confirmRevoke", { name: row.name }))) return;
  busy.value = true;
  const answer = await revokeBotToken(row.tokenId);
  busy.value = false;
  error.value = answer.ok ? null : answer.error;
  if (minted.value?.record.tokenId === row.tokenId) minted.value = null;
  await refresh();
}

// The page may be served over plain http from another machine, where the clipboard API is absent;
// the secret's field is selectable either way.
async function copySecret(): Promise<void> {
  if (!minted.value || !navigator.clipboard?.writeText) return;
  try {
    await navigator.clipboard.writeText(minted.value.token);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

const selectAll = (event: FocusEvent) => {
  if (event.target instanceof HTMLInputElement) event.target.select();
};
const createdOn = (iso: string) => iso.slice(0, 10);

// Connecting happens in the toolbar, outside this pane, and the pane stays mounted (v-show) — so
// while minting is held for the connection, look again now and then rather than leaving the button
// disabled until Settings is reopened. Stops once connected.
const CONNECTION_POLL_MS = 5000;
const poll = setInterval(() => {
  if (!connected.value) void remoteHostConnected().then((isConnected) => (connected.value = isConnected));
}, CONNECTION_POLL_MS);

onMounted(() => void refresh());
onUnmounted(() => clearInterval(poll));
</script>

<template>
  <p class="mb-3 mt-1.5 text-[12px] text-dim">{{ t("settingsControls.botJobs.intro") }}</p>

  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      data-testid="bot-jobs-enabled"
      :checked="botJobsSetting.enabled"
      :disabled="saving"
      :aria-label="t('settingsControls.botJobs.enabled')"
      @change="(e) => void onToggle(e)"
    />
    <span class="text-[12px]">
      <strong>{{ t("settingsControls.botJobs.enabled") }}</strong> — {{ t("settingsControls.botJobs.enabledHint") }}
    </span>
  </label>

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settingsControls.botJobs.python") }}</strong> — {{ t("settingsControls.botJobs.pythonHint") }}
  </p>
  <div class="mb-3 flex items-center gap-2">
    <SettingsField
      v-model="pythonDraft"
      class="flex-auto font-mono"
      data-testid="bot-jobs-python"
      placeholder="~/venvs/gpu/bin/python"
      :aria-label="t('settingsControls.botJobs.python')"
      spellcheck="false"
      @keydown.enter="pythonChanged && savePython()"
    />
    <SettingsButton data-testid="bot-jobs-python-save" :disabled="saving || !pythonChanged" @click="savePython">{{
      t("settingsControls.botJobs.save")
    }}</SettingsButton>
  </div>

  <p class="mb-1.5 mt-4 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settingsControls.botJobs.tokens") }}</strong> — {{ t("settingsControls.botJobs.tokensHint") }}
  </p>
  <ul v-if="tokens.length" :class="SETTINGS_LIST" data-testid="bot-jobs-tokens">
    <SettingsListRow v-for="row in tokens" :key="row.tokenId" :name="row.name" :disabled="busy" @remove="revoke(row)">
      <span class="flex-auto text-[12px] text-secondary">
        {{ row.name }} <span class="text-muted">· {{ createdOn(row.createdAt) }} · {{ row.hostId }}</span>
      </span>
    </SettingsListRow>
  </ul>
  <p v-if="!connected" class="mb-2 text-[12px] text-muted" data-testid="bot-jobs-not-connected">{{ t("settingsControls.botJobs.notConnected") }}</p>
  <div class="mb-3 flex items-center gap-2">
    <SettingsField
      v-model="newName"
      class="flex-auto"
      data-testid="bot-jobs-token-name"
      :aria-label="t('settingsControls.botJobs.tokenName')"
      :placeholder="t('settingsControls.botJobs.tokenName')"
      maxlength="64"
      @keydown.enter="connected && !busy && mint()"
    />
    <SettingsButton data-testid="bot-jobs-mint" :disabled="busy || !connected || !newName.trim()" @click="mint">
      <span class="material-symbols-outlined" aria-hidden="true">key</span> {{ t("settingsControls.botJobs.mint") }}
    </SettingsButton>
  </div>

  <div v-if="minted" class="mb-3 rounded-md border border-border bg-elevated p-3" data-testid="bot-jobs-minted">
    <p class="mb-2 text-[12px] font-semibold text-warn">{{ t("settingsControls.botJobs.onlyOnce", { name: minted.record.name }) }}</p>
    <div class="mb-2 flex items-center gap-2">
      <input
        class="box-border flex-auto rounded-md border border-border bg-input px-2.5 py-[7px] font-mono text-[12px] text-fg focus:border-accent focus:outline-none"
        data-testid="bot-jobs-secret"
        readonly
        :value="minted.token"
        :aria-label="t('settingsControls.botJobs.secret')"
        @focus="selectAll"
      />
      <SettingsButton data-testid="bot-jobs-copy" @click="copySecret">
        <span class="material-symbols-outlined" aria-hidden="true">{{ copied ? "check" : "content_copy" }}</span>
        {{ copied ? t("settingsControls.botJobs.copied") : t("settingsControls.botJobs.copy") }}
      </SettingsButton>
    </div>
    <p class="mb-1 text-[12px] text-dim">{{ t("settingsControls.botJobs.giveTheBot") }}</p>
    <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt class="text-muted">{{ t("settingsControls.botJobs.submit") }}</dt>
      <dd class="m-0 break-all font-mono">POST {{ minted.endpoints.submit }}</dd>
      <dt class="text-muted">{{ t("settingsControls.botJobs.result") }}</dt>
      <dd class="m-0 break-all font-mono">GET {{ minted.endpoints.result }}?id=…&amp;wait=50</dd>
    </dl>
  </div>
  <dl v-else-if="endpoints && tokens.length" class="m-0 mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted">
    <dt>{{ t("settingsControls.botJobs.submit") }}</dt>
    <dd class="m-0 break-all font-mono">{{ endpoints.submit }}</dd>
    <dt>{{ t("settingsControls.botJobs.result") }}</dt>
    <dd class="m-0 break-all font-mono">{{ endpoints.result }}</dd>
  </dl>

  <p v-if="error" class="mb-3 mt-1.5 text-[12px] text-err-text" role="alert" data-testid="bot-jobs-error">{{ error }}</p>

  <SkillLaunchButton skill="mulmoterminal-config" icon="memory" :label="t('settingsControls.botJobs.askSkill')" @launch="emit('launch-skill', $event)" />
</template>
