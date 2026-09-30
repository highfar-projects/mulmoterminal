# feat: `mulmoterminal stop --port` stops one server of several (#2683)

`stop` ends every registered server; with two running there was no way to end only one, and the
second server's banner told its user to run the command that would end both.

## Change

- `parseStopArgs` takes `--port <port>` (read by the launcher's own `parsePortArg`, so the same
  values are accepted; `PORT` from the environment is not consulted). A bad value is an error, never
  "stop everything".
- `selectByPort` narrows the registry; with nothing on that port, `noServerOnPortReport` names what
  IS running and exits 0 (the state asked for, like "not running").
- The `--force` hint after `stop --port` keeps the port, so a retry cannot widen to every server.
- The ready banner (`stopCommandForThis`) shows `stop --port <this port>` once another server is
  registered, the plain command otherwise.

Checked with two real servers under a scratch HOME: the second banner named its port, `stop --port`
ended only it, an unused port listed the running one, a plain `stop` ended the rest.
