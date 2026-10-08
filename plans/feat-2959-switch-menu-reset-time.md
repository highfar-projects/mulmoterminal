# feat: time until the week resets in the account mark's menu (#2959)

Follow-up to #2954. Under each subscription's weekly room the menu now says how long until that window resets, in the Token usage screen's wording (`resetsIn`).

- The reset time rides on the same row `tokenUsageRows` already builds (`sevenDay.resetsAt_sec`), so there is no second source. A window already past its reset carries none, and the line is omitted.
- Computed when the menu draws, so it is as fresh as the click that opened it.
