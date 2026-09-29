import type { forkTipsEn } from "./en";

type Tree<T> = { [K in keyof T]: T[K] extends string ? string : Tree<T[K]> };

export const forkTipsZhTW: Tree<typeof forkTipsEn> = {
  reconnect: "重新連線此工作階段",
  renameSession: "重新命名此工作階段",
  renameSessionNamed: "重新命名工作階段 {title}",
  deleteSession: "永久刪除此工作階段",
  deleteSessionNamed: "永久刪除工作階段 {title}",
  launchConfigMenu: "在閒置的終端機中執行 .vscode/launch.json 設定",
  switchToStack: "切換為卡片堆疊",
  switchToGrid: "切換為平鋪格線",
  devcontainer: {
    building: "正在建置 devcontainer…（{seconds} 秒）",
    stopping: "正在停止 devcontainer…",
    fixing: "正在修正 Claude Code 設定的保存…",
    copied: "已複製",
    runningNamed: "正在此目錄的 devcontainer（{name}）中執行 — 點擊以複製",
    running: "正在此目錄的 devcontainer 中執行",
    available: "此目錄有可用的 devcontainer — 點擊以建置並啟動",
    rebuild: "重新建置此目錄的 devcontainer",
    stop: "停止此目錄的 devcontainer",
    fixPersistence: "這裡重新建置會遺失 Claude Code 設定 — 點擊以修正",
  },
};
