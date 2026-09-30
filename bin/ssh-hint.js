// A launcher started over SSH is on a machine whose screen nobody is looking at: the browser that
// should open this is on the other end of the connection. So it does not try to open one here — on
// a remote Mac that would put a window on a display no one sees — and it says how to reach the
// server from there instead: an SSH port forward, the route the FAQ recommends. Nothing here reads
// the process; the caller passes its environment.

/** Whether this process runs inside an SSH login. sshd sets both variables; either is enough. */
export function inSshSession(env) {
  return Boolean(env.SSH_CONNECTION || env.SSH_CLIENT);
}

/**
 * The lines that tell someone on the other end of the SSH connection how to open this server, or
 * null when this is not an SSH login. The host is left for them to fill in: SSH_CONNECTION names the
 * address THIS side answered on, which behind NAT or a container is not one their machine can reach.
 */
export function sshTunnelHintLines(env, port) {
  if (!inSshSession(env)) return null;
  const user = env.USER || env.LOGNAME || "<user>";
  return [
    "Started over SSH, so no browser is opened here. On your own machine, run:",
    `  ssh -N -L ${port}:127.0.0.1:${port} ${user}@<this-host>`,
    `then open http://localhost:${port} there.`,
  ];
}
