<script setup lang="ts">
// The author's shared app, running on the author's own machine, before anything is published.
//
// Until this existed the page was written by an LLM and went out without anybody having loaded it
// once. This is where it loads (design: `plans/feat-shared-app-preview.md`).
//
// THE PARENT IS NOT OURS. Every rule about what a view may ask for, when a write may happen and
// which document may be answered lives in `@receptron/sharedapp/view` — the same code mulmoserver
// runs at `/a/{slug}`. Writing a second parent here would have been quicker and would have made
// this a different program from the one visitors meet: it would agree on the easy things and
// diverge on a dropped port message, a confirmation that is not drawn, a modal the sandbox
// ignores. What stays here is this host's chrome, and nothing else.
//
// AND IT IS NOT LOOSER. Same `sandbox="allow-scripts"` with no `allow-modals` and no
// `allow-same-origin`, same CSP, same per-render nonce, same handover of a private port. A preview
// that were kinder than production is a machine for manufacturing "it worked on my machine", and
// worse than having none.
//
// What this does NOT show is worth knowing before trusting it: the rules do not run here, so what
// a role may WRITE is not tested; nobody else exists, so nothing here is concurrent; and it cannot
// tell whether the Firestore rules a new declaration needs have been deployed at all.
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, watch } from "vue";
import { portChannel, publicViewSrcdoc, viewBridge, viewNonce, type PendingSubmit } from "@receptron/sharedapp/view";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { isRecord } from "../../common/isRecord";
import { previewPageKey, type PreviewAudience, type PreviewDataset, type PreviewPage, type SharedAppPreview } from "../../common/sharedAppPreview";

const props = defineProps<{ cwd: string | null }>();

/** The payload, narrowed rather than asserted. Every field has a floor, because a pane that threw
 *  on an unexpected shape would report a server it could not read as an app that will not publish —
 *  two very different things to be told while you are trying to fix a page. */
function asPayload(value: unknown): SharedAppPreview | null {
  if (!isRecord(value)) return null;
  return {
    aid: typeof value.aid === "string" ? value.aid : "",
    submit: asSubmit(value.submit),
    pages: Array.isArray(value.pages) ? value.pages.flatMap(asPage) : [],
    publicOpen: value.publicOpen === true,
    fromLiveApp: value.fromLiveApp === true,
    generatedForm: value.generatedForm === true,
    datasets: isRecord(value.datasets) ? Object.fromEntries(Object.entries(value.datasets).map(([key, rows]) => [key, asDatasets(rows)])) : {},
    unreadable: strings(value.unreadable),
    warnings: strings(value.warnings),
  };
}

/** What a public create may carry, per collection. Narrowed with a floor of `[]` rather than
 *  dropped: an unreadable declaration must make the parent refuse a FIELD, not refuse the whole
 *  collection — the two refusals name different repositories to whoever reads them. */
const asSubmit = (value: unknown): Record<string, { createFields: string[] }> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([cid, spec]) => [cid, { createFields: isRecord(spec) ? strings(spec.createFields) : [] }]));
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

const AUDIENCES: PreviewAudience[] = ["public", "member", "roster"];

const asPage = (value: unknown): PreviewPage[] => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.html !== "string") return [];
  const audience = AUDIENCES.find((candidate) => candidate === value.audience);
  return audience === undefined ? [] : [{ id: value.id, html: value.html, audience }];
};

const asDatasets = (value: unknown): Record<string, PreviewDataset> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([cid, rows]) => [cid, Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => isRecord(row)) : []]),
  );
};

const loading = ref(true);
const declared = ref(false);
const problems = ref<string[]>([]);
const payload = shallowRef<SharedAppPreview | null>(null);
const selectedId = ref<string | null>(null);

const AUDIENCE_LABEL: Record<PreviewPage["audience"], string> = {
  public: "Anyone with the link",
  member: "On the roster",
  roster: "The person who signed up",
};

const pages = computed<PreviewPage[]>(() => payload.value?.pages ?? []);

/** The key the picker binds to. Audience-qualified for the same reason the datasets are: a view id
 *  is unique inside its tier, not across them. */
const keyOf = (candidate: PreviewPage): string => previewPageKey(candidate.audience, candidate.id);

