import type { forkTipsEn } from "./en";

type Tree<T> = { [K in keyof T]: T[K] extends string ? string : Tree<T[K]> };

export const forkTipsZhCN: Tree<typeof forkTipsEn> = {
  reconnect: "重新连接此会话",
  renameSession: "重命名此会话",
  renameSessionNamed: "重命名会话 {title}",
  deleteSession: "永久删除此会话",
  deleteSessionNamed: "永久删除会话 {title}",
  launchConfigMenu: "在空闲终端中运行 .vscode/launch.json 配置",
  switchToStack: "切换为卡片堆叠",
  switchToGrid: "切换为平铺网格",
  devcontainer: {
    building: "正在构建 devcontainer…（{seconds} 秒）",
    stopping: "正在停止 devcontainer…",
    fixing: "正在修复 Claude Code 配置的持久化…",
    copied: "已复制",
    runningNamed: "正在此目录的 devcontainer（{name}）中运行 — 点击复制",
    running: "正在此目录的 devcontainer 中运行",
    available: "此目录有可用的 devcontainer — 点击构建并启动",
    rebuild: "重新构建此目录的 devcontainer",
    stop: "停止此目录的 devcontainer",
    fixPersistence: "此处重新构建会丢失 Claude Code 配置 — 点击修复",
  },
  restart: {
    button: "重启 MulmoTerminal",
    description: "停止服务器并再次启动。终端运行在 tmux 上，会原样恢复；服务器响应后，此页面也会重新加载。",
    descriptionRelaunch: "停止服务器，并通过启动命令再次启动，届时会获取最新版本。终端运行在 tmux 上，会原样恢复；服务器响应后，此页面也会重新加载。",
    relaunchHint: "将以相同版本重启。若想在重启时获取新版本，请用分支 README 中的重启循环来启动 MulmoTerminal。",
    failed: "无法请求服务器重启。服务器还在运行吗？",
    restartingTitle: "正在重启 MulmoTerminal…",
    restartingBody: "服务器恢复后，此页面会自动重新加载。",
    restartingBodyRelaunch: "正在获取最新版本并启动。服务器恢复后，此页面会自动重新加载。",
    slow: "耗时较长。请查看启动 MulmoTerminal 的终端：安装可能仍在进行，也可能因错误而停止。",
    updateButton: "重启以更新",
  },
};
