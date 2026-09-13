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

## The short version

| Tier | What it buys the user | What it costs |
|---|---|---|
| **0 — launcher chip** | the CLI runs in a cell | nothing. Any command already works; it is recorded as `agent: "shell"`, so no resume, no cost, no status |
| **1 — built-in agent** | Agent Picker entry, its own WS endpoint, a seeded prompt, a badge | a `bin()` + env override, an argv builder, a spawner, a route, six list entries |
| **2 — identity** | resume after a reload, a survivable session, the "or resume here" history list | the CLI must either take a session id we mint, or write one somewhere we can discover and map |
| **3 — status** | **the cell's working/waiting dots, the attention sound, Web Push** | the CLI must announce its own turn boundaries: a hook mechanism, or a log it appends to per turn |
| **4 — panel** | the GUI MCP tools (charts, forms, images, AskUserQuestion) | an MCP injection point we can aim at a per-session URL, with its tools auto-approved |
| **5 — accounting** | `ctx 33%`, `⇡1.2M ⇣18k`, dollar cost, the rate-limit gauge | a readable token record per turn; a published context window; for `$`, a price table |

Tier 3 is the one issue #2055 is about, and it is the one that cannot be bought with configuration:
**an agent that does not tell anyone when a turn starts or ends cannot drive a notification.** It is
also the tier where the five current agents split 2/3 — though for grok and muse what is missing is
the *wiring*, not the record; rows 9-10 below say which is which, and the difference decides whether
a request like #2055 is a day of work or a design problem.

## The matrix

Read `—` as *not wired*, not as *impossible*.

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
| 11 | Work phase (planning vs implementing) | yes (from `PreToolUse`) | — | — | — | — |
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
restart (`server/session/agent-conversations.ts`, `agent-resume.ts`). Either way the requirement is:
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
call — and **both files are already tailed**, by the same incremental fold, for the token badges in
row 15 (`server/agents/grok-usage.ts`, `muse-usage.ts`). What is absent is the step codex has and
they do not: translating those records into `setWorking` / `setWaiting`. Muse carries one real
design question with it — `model_completed` is per model CALL, so one user turn can produce several
and the turn's *end* is not stated outright — but grok's record is a turn boundary already.

Agy is the genuinely hard one of the three: its accounting is per-generation protobuf rows inside a
SQLite database (`server/agents/antigravity-proto.ts`), not an append-only log with a turn boundary
in it.

So the question to ask of a candidate CLI is not "does it have hooks" but **"where does it write a
turn's start and end, and can that be tailed live?"** — and if the honest answer is "nowhere but the
screen", say so plainly in the issue. That is the answer to "can it beep like Claude does?".

Everything downstream of the flags is free once they exist: `common/notifyKinds.ts`,
`src/composables/notifyKind.ts`, the push rules and the cockpit dots all read the published
`working` / `waiting` row and know nothing about which agent produced it.

**11–14 · Transcript reading.** Requires a **machine-readable, per-session conversation log** with
user turns and assistant turns distinguishable — and, for the AI title and the decision log,
claude's specific record shapes. `server/session/last-turn.ts` normalizes claude and codex into one
`LastTurn`; a third agent means a third reader there, and until it exists the header shows no
prompt, handoff has nothing to copy, and a round-table seat contributes nothing.

**15–17 · Accounting.** Needs a file where token counts per turn (or a current context reading) can
be found. All five clear this, by four different routes — claude's transcript `message.usage`,
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
into `.agents/skills.json` per directory. Claude, grok and muse index those roots themselves
(`4ac65c8b` is the audit that established it), so "not mirrored" there means "nothing to mirror",
not "no skills". Slash commands are **claude-only**, so `src/components/skillSeed.ts` sends every
other agent a plain `Use the "<slug>" skill.` sentence — which means a new agent gets a working seed
before anyone teaches it anything. Draft injection needs a *stable* status-line marker saying the
input box is ready; a guessed one types into nothing, which is why codex, agy, grok and muse all
omit `draftReadyMarker` rather than carry a hopeful regex.

**24 · Custom-agent wrapper.** `CUSTOM_AGENT_KINDS` is claude-only on purpose: an entry declares
which CLI's argv gets appended to the user's command, so adding a kind means teaching the spawn to
build *that* agent's argv. It is not a label, and nothing may infer it from the command text
(CLAUDE.md, "A launcher chip is not one of those paths").

## Evaluating a candidate CLI

Answer these against the **real binary**, not its documentation, and record the answers in the
issue. The order is the tier order, so the first "no" tells you where the ceiling is.

```bash
<cli> --help                 # does it run in a PTY at all; is there a --model
<cli> --help | grep -i -e session -e resume -e continue -e thread
<cli> --help | grep -i -e mcp -e config -e approve -e allow
<cli> --help | grep -i -e permission -e approval -e yolo -e sandbox -e auto
<cli> --help | grep -i -e hook -e notify -e event -e json -e stream

# WHERE a conversation lands. Snapshot every documented root, and do it around a REAL
# turn: starting the CLI usually writes nothing, and codex proved that the file can
# appear minutes later — so a `find` run straight after launch reports "no store" for
# an agent that has one.
ROOTS="$HOME/.<cli> $HOME/.config/<cli> $HOME/Library/Application Support/<cli>"
before=$(find $ROOTS -type f 2>/dev/null | sort)
#   ... start <cli>, send ONE prompt, WAIT for the reply to finish, then exit ...
comm -13 <(echo "$before") <(find $ROOTS -type f 2>/dev/null | sort)

# Then the question rows 9-10 turn on: does that file grow DURING a turn, with a
# record at the start and at the end? Send a second prompt with this running.
tail -f <the file that appeared>
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

What follows is those two commits grouped, so the shape is visible before you start. It is
accurate as of this document's date and it will rot; the commands above will not.

**The agent's own files** — `server/agents/<agent>.ts` (the adapter), `<agent>-args.ts`, and
whichever of `<agent>-session.ts` / `-sessions.ts` / `-usage.ts` / `-mcp.ts` / `-skills.ts` the
answers above call for; `server/session/spawn-<agent>.ts`.

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

**And the parts that are not code.** The specs both commits had to touch
(`test/server/agents/registry.spec.ts`, `test/server/session/spawn-custom-agent.spec.ts`,
`test/server/session/tool-group-reattach.spec.ts`, `test/src/components/CellLaunchForm.spec.ts`,
`test/src/components/TerminalCell.spec.ts`, plus the new agent's own); `plans/feat-<agent>-agent.md`;
`server/skills/mulmoterminal-model/SKILL.md` if the agent has a model to choose; README's agent
section, env table and picker enumerations; the bilingual guide pages the grok commit updated
(`docs/guide/{en,ja}/{basics,config,faq,glossary}.md`); and **this matrix**.

## Open candidates

Neither binary is installed on any machine this was written against, so the rows below are
deliberately empty rather than guessed. Fill them in by running the probe list above.

| Candidate | Issue | Status |
|---|---|---|
| Cursor CLI | [#2055](https://github.com/receptron/mulmoterminal/issues/2055) | not evaluated. The request is explicitly tier 3 — "the notification sound and the cell status", not merely launching it. So the deciding question is #4 above: does it emit turn boundaries anywhere but the screen? |
| GitHub Copilot CLI | — | not evaluated. Same first question; note also that its conversation store and MCP configuration shape decide tiers 2 and 4 independently. |

Until #4 is answered for a candidate, the honest reply to "can you support it?" is: *it can be
launched today as a launcher chip, and whether it can beep depends on a fact we have not measured.*
