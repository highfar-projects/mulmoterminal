# feat: add and remove backends (providers) in Settings (#2621)

Part of #2616.

## What

Settings → Models and backends lists the backends as `/api/launch-options` resolves them (ready, not
ready, not in the picker), now with a remove per row and a form to add one: a name, the base URL, the
name of the environment variable holding the key, the model ids and the output budget. Each add or
remove is ONE entry on the server (`/api/config/providers/{add,remove}`, the one-entry route shape of
#2620), and the launch options are re-asked afterwards so the list and the picker follow.

## Decisions

- **The form refuses the mistakes the model skill warns about** (`common/providerEntries.ts`,
  `buildProvider`, run on both sides):
  - a base URL ending in `/v1` (Claude Code appends `/v1/messages`; every request would 404), or one
    that is not http(s);
  - a `tokenEnv` that is not an environment variable NAME (capitals, digits, `_`), which is what a
    pasted key almost never is — so the key is refused rather than written to the config in clear;
  - no models under any id but `openrouter` (a backend with none is never offered).
- **The output budget starts at 16000** (less and a thinking model answers with nothing); blank leaves
  the key out.
- **The id comes from the name**, as for custom agents and accounts; "OpenRouter" becomes
  `openrouter`, the id the built-in model presets are matched by.
- **No edit, only remove and add**, for the same reason as #2620: a directory pins a backend by id.

## Verification

- Specs: `providerEntries.spec.ts` (every refusal and the id), `agent-entry-routes.spec.ts` providers
  cases (add against the list on disk, a pasted key and a `/v1` URL refused with nothing written,
  remove), `agent-entries-server-keeps.spec.ts` (what the form builds is what `sanitizeProviders`
  keeps), `ProvidersEditor.spec.ts`, `providersEditing.spec.ts` (launch options re-asked only after a
  change the server took). Each decision was inverted and the specs went red.