const page = computed(() => pages.value.find((candidate) => keyOf(candidate) === selectedId.value) ?? pages.value[0] ?? null);

/** ONLY this page's records. A member page may name a collection `public.read` does not open, so
 *  one map for the app would either starve that page or hand its rows to the public one — and the
 *  second would show the author a public page drawing private data. */
const datasets = computed(() => (page.value === null ? {} : (payload.value?.datasets[keyOf(page.value)] ?? {})));

/** A fresh name per rendered document, for the reason the package gives: reusing one would let a
 *  document that navigated away go on answering. */
const nonce = ref(viewNonce());
const srcdoc = computed(() => (page.value === null ? "" : publicViewSrcdoc(page.value.html, nonce.value)));

const frame = ref<HTMLIFrameElement | null>(null);

// The bridge's state, owned HERE. The package holds no framework of its own so that a second copy
// of Vue cannot end up on a page — see its own note — so the cells are this host's `ref`s.
const cells = { pending: ref<PendingSubmit | null>(null), sending: ref(false), readied: ref(false) };

const bridge = viewBridge(
  {
    channel: () => portChannel(frame.value, (message) => structuredCloneable(message)),
    // The REAL write, to the real database, performed by the server as the author.
    //
    // A submission only reaches this after the parent has judged it against the declaration below
    // and a person has pressed a button: `unknown-collection`, `not-a-submission` and
    // `undeclared-field` are answered before it, which is what a preview is FOR.
    submit: (pending) => send(pending),
    state: () => datasets.value,
  },
  // The REAL declaration, never an empty map.
  //
  // An empty one does not switch the check off — it makes the parent refuse every submission with
  // `unknown-collection`, which reads as "the cid your page submits to is not declared" about a
  // declaration that is correct. That shipped, and it sent an author debugging the wrong
  // repository: the page was fine, the app was fine, and the preview was the only thing wrong.
  () => (payload.value === null ? null : { submit: payload.value.submit }),
  () => nonce.value,
  cells,
);

/** Vue's reactivity taken off a message before the browser copies it. Structured clone refuses a
 *  Proxy, and these datasets arrive through a ref — the failure is a `DataCloneError` at the send,
 *  which leaves the view on "loading…" with nothing on screen to say why.
 *
 *  Rebuilt entry by entry rather than unwrapped whole, so the shape is preserved by construction
 *  and nothing has to be asserted back into it. */
function structuredCloneable(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(message).map(([key, value]) => [key, unwrap(value)]));
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Recursive because `toRaw` unwraps one level. Anything that is not a plain container is passed
 *  through untouched — structured clone copies a class instance's own fields by itself, and going
 *  through JSON instead would turn `NaN` and `±Infinity` into `null`. */
const unwrap = (value: unknown): unknown => {
  const raw: unknown = toRaw(value);
  if (Array.isArray(raw)) return raw.map(unwrap);
  if (isPlainObject(raw)) return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, unwrap(entry)]));
  return raw;
};

/** Only messages from OUR frame. The sandbox's origin is opaque, so `event.origin` cannot draw
 *  this boundary and `event.source` is what does. */
const onMessage = (event: MessageEvent) => {
  if (frame.value !== null && event.source === frame.value.contentWindow) bridge.receive(event.data);
};
window.addEventListener("message", onMessage);
onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  bridge.restart();
});

// A new document means a new conversation: the old channel belongs to a document we are no longer
// talking to, and the next `ready` is a real first one.
//
// Watched on the HTML, never on `srcdoc`. `srcdoc` is computed FROM the nonce, so minting one here
// would change what is being watched and trigger this again — an infinite loop rather than a
// preview. The document's identity is the page; the nonce is a consequence of it.
watch(
  () => page.value?.html,
  () => {
    bridge.restart();
    nonce.value = viewNonce();
  },
);

// New data, same document — the view asked once and cannot ask again.
watch(datasets, () => bridge.sendState(), { deep: true });

