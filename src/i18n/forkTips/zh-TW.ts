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
  restart: {
    button: "重新啟動 MulmoTerminal",
    description: "停止伺服器並再次啟動。終端機執行在 tmux 上，會原樣恢復；伺服器回應後，此頁面也會重新載入。",
    descriptionRelaunch: "停止伺服器，並透過啟動指令再次啟動，屆時會取得最新版本。終端機執行在 tmux 上，會原樣恢復；伺服器回應後，此頁面也會重新載入。",
    relaunchHint: "將以相同版本重新啟動。若想在重新啟動時取得新版本，請用分支 README 中的重新啟動迴圈來啟動 MulmoTerminal。",
    failed: "無法請求伺服器重新啟動。伺服器還在執行嗎？",
    restartingTitle: "正在重新啟動 MulmoTerminal…",
    restartingBody: "伺服器恢復後，此頁面會自動重新載入。",
    restartingBodyRelaunch: "正在取得最新版本並啟動。伺服器恢復後，此頁面會自動重新載入。",
    slow: "耗時較長。請查看啟動 MulmoTerminal 的終端機：安裝可能仍在進行，也可能因錯誤而停止。",
    updateButton: "重新啟動以更新",
  },
};
