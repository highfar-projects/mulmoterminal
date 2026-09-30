// The one place the experimental `remoteServer` setting is defined (#2669): the server runs on
// another machine than the browser (reached through an SSH tunnel), so the actions that act on the
// SERVER's machine — its file manager, its file dialog, its default apps — would happen where nobody
// is looking. Both sides decide from it, like paletteSearchBox.

/** OFF unless the config says otherwise. Nothing can detect this from the server: through a tunnel
 *  the browser's connection comes from loopback, exactly as a local one does. */
export const REMOTE_SERVER_DEFAULT = false;

/** Anything that is not a boolean is "unconfigured". */
export const sanitizeRemoteServer = (input: unknown): boolean => (typeof input === "boolean" ? input : REMOTE_SERVER_DEFAULT);