/** Every record this preview session wrote, newest first.
 *
 *  HERE and not on the records. The rules read a public create with `hasOnly(createFields)`, so an
 *  extra key does not annotate the document — it refuses the whole write. What the author wrote
 *  from a preview is therefore indistinguishable in the database from what a visitor wrote, and
 *  this list is the only place it can be remembered. It dies with the pane, which is why the button
 *  below says so. */
const written = ref<{ cid: string; id: string; mirror?: { cid: string; id: string } }[]>([]);
const clearing = ref(false);

/** The projection route, scoped to the cell's directory. */
const previewUrl = (): string => {
  const scope = props.cwd === null ? "" : `?cwd=${encodeURIComponent(props.cwd)}`;
  return `/api/shared-app/preview${scope}`;
};

const writeUrl = (path: string): string => {
  const scope = props.cwd === null ? "" : `?cwd=${encodeURIComponent(props.cwd)}`;
  return `/api/shared-app/preview/${path}${scope}`;
};

/** Perform one accepted submission and remember what it made. */
async function send(pending: PendingSubmit): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      writeUrl("submit"),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid: pending.cid, values: pending.values }) },
      SLOW_COMMAND_TIMEOUT_MS,
    );
    const body: unknown = await res.json();
    if (!isRecord(body) || body.ok !== true) {
      return { ok: false, error: isRecord(body) && typeof body.error === "string" ? body.error : "write-failed" };
    }
    const made = isRecord(body.written) ? body.written : null;
    if (made !== null && typeof made.cid === "string" && typeof made.id === "string") {
      const raw = made.mirror;
      const mirror = isRecord(raw) && typeof raw.cid === "string" && typeof raw.id === "string" ? { cid: raw.cid, id: raw.id } : undefined;
      written.value = [{ cid: made.cid, id: made.id, ...(mirror === undefined ? {} : { mirror }) }, ...written.value];
    }
    // NOT awaited, and NOT `load()`. The bridge answers the page immediately after this resolves,
    // and `load()` blanks the payload on its way — which empties `pages`, changes the page being
    // drawn, and restarts the bridge. The answer would then be posted on a channel that had just
    // been closed, and the page would wait for ever on a request that had actually succeeded.
    void refresh();
    return { ok: true };
  } catch {
    // A throw here is the dangerous case: the write may have landed and the read after it may be
    // what failed. Reported as a failure, and the list below is what the author checks.
    return { ok: false, error: "write-failed" };
  }
}

/** Take them all back, through the app's own withdrawal shape where one is declared. */
async function clearWritten(): Promise<void> {
  if (clearing.value) return;
  clearing.value = true;
  try {
    for (const record of [...written.value]) {
      const res = await fetchWithTimeout(
        writeUrl("undo"),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ written: record }) },
        SLOW_COMMAND_TIMEOUT_MS,
      );
      const body: unknown = await res.json();
      // Kept in the list when it could not be removed. A cleanup that quietly forgets what it
      // failed to delete is how a test booking outlives the session that made it.
      if (isRecord(body) && body.ok === true) written.value = written.value.filter((entry) => entry !== record);
    }
  } finally {
    clearing.value = false;
    await load();
  }
}

let generation = 0;

/** The same read as `load`, without the reset.
 *
 *  A write changes the records, so the frame has to be told — but the DOCUMENT has not changed, and
 *  tearing it down to say so would throw away the conversation it is having. Only the payload is
 *  swapped; the page, its nonce and its channel all stay. */
async function refresh(): Promise<void> {
  const mine = ++generation;
  try {
    const res = await fetchWithTimeout(previewUrl());
    const body: unknown = await res.json();
    if (mine !== generation || !isRecord(body) || body.ok !== true) return;
    const next = asPayload(body.preview);
    if (next !== null) payload.value = next;
  } catch {
    // The records on screen are now older than the truth, and saying so would take the pane away
    // from an author in the middle of something. The next render says it.
  }
}

