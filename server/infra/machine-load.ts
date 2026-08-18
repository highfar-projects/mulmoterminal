import os from "node:os";
import { machineLoadFrom, type MachineLoad } from "../../common/machineLoad.js";

// The only place in the server that reads the machine's load. Everything that DECIDES anything
// from it is in common/machineLoad.ts, where it can be tested without a busy machine.
//
// `os.cpus()` rather than a cached count: a container's CPU allowance can change under the
// process, and the call is a cheap kernel read on the same 10-second poll the figures come from.
export const readMachineLoad = (): MachineLoad | null => machineLoadFrom(os.loadavg(), os.cpus().length, process.platform);
