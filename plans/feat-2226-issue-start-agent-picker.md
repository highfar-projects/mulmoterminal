# feat: choose the agent (and account) an issue's work starts in (#2226)

The last piece after #2227 (resumed session keeps its agent), #2228 (issue start takes an agent),
#2229 (agent availability) and #2230 (install guidance).

## Decisions (settled with the user)

- **A dropdown at the top of the PRs & Issues view**, not a menu on every start button. The initial
  value is `defaultAgent`, and the choice is remembered per browser.
- **Accounts are included** (#2215, claude and codex only). The account dropdown appears beside the
  agent dropdown when that agent has accounts configured. The phone path stays on the default login.
- **An account id the config does not have is a 400**, as an unknown agent is. The launch form's
  path silently falls back to the default login; this route refuses instead, because running on the
  wrong subscription is a mistake nobody would notice.
- **A standing warning beside the dropdown** while a non-Claude agent is picked. It says the issue
  text runs at once under that agent's tool auto-approval (the requirement recorded on #2226 from
  #2234). There is no per-click confirmation.
- **Custom agents are not offered.** They need `customAgentId` threaded into Claude's spawn; that
  would be its own issue if wanted.
- A resumed session keeps its own agent and account (#2227). The picker only affects new sessions.

## Server

- `SpawnIssueSession` gains `account: string | null`. `createIssueSessionSpawner` binds the new
  session to its account (`bindSessionAccount`, with no transcript to find for a new id) before
  spawning, so the spawn's `accountSpawnEnv` finds it.
- `requestedIssueAccount(raw, agent, accounts)`: absent or null is the default login; the id of one
  of THAT agent's configured accounts is itself; anything else is refused.
- `POST /api/issues/start` reads `account` and answers 400 when it is refused. The phone passes null.

## Browser

- `useIssueStartAgent`: the picked agent and account, remembered per browser (their own
  localStorage keys, not the chat launcher's). An account is dropped when it no longer belongs to
  the picked agent or to the config.
- `IssueStartAgentPicker.vue` sits in the `GithubPane` toolbar. It shows the agent select (an agent
  this machine cannot start is marked and disabled), the account select when there are accounts,
  and the auto-run warning. An unavailable stored pick shows #2230's notice and blocks starting.
- `useIssueStart` sends `agent` and `account`, and refuses to start an unavailable agent.
- The words go into vue-i18n in all five locales. The rest of this view is still hardcoded English
  (#1566 moves surfaces one at a time).