async function load(): Promise<void> {
  const mine = ++generation;
  loading.value = true;
  problems.value = [];
  payload.value = null;
  declared.value = false;
  try {
    const res = await fetchWithTimeout(previewUrl());
    const body: unknown = await res.json();
    if (mine !== generation) return;
    if (!isRecord(body)) {
      problems.value = ["The server answered with something this pane cannot read."];
      return;
    }
    declared.value = body.declared === true;
    if (body.declared !== true) return;
    if (body.ok !== true) {
      const listed = Array.isArray(body.problems) ? body.problems.filter((line): line is string => typeof line === "string") : [];
      problems.value = listed.length > 0 ? listed : ["The preview could not be computed."];
      return;
    }
    payload.value = asPayload(body.preview);
    // The picker starts ON the page being drawn. Left null it renders blank while the frame below
    // it shows the first page, which reads as "no page selected" over a page that is right there.
    const first = payload.value?.pages[0];
    selectedId.value = first === undefined ? null : keyOf(first);
  } catch {
    if (mine === generation) problems.value = ["Could not reach the server."];
  } finally {
    if (mine === generation) loading.value = false;
  }
}

watch(() => props.cwd, load, { immediate: true });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-panel font-sans" role="region" aria-label="Shared app preview">
    <div v-if="loading" class="p-3 text-[12px] text-dim">Computing what publishing would show…</div>

    <!-- Not an error. Most directories are not shared apps, and this pane asks about whichever one
         the cell happens to be open in. -->
    <div v-else-if="!declared" class="p-3 text-[12px] text-dim">
      This directory declares no shared app. One lives in <code>app.json</code> beside the collections it publishes.
    </div>

    <div v-else-if="problems.length" class="p-3">
      <p class="mb-1.5 text-[12px] text-err-text">Publishing this would be refused:</p>
      <ul class="flex list-none flex-col gap-1 p-0">
        <li v-for="problem in problems" :key="problem" class="text-[11px] leading-[1.4] text-err-text">{{ problem }}</li>
      </ul>
    </div>

    <!-- Two states that put the same empty frame on screen and mean opposite things. Saying only
         "no pages" over an app that publishes a generated form tells the author their survey cannot
         be previewed BECAUSE there is nothing there, which is untrue and unactionable. -->
    <div v-else-if="pages.length === 0 && payload?.generatedForm" class="p-3 text-[12px] text-dim">
      This app publishes a generated form rather than a page of its own. Drawing that form here is not wired up yet — the published site builds it from what
      <code>public.submit</code> declares.
    </div>
    <div v-else-if="pages.length === 0" class="p-3 text-[12px] text-dim">This app publishes no pages — only its schemas. There is nothing to draw.</div>

    <template v-else>
      <div class="flex flex-none flex-wrap items-center gap-2 border-b border-border px-2.5 py-1.5">
        <label class="text-[11px] text-dim" for="mt-preview-page">Page</label>
        <select id="mt-preview-page" v-model="selectedId" class="rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[11px] text-fg">
          <option v-for="candidate in pages" :key="keyOf(candidate)" :value="keyOf(candidate)">
            {{ candidate.id }} — {{ AUDIENCE_LABEL[candidate.audience] }}
          </option>
        </select>
        <!-- Which face this is, said in the pane rather than only in the picker: the three tiers
             are separate documents with separate rules, and reading the wrong one as "the app" is
             how a page written for the front desk gets published to the world. -->
        <span v-if="page" class="text-[11px] text-dim">{{ AUDIENCE_LABEL[page.audience] }}</span>
        <span v-if="payload && !payload.publicOpen" class="text-[11px] text-dim">· Roster only</span>
      </div>

      <div class="min-h-0 flex-1">
        <!-- Byte for byte the document a visitor is served. No `allow-modals`, so `alert` /
             `confirm` / `prompt` are ignored here exactly as they are there; no
             `allow-same-origin`, so the frame gets an opaque origin and cannot reach this app's
             storage or credentials. Do not add either to "make the preview work" — a page that
             needs them is a page that is already broken in production. -->
        <iframe
          ref="frame"
          :key="srcdoc"
          :srcdoc="srcdoc"
          title="Shared app preview"
          sandbox="allow-scripts"
          csp="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'"
          class="h-full w-full border-0 bg-input"
        />
      </div>

      <!-- OUTSIDE the frame, because a page cannot be trusted to describe its own success. What is
           said here is what the parent knows, not what the view drew. -->
      <div class="flex-none border-t border-border px-2.5 py-1.5" role="status" aria-live="polite">
        <p class="text-[11px] text-dim">
          Real records, read as you. Nothing here is written, and the rules are not run — this shows what DRAWS, not what a stranger would be allowed to do.
        </p>
        <p v-if="payload && !payload.fromLiveApp" class="mt-1 text-[11px] text-dim">This app has never been published, so nothing was carried over.</p>
        <p v-if="payload && payload.unreadable.length" class="mt-1 text-[11px] text-amber">
          Could not read records for: {{ payload.unreadable.join(", ") }} — an empty page below may be a refusal rather than an empty collection.
        </p>
        <ul v-if="payload && payload.warnings.length" class="mt-1 flex list-none flex-col gap-1 p-0">
          <li v-for="warning in payload.warnings" :key="warning" class="text-[11px] leading-[1.4] text-amber">{{ warning }}</li>
        </ul>
      </div>

      <!-- WHAT THIS SESSION WROTE, and the way to take it back.
           Kept by the pane rather than marked on the records: a public create is read with
           `hasOnly(createFields)`, so an extra key does not annotate the document — it refuses the
           whole write. In the database these are ordinary records, which is why forgetting them is
           the same as leaving them, and why the offer to remove them is here rather than later. -->
      <div v-if="written.length" class="flex-none border-t border-border px-2.5 py-1.5 font-sans">
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-amber">{{ written.length }} record{{ written.length === 1 ? "" : "s" }} written from this preview</span>
          <button
            type="button"
            class="cursor-pointer rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[11px] text-fg hover:border-accent disabled:cursor-default disabled:opacity-60"
            :disabled="clearing"
            title="Remove them, restoring anything they were holding"
            @click="clearWritten"
          >
            {{ clearing ? "Removing…" : "Remove them" }}
          </button>
        </div>
        <ul class="mt-1 flex list-none flex-col gap-0.5 p-0">
          <li v-for="record in written" :key="`${record.cid}/${record.id}`" class="text-[11px] leading-[1.4] text-dim">{{ record.cid }} / {{ record.id }}</li>
        </ul>
        <!-- Said out loud because it is the failure mode: this list is the pane's, not the
             database's, so closing the pane loses the only record of which rows were tests. -->
        <p class="mt-1 text-[11px] text-dim">This list is not stored. Close the pane and these become ordinary records.</p>
      </div>

      <!-- THE CONFIRMATION, drawn by the parent, outside the frame.
           `event.source` proves which window sent the message; it does not prove a person asked
           for it, and the author's HTML can call submit the moment it loads. So the values are
           shown here, where the view cannot touch them — and the page's promise does not settle
           until one of these two buttons is pressed.
           Not optional, and not "for later": without it a submission is accepted and then nothing
           can resolve it, so the page waits forever on a request with no timeout. That is a button
           that does nothing — the exact failure this feature exists to catch, manufactured by the
           thing meant to catch it. -->
      <div v-if="cells.pending.value" class="flex-none border-t border-border px-2.5 py-2 font-sans">
        <p class="mb-1 text-[11px] text-fg">
          The page asks to write to <code>{{ cells.pending.value.cid }}</code>
        </p>
        <dl class="mb-2 flex list-none flex-col gap-0.5 p-0">
          <div v-for="[field, value] in Object.entries(cells.pending.value.values)" :key="field" class="flex gap-2 text-[11px]">
            <dt class="w-24 shrink-0 text-dim">{{ field }}</dt>
            <dd class="min-w-0 flex-1 break-words text-fg">{{ value }}</dd>
          </div>
        </dl>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[11px] text-fg hover:border-accent disabled:cursor-default disabled:opacity-60"
            :disabled="cells.sending.value"
            @click="bridge.accept()"
          >
            Send it
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-[5px] border border-border bg-input px-1.5 py-[3px] text-[11px] text-fg hover:border-accent disabled:cursor-default disabled:opacity-60"
            :disabled="cells.sending.value"
            @click="bridge.decline()"
          >
            Cancel
          </button>
          <!-- Said at the button rather than only in the strip above: this is the moment the author
               is deciding, and what it costs is what they need to know here. -->
          <span class="text-[11px] text-dim">This writes a real record, as you.</span>
        </div>
      </div>
    </template>
  </div>
</template>
