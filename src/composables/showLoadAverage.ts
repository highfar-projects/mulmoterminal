import { createGlobalFlag } from "./globalFlag";
import { SHOW_LOAD_AVERAGE_DEFAULT } from "../../common/showLoadAverage";

// Whether the grid header draws this machine's load average beside the usage gauges (#1786),
// hydrated from /api/config. ON unless the config says `false`: the read-out is the feature, and
// a header that has to be switched on is one nobody finds.
//
// The default lives in common/showLoadAverage.ts, so this side cannot disagree with what the
// server does with the same file. The key stays literal here on purpose — see that file.
//
// It only decides whether to ASK. A host that keeps no load average draws nothing regardless —
// that is `keepsLoadAverage` in common/machineLoad.ts, and not a setting.
const flag = createGlobalFlag("showLoadAverage", SHOW_LOAD_AVERAGE_DEFAULT);

export const showLoadAverage = flag.state;
export const setShowLoadAverage = flag.set;
export const saveShowLoadAverage = flag.save;
