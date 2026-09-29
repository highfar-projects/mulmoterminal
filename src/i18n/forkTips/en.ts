// Tooltips and aria-labels for UI this fork added on top of upstream (reconnect, the resume list's
// rename / delete, the launch.json menu, the devcontainer badge and its buttons). Kept apart from
// upstream's tips files so an upstream merge never has to carry them through its own edits; each
// bundle takes it as its own `forkTips` section, so upstream's `tips` type is left alone.
export const forkTipsEn = {
  reconnect: "Reconnect this session",
  renameSession: "Rename this session",
  renameSessionNamed: "Rename the session {title}",
  deleteSession: "Delete this session permanently",
  deleteSessionNamed: "Permanently delete the session {title}",
  launchConfigMenu: "Run a .vscode/launch.json configuration in a spare terminal",
  switchToStack: "Switch to card stack",
  switchToGrid: "Switch to tiled grid",
  devcontainer: {
    building: "Building devcontainer… ({seconds}s)",
    stopping: "Stopping devcontainer…",
    fixing: "Fixing Claude Code config persistence…",
    copied: "Copied",
    runningNamed: "Running in this directory's devcontainer ({name}) — click to copy",
    running: "Running in this directory's devcontainer",
    available: "Devcontainer available for this directory — click to build and start it",
    rebuild: "Rebuild this directory's devcontainer",
    stop: "Stop this directory's devcontainer",
    fixPersistence: "Claude Code config isn't persisted across a rebuild here — click to fix",
  },
};
