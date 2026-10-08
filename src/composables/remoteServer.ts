import { createGlobalFlag } from "./globalFlag";
import { REMOTE_SERVER_DEFAULT } from "../../common/remoteServer";

// Experimental (#2669): the server runs on another machine than this browser, hydrated from
// /api/config. The default lives in common/remoteServer.ts.
const flag = createGlobalFlag("remoteServer", REMOTE_SERVER_DEFAULT);

export const remoteServer = flag.state;
export const setRemoteServer = flag.set;
export const isRemoteServer = flag.read;
export const saveRemoteServer = flag.save;

// What an action that would act on the server's machine says instead, when the flag is on.
export const REMOTE_SERVER_DECLINE_EN = "The server runs on another machine (remoteServer), so this would open there, not here.";
