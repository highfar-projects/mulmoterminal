# feat: weekly room in the account mark's menu (#2954)

The menu from #2950 lists subscriptions blind. Each entry now shows what is left of its weekly window.

- The figure is `tokenUsageRows`' (the Token usage screen's), fed by `useRateLimits().snapshot`, which the toolbar gauge already polls on the grid route. A cell only reads it and starts no probe: a probe costs a query per token.
- A subscription with no reading shows nothing rather than zero; one at its limit says so; a window past its reset counts as full.
- The `/login` entry reads the gauge's own default-login reading (`snapshot.claude` and its probe state), which is not among the per-token readings; it is joined in locally so the Token usage screen still lists only configured tokens.
- Not covered: a view where the gauge is not mounted keeps the entries blank, by design.
