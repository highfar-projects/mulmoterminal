import os from "node:os";
import { machineLoadFrom, type MachineLoad } from "../../common/machineLoad.js";

// The only place in the server that reads the machine's load. Everything that DECIDES anything
// from it is in common/machineLoad.ts, where it can be tested without a busy machine.
//
// `os.cpus().length` rather than `os.availableParallelism()`, deliberately: the load average is
// the WHOLE machine's run queue (Linux reads it from the host's /proc/loadavg even inside a
// container), so the count it is divided by has to describe the same machine. Parallelism is an
// affinity-limited estimate of what this process may use, and dividing a host-wide numerator by
// it reports a load the host is not under.
export const readMachineLoad = (): MachineLoad | null => machineLoadFrom(os.loadavg(), os.cpus().length, process.platform);
