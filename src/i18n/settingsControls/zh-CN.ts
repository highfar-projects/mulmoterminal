export const settingsControlsZhCN = {
  defaultAgent: {
    title: "默认代理",
    hint: "新单元格的启动表单中，在你自己选择之前默认选中的代理；MulmoTerminal 启动时也会检查它是否已安装。",
    field: "默认代理",
    unset: "未设置（Claude）",
    notInstalled: "{agent}（未安装）",
    overridden: "已保存。本次以 --agent 启动，在不带该参数启动之前以它为准。",
  },
  headerTint: {
    title: "标题栏的状态颜色",
    hint: "如何在终端标题栏上显示会话正在运行或已完成。每个目录可在 .mulmoterminal.json 中单独设置。",
    field: "标题栏的状态颜色",
    tints: {
      background: "用状态颜色填充标题栏",
      none: "保留目录颜色（状态由边框、圆点和标签显示）",
    },
  },
  playful: {
    title: "小小的趣味效果",
    hint: "偶尔，终端上会发生点什么。关闭后所有终端都保持安静。",
    field: "小小的趣味效果",
  },
};
