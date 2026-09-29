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
};
