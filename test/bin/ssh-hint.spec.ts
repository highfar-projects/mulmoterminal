// @vitest-environment node
import { describe, it, expect } from "vitest";
import { configuredRemoteServer, inSshSession, sshTunnelHintLines } from "../../bin/ssh-hint.js";

// #2669. Started over SSH, the launcher opens no browser on that machine and says how to reach it
// through a port forward instead.
describe("inSshSession", () => {
  it("is true when sshd set either variable", () => {
    expect(inSshSession({ SSH_CONNECTION: "10.0.0.2 51234 10.0.0.9 22" })).toBe(true);
    expect(inSshSession({ SSH_CLIENT: "10.0.0.2 51234 22" })).toBe(true);
  });

  it("is false for a local shell, including empty values", () => {
    expect(inSshSession({})).toBe(false);
    expect(inSshSession({ SSH_CONNECTION: "", SSH_CLIENT: "" })).toBe(false);
    expect(inSshSession({ SSH_AUTH_SOCK: "/tmp/agent.sock" })).toBe(false); // an agent is not a login
  });
});

describe("sshTunnelHintLines", () => {
  it("names the port on both ends and the login user, and leaves the host to fill in", () => {
    const lines = sshTunnelHintLines({ SSH_CONNECTION: "10.0.0.2 51234 172.17.0.2 22", USER: "dev" }, 34567);
    expect(lines).not.toBeNull();
    const text = (lines ?? []).join("\n");
    expect(text).toContain("ssh -N -L 34567:127.0.0.1:34567 dev@<this-host>");
    expect(text).toContain("http://localhost:34567");
    // The address this side answered on is not guessed at: behind a container it is unreachable.
    expect(text).not.toContain("172.17.0.2");
  });

  it("falls back to LOGNAME, then a placeholder, for the user", () => {
    expect(sshTunnelHintLines({ SSH_CLIENT: "x", LOGNAME: "ops" }, 4000)?.join("\n")).toContain("ops@<this-host>");
    expect(sshTunnelHintLines({ SSH_CLIENT: "x" }, 4000)?.join("\n")).toContain("<user>@<this-host>");
  });

  it("is null when not over SSH", () => {
    expect(sshTunnelHintLines({ USER: "dev" }, 34567)).toBeNull();
  });
});

// #2669 (experimental): remoteServer in the config also keeps the launcher from opening a browser
// here, when it was started without SSH (a service, a remote desktop).
describe("remoteServer in the launcher", () => {
  it("reads only a literal true", () => {
    expect(configuredRemoteServer({ remoteServer: true })).toBe(true);
    [{ remoteServer: "true" }, { remoteServer: 1 }, {}, null, "x"].forEach((c) => expect(configuredRemoteServer(c)).toBe(false));
  });

  it("gives the tunnel lines without SSH when remoteServer is set, and says why", () => {
    const text = (sshTunnelHintLines({ USER: "dev" }, 34567, true) ?? []).join("\n");
    expect(text).toContain("remoteServer is set");
    expect(text).toContain("ssh -N -L 34567:127.0.0.1:34567 dev@<this-host>");
  });

  it("stays null with neither", () => {
    expect(sshTunnelHintLines({ USER: "dev" }, 34567, false)).toBeNull();
  });
});
