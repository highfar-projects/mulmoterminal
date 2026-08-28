# fix: refresh OpenRouter prices in modelPresets from the catalog (#1849)

## What

`common/modelPresets.ts` documents `pricePerMTok` as "US dollars per million tokens, as
published by the provider's catalog". Sixteen of the 27 `provider: "openrouter"` presets no
longer matched it, and one `contextLength` was 2x over.

Source: `GET https://openrouter.ai/api/v1/models`, read 2026-08-28 (380 models). No key needed:

```bash
curl -s https://openrouter.ai/api/v1/models \
  | jq -r '.data[] | [.id, (.pricing.prompt|tonumber*1e6), (.pricing.completion|tonumber*1e6)] | @tsv'
```

The file's convention is the top-level `context_length`, not `top_provider.context_length` —
all 27 presets agree with the former (once nemotron-ultra is corrected) and several disagree
with the latter.

## Changed

| id | was | now |
|---|---|---|
| `openai/gpt-5.6-luna` | 1.0 / 6.0 | 0.2 / 1.2 |
| `openai/gpt-5.6-luna-pro` | 1.0 / 6.0 | 0.2 / 1.2 |
| `google/gemini-3.6-flash` | 1.5 / 7.5 | 0.75 / 3.75 |
| `deepseek/deepseek-v4-pro` | 0.435 / 0.87 | 0.87 / 1.74 |
| `z-ai/glm-5.2` | 0.819 / 2.574 | 1.19 / 3.74 |
| `moonshotai/kimi-k2.6` | 0.684 / 3.42 | 0.95 / 4.0 |
| `nvidia/nemotron-3-ultra-550b-a55b` | 0.6 / 3.6 | 0.5 / 2.2 |
| `qwen/qwen3-235b-a22b-2507` | 0.09 / 0.55 | 0.0875 / 0.35 |
| `moonshotai/kimi-k2.7-code` | 0.82 / 3.75 | 0.66 / 3.4 |
| `openai/gpt-5.6-terra-pro` | 2.5 / 15.0 | 2.0 / 12.0 |
| `minimax/minimax-m2.7` | 0.25 / 1.0 | 0.3 / 1.2 |
| `mistralai/devstral-2512` | 0.4 / 2.0 | 0.44 / 2.2 |
| `deepseek/deepseek-v4-flash` | 0.094 / 0.188 | 0.088606 / 0.177212 |
| `tencent/hy3` | 0.14 / 0.58 | 0.132 / 0.528 |
| `deepseek/deepseek-v3.2` | 0.269 / 0.4 | 0.26 / 0.38 |
| `nvidia/nemotron-3-super-120b-a12b` | 0.08 / 0.45 | 0.085 / 0.4 |

Plus `nvidia/nemotron-3-ultra-550b-a55b` `contextLength` 524_288 -> 262_144. The comment that
explained the old value ("512 KiB = 512 * 1024; was 512_288") went with it — 262_144 needs no
explanation, and the catalog is the authority.

## Why the issue's table was not applied as filed

#1849 was filed 2026-08-24 with 13 rows. Read again on 2026-08-28 the catalog gives 16, and
five of the overlapping rows had moved AGAIN in those four days:

| id | file | #1849 (08-24) | catalog (08-28) |
|---|---|---|---|
| `deepseek/deepseek-v4-pro` | 0.435 / 0.87 | 0.5222 / 1.0443 | 0.87 / 1.74 |
| `deepseek/deepseek-v4-flash` | 0.094 / 0.188 | 0.056 / 0.112 | 0.088606 / 0.177212 |
| `z-ai/glm-5.2` | 0.819 / 2.574 | 0.966 / 3.036 | 1.19 / 3.74 |
| `minimax/minimax-m2.7` | 0.25 / 1.0 | 0.24 / 0.96 | 0.3 / 1.2 |
| `moonshotai/kimi-k2.7-code` | 0.82 / 3.75 | 0.67 / 3.4 | 0.66 / 3.4 |

`minimax/minimax-m2.7` had reversed direction: the issue reported the file as too HIGH, and it
is now too LOW.

Three rows the issue did not have: `qwen/qwen3-235b-a22b-2507` (reported as matching),
`nvidia/nemotron-3-ultra-550b-a55b`, and `mistralai/devstral-2512`.

`mistralai/devstral-2512` is back in the catalog (0.44 / 2.2), so the issue's other proposal —
drop the row or give it a distinct status because the id had left the catalog — no longer
applies. Its `unreachable(ACCOUNT_PRIVACY)` note is about the measuring account's privacy
settings, which is a different fact and is left alone.

## Deliberately not done

- **No reordering beyond the frontier section** — see below.
- **No automated catalog check.** #1849 proposes one, and the prices are the field that moves
  without anyone touching the repo — this refresh is the evidence. But a test that reaches the
  network on every PR contradicts "tests must run without API keys" and would go red on an
  offline runner or a catalog outage. If it is wanted, it belongs on a schedule with a named
  route for failures, not in `yarn test`.
- **No `pricesCheckedAt` stamp.** Worth having for the same reason `MEASURED_AT` exists, but it
  is a schema addition rather than a data correction.

## Ordering: the frontier section WAS reordered

The first draft of this change left the order alone, on the reading that "cheapest first" was a
stale comment. That was wrong, and codex-review caught it.

`sortedModels()` (`src/components/modelOption.ts`) orders only by `modelRank`, and
`Array.prototype.sort` is stable, so the order in `MODEL_PRESETS` **is** the order the picker
shows within a reliability bucket. `modelOption.ts` states the contract itself: "Within a bucket
the built-in order is kept — it runs cheapest-first, which is the next thing worth comparing once
reliability is equal."

The refreshed Luna prices (0.2) left both entries below the 0.3 Flash pair, so the frontier
section stopped honouring it. Both moved to the head of that section, which now reads
0.2, 0.2, 0.3, 0.3, 0.75, 2.0, 2.0 — grok-4.5 ahead of gpt-5.6-terra-pro on output, their inputs
being equal.

### Left alone, and pre-existing

Measured per RELIABILITY BUCKET rather than per section — which is what the picker actually
groups by — the order was already not ascending before this change:

| bucket | breaks before | breaks after the price refresh, before the reorder |
|---|---|---|
| RELIABLE | 2 (`tencent/hy3` 0.14 and `google/gemini-3.5-flash-lite` 0.3 both after `moonshotai/kimi-k3` 3.0) | 6 |
| UNTESTED | 1 (`openai/gpt-oss-120b` 0.037 after `deepseek/deepseek-v4-flash`) | 1 |
| TROUBLED | 1 (`mistralai/devstral-2512` after `mistralai/mistral-medium-3-5` 1.5) | 1 |

The frontier reorder above removes the breaks this change introduced. The remaining ones predate
it and fixing them means reordering ACROSS the section boundaries — `tencent/hy3` and
`nvidia/nemotron-3-ultra-550b-a55b` would have to move up among the open models, and the UNTESTED
and TROUBLED entries are interleaved with sections chosen for a different reason. That is a wider
change than a price refresh should carry, and it should be decided once for the whole list.
