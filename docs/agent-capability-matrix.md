# Hosting a new agent CLI — the capability matrix

**Read this before answering "can MulmoTerminal support `<some CLI>`?"** — a request like
[#2055](https://github.com/receptron/mulmoterminal/issues/2055) (Cursor CLI) or "we also want
GitHub Copilot CLI" is never one yes/no. Launching a CLI in a PTY is nearly free; the things the
request is actually asking for — the notification sound, the cell's working/waiting dot, resume
after a reload, the GUI panel — are **separate capabilities, each with its own precondition on
what that CLI exposes**. This file lists those capabilities, says what a candidate binary must
provide for each one, and records how the five agents hosted today answer each.

Two documents sit beside it: [`docs/codex-vs-claude.md`](codex-vs-claude.md) explains *why* the
codex path diverges where it does (the reasoning, not the inventory), and
[`docs/spawn-architecture.md`](spawn-architecture.md) details the claude spawn flag by flag. This
one is the inventory, and it is the one to update when a sixth agent lands.

**Two kinds of claim live here and they age differently.** Everything about *this repo* — the
routes, the flags, which file is read by what — is derived from the code, and a reader can check any
of it in a minute. Everything about *the CLIs themselves* — that grok indexes `.claude/skills`, that
muse records a plugin per machine, what each writes to disk and when — was measured against one
build of one CLI, and **nothing here goes red when a new release changes it**. Rows that rest on the
second kind say so where it matters. Re-measure those rather than inheriting them; the probe list
below is how.

## The short version

Every row here is a **view of the matrix below**, not a second set of claims — the last column names
the rows it summarises, so a tier that promises something those rows do not give is a contradiction
you can see rather than one you have to argue about. (It is stated this way because the table has
been wrong three times in review for exactly that reason: a tier bundling capabilities the matrix
keeps separate.)

| Tier | What it buys the user | What it costs | Rows |
|---|---|---|---|
| **0 — launcher chip** | the CLI runs in a cell | nothing. Any command already works; it is recorded as `agent: "shell"`, so no resume, no cost, no status | none — a chip is not an agent |
| **1 — built-in agent** | Agent Picker entry, its own WS endpoint, a seeded prompt, a badge | a `bin()` + env override, an argv builder, a spawner, a route, and a dozen typed list entries the compiler walks you through | 1-4, 21, 23 |
| **1a — unattended** | a cell that does not silently hang on the agent's own approval prompt | an approval-free mode to pass: claude `--permission-mode`, agy `--dangerously-skip-permissions`, grok `--permission-mode auto`, muse `--yolo`. Codex is passed none | 19 |
| **2 — identity** | resume after a reload, a survivable session, the "or resume here" history list | the CLI must either take a session id we mint, or write one somewhere we can discover and map | 5-8 |
| **3 — status** | **the working dot, the "finished" sound, Web Push on a finished turn** | the CLI must announce its own turn boundaries: a hook mechanism, or a log it appends to per turn | 9, 10 |
| **3a — blocked on input** | **the waiting dot and the "needs you" sound** — the half of #2055 that asks to be told when input is needed | strictly more than 3, and codex is the proof: the CLI must report being BLOCKED as well as starting and finishing. Claude's `Notification` hook does; codex draws its approval prompt in the TUI and says nothing, so a codex cell goes quiet rather than amber | 9, 10 |
| **3b — the rest of the stream** | tool history, work phase, the `AskUserQuestion` decision log | strictly more than 3: turn edges are not enough — tool and question events have to arrive **and be read**. Claude's hooks carry both (`PreToolUse`, `AskUserQuestion`) and all three of these are built on them. Codex has 3 and none of 3b: its rollout is read here for turn boundaries only, and whether it records tool calls in a usable form is not something this repo has measured | 11, 14 |
| **4 — panel** | the GUI MCP tools (`presentDocument`, `presentForm`, `presentChart`, `generateImage`, …) | an MCP injection point we can aim at a per-session URL, with its tools auto-approved | 18 |
| **5 — accounting** | `ctx 33%`, `⇡1.2M ⇣18k` | a readable token record — **per turn is not required**: muse records per model call and agy per generation, and the badge sums whatever granularity it is given. Its own context window is a bonus rather than a requirement — codex, grok and agy publish one, muse does not and the client falls back to a table keyed by model id | 15 |
| **5b — money and quota** | dollar cost, the rate-limit gauge | each needs its own thing on top of the token record, which is why all five clear 5 and only claude clears both of these: `$` needs a price table keyed by model id, and the gauge needs a window **the provider publishes** (claude's via the status-line probe, codex's in its rollout; grok, muse and agy publish none) | 16, 17 |

Tiers 3 and 3a are what issue #2055 asks for, and the split is not pedantry — the issue asks to be
told "処理が終わったとき" *and* "入力が必要になったとき", which are two different facts a CLI
either reports or does not. Codex clears the first and not the second. Neither can be bought with
configuration:
**an agent that does not tell anyone when a turn starts or ends cannot drive a notification.** It is
also the tier where the five current agents split 2/3 — though for grok and muse what is missing is
the *wiring*, not the record; rows 9-10 below say which is which, and the difference decides whether
a request like #2055 is a day of work or a design problem.

Rows **12, 13, 20, 22 and 24** belong to no tier: last-turn reading, the AI title, skills, draft
injection and the custom-agent wrapper are independent conveniences a candidate can gain in any
order, and none of them gates another.

## The matrix

Read `—` as *not wired*, not as *impossible* — and usually as *decided*: grok's own addition commit
(`58be8509`) names "rate limits, draft injection, activity tracking, customAgents, and launcher
chips" as deliberately out of scope, each with a reason in `plans/feat-grok-agent.md`. A dash here
is where to go read why, not a gap nobody noticed.

| # | Capability | Claude | Codex | Antigravity | Grok | Muse |
|---|---|---|---|---|---|---|
| 1 | Binary / override | `claude` / `CLAUDE_BIN` | `codex` / `CODEX_BIN` | `agy` / `ANTIGRAVITY_BIN` | `grok` / `GROK_BIN` | `muse` / `MUSE_BIN` |
| 2 | WebSocket endpoint | `/ws` | `/ws/codex` | `/ws/antigravity` | `/ws/grok` | `/ws/muse` |
| 3 | Agent Picker + phone launch | yes | yes | yes | yes | yes |
| 4 | Model override | per session (provider + model pick, remembered) | `CODEX_MODEL` | `ANTIGRAVITY_MODEL` | `GROK_MODEL` | `MUSE_MODEL` |
| 5 | Who owns the session id | **ours** (`--session-id`) | its own (rollout id) | its own (conversation id) | **ours** (`--session-id`) | its own (`session-index.db` row) |
| 6 | Resume form | `--resume <id>` | `resume <id>` subcommand | `--conversation <id>` | `--resume <id>` | `resume <id>` + `--workspace` |
| 7 | Conversation history list | `/api/sessions` | `/api/codex/sessions` | `/api/antigravity/sessions` | `/api/grok/sessions` | `/api/muse/sessions` |
| 8 | Survives a server restart | transcript on disk | rollout map | conversation map | key *is* the conversation id | conversation map |
| 9 | **working / waiting flags** | **hooks** (`--settings`) — both | **rollout tail** (1s poll) — **working only** | — | — | — |
| 10 | **Attention sound / Web Push** | yes — finished **and** blocked | yes — finished only | — | — | — |
| 11 | Tool-call history (Tools pane) + work phase | yes (from `Pre`/`PostToolUse`) | — | — | — | — |
| 12 | Last turn → header prompt, handoff, round table, prompts pane | yes | yes | — | — | — |
| 13 | AI-generated session title | yes | — (shows codex's own `/rename` name in the list) | — | — | — |
| 14 | Decision log (`AskUserQuestion`) | yes | — | — | — | — |
| 15 | `ctx %` + token badges | yes | yes | yes | yes | yes |
| 16 | Dollar cost | yes | — | — | — | — |
| 17 | Rate-limit gauge | yes (hidden probe) | yes (from the rollout) | — | — | — |
| 18 | GUI MCP in the **workspace** | **full** (`--mcp-config`) | **full** (`-c mcp_servers…`) | per-directory file | per-directory file | per-machine plugin |
| 19 | Agent-native permission / approval mode | `--permission-mode` (`CLAUDE_PERMISSION_MODE`, default `auto`) | **none passed** — only per-MCP-server auto-approve | `--dangerously-skip-permissions` | `--permission-mode auto` | `--yolo` |
| 20 | Skills | native `.claude/skills`, `/slug` seed | mirrored into `~/.codex/skills`, sentence seed | `.agents/skills.json` written per directory | **native** — indexes `.claude/skills` itself, sentence seed | **native** — indexes Claude's skill roots itself, sentence seed |
| 21 | Seed prompt (collection action, background chat) | yes | yes | yes | yes | yes |
| 22 | Editable draft injection | yes (`draftReadyMarker`) | — | — | — | — |
| 23 | One-session-per-worktree limit | yes | yes | yes | yes | yes |
| 24 | Custom-agent wrapper (`customAgents`) | yes | — | — | — | — |

## What each row actually requires

**1–4 · Launch.** The whole precondition is *"it is an interactive TUI that runs in a PTY and takes
its work from stdin"*. Everything else here is optional. Code: `server/agents/types.ts`
(`AgentAdapter`), `server/agents/registry.ts`, `common/sessionAgent.ts` (`TERMINAL_AGENTS`),
`common/launchAgent.ts`, `src/components/agentPicker.ts`, `server/routes/terminal-ws-path.ts`.
A model override needs a `--model`-shaped flag; without one the row is simply absent.

**5–8 · Identity and resume.** Two shapes, and which one a CLI is decides the spawner's whole
structure. *Claude-shaped*: it accepts an id we mint, so there is nothing to discover
(`spawn-grok.ts` is the short spawner for exactly this reason). *Codex-shaped*: it mints its own
and prints it nowhere, so the spawn is followed by a watcher that attributes a new
rollout/conversation/db-row to the session, and the mapping is appended to a log so it survives a
restart (`server/session/agent-conversations.ts` and `server/agents/agent-resume.ts` — different directories, which is easy to get wrong). Either way the requirement is:
**a durable per-conversation artefact on disk that we can name.** A CLI whose history lives only in
a cloud account and is unaddressable from the command line stops at tier 1 — it can be launched,
never resumed, and `server/session/survivor-agent-guard.ts` will let it reattach only because it
leaves no contradicting evidence.

**9–10 · Turn boundaries — the notification row.** This needs the CLI to *announce* a turn's start
and end. Only two mechanisms have worked here:

- **A hook mechanism.** Claude takes `--settings` with hooks that `POST /api/hook`, which is what
  drives the dots, the sound, the push, the tool history and the work phase. It is the richest
  source because it also reports *blocked on input* (`Notification`) — the "waiting" half.
- **An append-only log with turn records.** Codex has no hooks, so its rollout is tailed on a 1s
  poll and `turn started` / `turn completed` are translated into the *same* effect table the hooks
  feed (`server/agents/codex-activity.ts` → `server/session/activity-hook.ts`). The cost of that
  route is what codex still lacks: its approval prompt is drawn in the TUI and never reaches the
  rollout, so codex **never reports "waiting"** — only working/finished.

No third route is *wired* today, and screen-scraping the PTY is deliberately not one:
`server/session/pty-scan.ts` explains why matching a TUI's redrawn output is a trap (escape
sequences land between the words), and the markers it does match are narrow, version-fragile
strings.

**`—` in rows 9-10 means unwired, and for two of the three it is only that.** Grok appends one
`turn_completed` record per turn to `updates.jsonl`, and muse appends a `model_completed` per model
call — and this repo **already parses both**, incrementally, for the token badges in row 15
(`server/agents/grok-usage.ts`, `muse-usage.ts`).

But be precise about how close that is, because it is easy to overstate: those folds run **when a
badge request asks for them** (`GET /api/session/:id` → `server/session/agent-badges.ts`), which is
a poll of roughly one a minute per cell. A status wire needs two things on top, and only one of them
is a parser — the **live tail** codex has (`server/session/codex-activity-watch.ts`, a 1s poll held
open for the session's life), and the translation of a record into `setWorking` / `setWaiting`. Muse
carries a design question as well: `model_completed` is per model CALL, so one user turn can produce
several and the turn's *end* is not stated outright. Grok's record is a turn boundary already.

**The repo already names those three and says what wiring one would retire.** `TerminalCell.vue`
keeps `UNTRACKED_BADGE_AGENTS = {antigravity, grok, muse}` on a `UNTRACKED_BADGE_POLL_MS = 60_000`
timer, with the comment *"Delete each the day its agent gets an activity tracker."* That timer
exists **because** of the missing wire, not beside it: claude and codex refresh their badges off an
activity push, and an agent that never sets a flag never sends one. So the absence in rows 9-10
costs more than the dots and the sound — it is also why three of the five cells poll on a minute
timer to keep a badge current.

Agy is the genuinely hard one of the three: its accounting is per-generation protobuf rows inside a
SQLite database (`server/agents/antigravity-proto.ts`), not an append-only log with a turn boundary
in it.

So the question to ask of a candidate CLI is not "does it have hooks" but **"where does it write a
turn's start and end, and can that be tailed live?"** — and if the honest answer is "nowhere but the
screen", say so plainly in the issue. That is the answer to "can it beep like Claude does?".

Everything downstream of the flags is free once they exist: `common/notifyKinds.ts`,
`src/composables/notifyKind.ts`, the push rules and the cockpit dots all read the published
`working` / `waiting` row and know nothing about which agent produced it.

A caution about one of those, because it is easy to file under the wrong tier: **`AskUserQuestion`
is Claude Code's own tool, not a GUI MCP tool.** The dialog is seen through the hook stream
(`ASK_QUESTION_TOOL` in `common/askQuestion.ts`, read in `server/routes/hook-routes.ts`) and
answered by writing keystrokes into the PTY — so the question pane and the decision log follow from
row 9, not from row 18, and an agent with the whole GUI MCP and no hooks gets neither.

**11–14 · Transcript reading.** Requires a **machine-readable, per-session conversation log** with
user turns and assistant turns distinguishable — and, for the AI title and the decision log,
claude's specific record shapes. `server/session/last-turn.ts` normalizes claude and codex into one
`LastTurn`; a third agent means a third reader there, and until it exists the header shows no
prompt, handoff has nothing to copy, and a round-table seat contributes nothing.

**15–17 · Accounting.** Needs a file where token counts can be found — at **whatever granularity the
agent keeps them**, since the badge sums them: claude and codex per turn, grok per turn
(`turn_completed`), muse per model CALL, agy per generation. What the granularity does change is the
*context* half of the badge, which is a gauge and not a sum: muse takes the last call's value rather
than the largest, because a high-water mark never comes down after a compaction (`muse-usage.ts`
has the numbers). All five clear this, by four different routes — claude's transcript `message.usage`,
codex's rollout, grok's `signals.json` + `updates.jsonl`, muse's `model_completed` events, agy's
protobuf blobs in SQLite (`server/agents/antigravity-proto.ts`, a format with no published schema —
read the file's warning before copying that approach). `$` cost additionally needs a public price
table keyed by model id, which is why it is claude-only. The rate-limit gauge needs the *provider*
to publish a window; claude's arrives only through an interactive session's `statusLine`, which is
why there is a hidden probe session at all (`server/agents/rate-limit-probe.ts`).

**18 · GUI MCP.** The broker is agent-agnostic — the session id lives in the URL and results are
published on a per-session channel — so this is **config injection, not new server code**. What
differs is *where* the config can be injected, and that decides whether a workspace session gets
everything or only what its directory registered (`common/guiMcpAgents.ts` is the authority, and
its comment explains each agent's case). Three shapes exist: a per-spawn flag (claude, codex → the
full GUI MCP), a file in the working directory (agy, grok → per-group toggles), and a per-machine
plugin (muse → per-group, resolved back to a session by walking the process tree). A candidate CLI
needs one of these plus a way to **auto-approve** the server's tools, or every tool call prompts.

**19 · Agent-native permission mode.** Separate from row 18, which is about the GUI MCP server's
own tools: this is whether the CLI stops on *its own* approval prompt. A grid cell is often not
being watched, and a collection action or a background chat is not being watched at all, so an agent
that opens a modal nobody answers is stuck with no indication. Four of the five are given an
explicit answer — claude `--permission-mode` (overridable with `CLAUDE_PERMISSION_MODE`), agy
`--dangerously-skip-permissions`, grok `--permission-mode auto`, muse `--yolo`. **Codex is given
none**, and that combines badly with row 9: its approval prompt is drawn in the TUI, and it is also
the one thing codex never reports as "waiting". So for a candidate CLI, find the unattended mode and
name it — or record that background runs are unsupported for it, which is a legitimate answer and a
much better one than discovering it from a hung cell.

**20–22 · Skills and seeds.** A seed prompt only needs "the CLI takes a first message as an
argument" — all five do, and `server/session/session-settings.ts` handles the Windows newline case
by passing a file instead. Skills need the CLI to find `SKILL.md`-shaped directories. Only two of
the five need anything written for them: codex reads a mirror we refresh into `~/.codex/skills`, and
agy is the one agent that can see neither of claude's skill roots on its own, so both are written
into `.agents/skills.json` per directory. Claude, grok and muse index those roots themselves, so
"not mirrored" there means "nothing to mirror", not "no skills".

That last fact deserves its provenance stated, because it is the one row in this table that **no
code in this repo enforces**: it comes from an audit of the five CLIs recorded in `4ac65c8b`'s
commit message, and that commit changed only the agy and codex paths — precisely because grok and
muse needed nothing written. So it was true of the grok and muse builds measured then, and a future
release of either could stop indexing those roots with nothing here going red. Re-measure it rather
than inheriting it. Slash commands are **claude-only**, so `src/components/skillSeed.ts` sends every
other agent a plain `Use the "<slug>" skill.` sentence — which means a new agent gets a working seed
before anyone teaches it anything. Draft injection needs a status-line marker saying the input
box is ready, **captured from a real session rather than guessed** — a guessed one types into
nothing, which is why codex, agy, grok and muse all omit `draftReadyMarker` rather than carry a
hopeful regex. Do not expect one string to hold, either: claude's has already drifted once, so
`server/agents/claude.ts` matches two spellings and still falls back to a quiet timer for a version
that prints neither.

**24 · Custom-agent wrapper.** `CUSTOM_AGENT_KINDS` is claude-only on purpose: an entry declares
which CLI's argv gets appended to the user's command, so adding a kind means teaching the spawn to
build *that* agent's argv. It is not a label, and nothing may infer it from the command text
(CLAUDE.md, "A launcher chip is not one of those paths").

## Evaluating a candidate CLI

Answer these against the **real binary**, not its documentation, and record the answers in the
issue. (*Open candidates* below is the one place in this file that breaks that rule on purpose: it
records what two vendors' docs claim, precisely so this list can be run against the questions those
docs leave open rather than against all of them.) The order runs roughly cheapest-first, but only the FIRST answer gates the others —
a CLI that will not run in a PTY has no tier at all. After that the capabilities are largely
independent: a CLI can expose hooks and have no durable resume, or keep a token record and
take no MCP config. So a "no" tells you which capability is out, not that everything below
it is.

**What the commands below have to ESTABLISH, in case yours must differ:** that the CLI runs in a
PTY; whether a session id can be given to it or must be discovered; *where on disk* a conversation
lands and whether that path is addressable; and whether a turn's start and end are written anywhere
a tail can see. The shell is one way to establish those on macOS, not the definition of the test —
this block has already been corrected three times for its own shell bugs, which is the honest
argument for reading it as an illustration and adapting it rather than pasting it.

```bash
<cli> --help                 # does it run in a PTY at all; is there a --model
<cli> --help | grep -i -e session -e resume -e continue -e thread
<cli> --help | grep -i -e mcp -e config -e approve -e allow
<cli> --help | grep -i -e permission -e approval -e yolo -e sandbox -e auto
<cli> --help | grep -i -e hook -e notify -e event -e json -e stream

# WHERE a conversation lands. Ask around a REAL turn: starting the CLI usually writes
# nothing, and codex proved the file can appear minutes later — so a `find` run straight
# after launch reports "no store" for an agent that has one.
#
# ROOTS is an ARRAY and is quoted on use: "Library/Application Support" contains a space,
# so an unquoted "$ROOTS" word-splits into paths that do not exist, and with 2>/dev/null
# swallowing the errors find then reports NOTHING for a CLI that has a store.
ROOTS=("$HOME/.<cli>" "$HOME/.config/<cli>" "$HOME/Library/Application Support/<cli>")
mark=$(mktemp)     # a timestamp to measure against
#   ... start <cli>, send ONE prompt, WAIT for the reply to finish, then exit ...
find "${ROOTS[@]}" -type f -newer "$mark" 2>/dev/null

# `-newer`, not a before/after diff of the file LIST: a CLI that appends this turn to a
# store it already had (one history file, an index) creates no new path, and a listing
# diff reports nothing for it. Modification time catches both shapes.
#
# Several paths usually move — an index, a lock, a log. Pick the conversation file out of
# that list yourself, then answer the question rows 9-10 turn on: send a SECOND prompt
# with this running, and watch for one record as the turn starts and one as it ends.
store=<the path you picked>
tail -f "$store"
```

1. **Spawn** — does it work in a PTY, and is there an env var or absolute path to override the
   binary? (tier 1 is now reachable)
2. **Id** — can we pass a session id, or does it mint one? If it mints one, *where does it land on
   disk*, and can a directory listing before/after a spawn attribute it unambiguously?
3. **Resume** — flag or subcommand, and does it need the working directory named as well (muse
   does)?
4. **Turn boundaries** — hooks, or a per-turn append-only log? **Does it report being blocked on
   input**, or is its approval prompt TUI-only (codex's limitation)? This is the notification
   answer; get it explicitly.
5. **MCP** — flag, directory config file, or per-machine registration? Can its tools be
   auto-approved without a prompt?
6. **Tokens** — is there a per-turn usage record, and does it publish its own context window (so no
   guessing table is needed)?
7. **Skills** — does it load `SKILL.md` directories, and from which root?
8. **Draft marker** — is there a stable "input ready" string? Capture it from a real session, never
   guess it.

## What adding one touches

**Do not take this list on trust — re-derive it.** The two most recent additions are the ground
truth, and they are one command each:

```bash
git show --name-only --pretty=format: 58be8509   # grok  (52 files)
git show --name-only --pretty=format: d8c6e2cc   # muse  (32 files)
```

What follows is those two commits grouped, so the shape is visible before you start. **It is
illustrative, not exhaustive** — the two additions did not touch the same set, and a third will
touch neither exactly. It is accurate as of this document's date and it will rot; the commands above
will not.

**The agent's own files** — `server/agents/<agent>.ts` (the adapter), `<agent>-args.ts`, and
whichever of `<agent>-session.ts` / `-sessions.ts` / `-usage.ts` / `-mcp.ts` / `-skills.ts` the
answers above call for; `server/session/spawn-<agent>.ts`. An agent that reads MCP from a file in
the directory also pulls in the shared helpers for that — `server/agents/gui-mcp-bridge.ts` and
`git-exclude.ts`, both of which the grok commit created — **and may refactor an existing agent's
copy while doing it** (that commit removed 41 lines from `antigravity-mcp.ts` and added 9, pulling
the shared parts out into those two files). Budget for touching a sibling agent, not just for
adding one.

**The typed lists — these are the cheap half.** `server/agents/types.ts` (`AgentKind`) and
`registry.ts`; `common/sessionAgent.ts` (`SESSION_AGENTS`, `TERMINAL_AGENTS`, `AGENT_BADGES`),
`common/launchAgent.ts`, `common/agentSessionList.ts`, `common/guiMcpAgents.ts`;
`server/session/spawners.ts` and `spawn-deps.ts`. Several are `Record<TerminalAgent, …>` *precisely*
so a new agent is a type error rather than a silent omission (#1417) — so the compiler walks you
through this group.

**The shared runtime wiring — these are the expensive half, and nothing makes you visit them.**
`server/routes/ws-routes.ts` (the connect/admit path; 87 lines in the grok commit alone),
`server/routes/routeParams.ts`, `server/routes/terminal-ws-path.ts`, `server/routes/session-routes.ts`
(the history route), `server/routes/plugin-routes.ts` (the `<agent>-run` seed mode),
`server/routes/app-routes.ts`, `server/index.ts` (bin/model/env and the spawner wiring),
`server/session/registry.ts`, `server/session/background-chat.ts`, `server/session/session-reads.ts`,
`server/session/agent-badges.ts`, `server/session/survivor-agent-guard.ts` (what durable evidence
proves a survivor is this agent), `server/backends/remoteHost/terminalScreen.ts`, and
`server/config/header-config.ts` / `header-context.ts` where a header button can scope to an agent.

**The UI.** `src/components/agentPicker.ts` (the label), `wsUrl.ts`, `gridTabs.ts`, `GridView.vue`,
`AgentMark.vue`, `modelBadge.ts`.

**And the parts that are not code.** The specs an addition commonly has to touch — both commits
moved `test/server/session/spawn-custom-agent.spec.ts`,
`test/server/session/tool-group-reattach.spec.ts`, `test/src/components/CellLaunchForm.spec.ts` and
`test/src/components/TerminalCell.spec.ts`; only the grok one also moved
`test/server/agents/registry.spec.ts` and `test/server/routes/worker-failure-wiring.spec.ts` — plus
the new agent's own; `server/skills/mulmoterminal-model/SKILL.md` if the agent has a model to choose;
README's agent section, env table and picker enumerations; the bilingual guide pages the grok commit
updated (`docs/guide/{en,ja}/{basics,config,faq,glossary}.md`); and **this matrix**. A plan file
(`plans/feat-<agent>-agent.md`) if the work is big enough to want one — grok had one, muse did not,
so it is a judgement rather than a step.

## Open candidates

Two provenances below, and they are not equal. **GitHub Copilot CLI is MEASURED** — against
`copilot` 1.0.83 on macOS, 2026-09-14, and the measurement contradicted the documentation in three
places, one of which changes the answer to #2055. **Cursor CLI is documentation only**: the binary is
not installed on any machine this was written against, so its rows are the third and weakest kind of
claim this file carries — not derived from our code, not measured against a CLI, just read off a
vendor page on 2026-09-14.

### GitHub Copilot CLI (`copilot`) — measured against 1.0.83

Claude-shaped on every axis that decides the adapter's structure.

| Row / tier | Measured |
|---|---|
| 1 | `copilot`, interactive TUI, `--model`, `-C <dir>` |
| 1a (19) | `--allow-all-tools` (env `COPILOT_ALLOW_ALL`), `--allow-all` / `--yolo`, `--deny-tool`, `--add-dir` |
| **2 (5-8)** | **`--session-id <uuid>` sets the UUID for a NEW session** — so the id is OURS, as with claude, and the whole launch-discover-resume apparatus codex, agy and muse need is not needed. Verified: the directory `~/.copilot/session-state/<the uuid we passed>/` appeared. Resume is `-r, --resume[=value]` / `--continue` |
| **3 (9, 10)** | hooks `userPromptSubmitted` (carries `prompt`) and `agentStop` (carries `transcriptPath`, `stopReason`) — both fired |
| **3a (9, 10)** | **weaker than the docs imply — see below** |
| 3b (11, 14) | `preToolUse` (`toolName`, `toolArgs`) and `postToolUse` (+ `toolResult`) — both fired |
| 12 | `agentStop`'s `transcriptPath` |
| 15 | `--usage-output-file <file>` writes final usage statistics as JSON (not yet exercised) |
| 18 | `--additional-mcp-config <json>` — a **flag**, taking a JSON string or `@file`, repeatable, augmenting `~/.copilot/mcp-config.json`. The same shape claude's `--mcp-config` has, so this is a candidate for `FULL_GUI_MCP_AGENTS` rather than the per-directory group toggles |
| 20 | `copilot skill`, `~/.copilot/skills/` |

Every payload carries `sessionId`, `timestamp` and `cwd`. One global hook file therefore identifies
every session, and nothing has to be generated per spawn the way claude's `--settings` is.

**Three places the binary disagreed with the documentation.** Each was found by running it, and each
changes what an adapter must do:

1. **Hooks load from the USER-level directory only.** `$COPILOT_HOME/hooks/*.json` fired.
   `.github/hooks/*.json` in the working directory did not, and neither did a `hooks` block in
   `.github/copilot/settings.json` — both are documented, and with `--log-level all` the hooks
   subsystem logged nothing about either. So hook injection is machine-global, not per directory.
2. **`type: "http"` hooks did not fire.** A hook posting to a local listener produced no request;
   the identical event list as `type: "command"` fired every time. So a hook has to shell out
   (`curl`), and the `timeoutSec` and a failure that stays quiet both matter.
3. **`permissionRequest` is not a "blocked" signal.** It fired **with `--allow-all-tools` set**, 8 ms
   before `postToolUse`, on a turn where nothing was ever asked — it runs *before the permission
   service*, whatever that service then decides. So tier 3a is NOT free here: being blocked has to
   be inferred from a `permissionRequest` that is not followed by its `postToolUse` within a window.
   Better than codex, which reports nothing at all and names no tool — but an inference, not a
   report, and it must be written down as one.

Events seen in one turn: `sessionStart`, `userPromptSubmitted`, `preToolUse`, `postToolUse`,
`permissionRequest`, `agentStop`, `sessionEnd`. Not yet seen: `notification` (documented CLI-only;
no attention condition arose) and `postToolUseFailure` (nothing failed).

### Cursor CLI (`agent`, formerly `cursor-agent`) — [#2055](https://github.com/receptron/mulmoterminal/issues/2055)

Documentation only. Nothing below has been run.

| Row / tier | What the docs say |
|---|---|
| 1 | `agent`, `--model`, `--workspace` |
| 1a (19) | `-f` / `--force` (`--yolo`), `--sandbox <enabled\|disabled>`, `--approve-mcps`, `--trust` (headless only) |
| 2 (5-8) | **`agent create-chat` returns a chat id** — so the id can be minted BEFORE the spawn, as with copilot's `--session-id`. Then `--resume [chatId]`, `--continue` (an alias for `--resume=-1`), `agent ls` |
| 3 (9, 10) | hooks `beforeSubmitPrompt` and `stop` (`status`: `completed` / `aborted` / `error`), plus `afterAgentResponse`. The hooks table marks these **CLI Support: Yes** |
| **3a** | **nothing.** No event reports being blocked; the `before*` hooks can RETURN `"ask"`, but that is us causing a prompt, not being told about one |
| 3b (11, 14) | `preToolUse`, `postToolUse`, `postToolUseFailure` |
| 18 | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` — a **file**, so agy/grok-shaped: per-group toggles, not the workspace's whole GUI MCP |
| 20 | `.cursor/rules` and `--plugin-dir`, not `SKILL.md` — the seed sentence would work, the mirror would not |

Every hook payload is documented to carry `conversation_id`, `workspace_roots` and
`transcript_path`, so a single `~/.cursor/hooks.json` would attribute correctly.

**The risk, and it is the whole verdict:** several community reports say the CLI in practice emits
only `beforeShellExecution` and `afterShellExecution` — that `subagentStart` / `subagentStop` never
fire, and that the AskQuestion tool skips `preToolUse` / `postToolUse`. That contradicts the
documentation table, and the Copilot measurement above is the reason to take it seriously: three of
that vendor's documented claims failed on contact too. **So the first thing to do for Cursor is not
to write an adapter — it is to put a `stop` hook in `~/.cursor/hooks.json`, run one turn, and see
whether it fires.** If it does not, the fallback is headless `--output-format stream-json`, which
documents a real event stream (`system`, `assistant`, `tool_call` with `started` / `completed`,
`result`) — but that is print mode, not the interactive TUI a cell runs, so it answers a different
question.

### What is left to measure

| Candidate | The probe that decides it |
|---|---|
| GitHub Copilot CLI | **done for tiers 1-3b.** Still open: does `notification` ever fire, does `--usage-output-file` give a per-turn number or only a final one, and does `--additional-mcp-config` really take a per-session URL |
| Cursor CLI | a `stop` hook in `~/.cursor/hooks.json` that appends to a file. Run one turn. Did it fire? |
