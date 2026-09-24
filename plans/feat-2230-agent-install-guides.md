# feat: an agent that cannot start is dimmed, and says where to install it (#2230)

Built on #2229's `GET /api/agents/availability`. Also takes the picker half #2229 left for after
#2215's launch screen, which has landed (#2235): a greyed-out agent with no explanation is what this
issue exists to prevent, so the two ship together.

## Decisions (settled with the user before implementation)

- **This issue also covers the picker's unavailable state** (scope comment on #2230).
- **Links only, never install commands.** This follows the existing rule in `bin/agent-bins.js`.
- **One URL table**, read by both the picker and the CLI's missing-agent message.
- **Dimmed but pickable.** Picking an unavailable agent shows why it cannot start, its install link
  and a restart note, and Start is disabled. A disabled option can hold no link, and a permanent
  list of every uninstalled agent would clutter the common case of one or two agents installed.
- **The URLs are data, kept in one file that is easy to maintain** (the user's request).

## Design

- `bin/agent-install-guides.json` holds `{ <agent>: { url, checked } }`, with each URL a page on the
  maker's own domain, opened and confirmed on the `checked` date. `bin/agent-install-guides.js` is
  its loader (`agentInstallGuide(agent)`). It lives in `bin/` because the CLI message runs before
  tsx; the server imports from `bin/` already.
- The server adds `installGuide: string | null` to each unavailable entry.
- `bin/default-agent.js` adds an `Install guide:` line for the agent it failed on.
- The browser side:
  - `parseAgentAvailabilityResponse` in `common/agentAvailability.ts` reads the response entry by
    entry and keeps only https links.
  - `useAgentAvailability` fetches once per page. A failed fetch blocks nothing, which is the
    behaviour from before this change.
  - In `CellLaunchForm.vue`, unavailable options are dimmed, and the notice under the picker is
    worded by reason in five languages. Every path that starts the picked agent goes through
    `startAt`: Start, Enter, a chip's launch button, creating a worktree (checked before the branch
    is cut), and a worktree row's fresh start. A row that resumes keeps its own agent.

## Verified URLs (2026-09-24)

Each was fetched and confirmed to give install steps for the command this app runs:

- claude: code.claude.com
- codex: learn.chatgpt.com, redirected from developers.openai.com
- antigravity: antigravity.google
- grok: docs.x.ai
- muse: dev.meta.ai
- copilot: docs.github.com
- cursor: cursor.com. Its installer creates both `agent` and `cursor-agent`.
