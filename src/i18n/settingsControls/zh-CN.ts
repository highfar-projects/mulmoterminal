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
  headerColors: {
    title: "各状态的标题栏颜色",
    hint: "在所有终端的标题栏上，按状态替换主题颜色。目录的 .mulmoterminal.json 中写的颜色会在该目录整体替换这一组。",
    statuses: {
      working: "运行中",
      done: "完成",
      blocked: "等待输入",
    },
    background: "背景",
    text: "文字",
    theme: "主题颜色",
    auto: "自动",
    autoState: "自动（易读的颜色）",
    partOf: "“{status}”的{part}",
    reset: "恢复主题颜色",
  },
  configReload: {
    button: "重新读取配置文件",
    tip: "手动或用代理修改 ~/.mulmoterminal/config.json 后重新读取。为使其生效，此页面会重新加载。",
  },
  playful: {
    title: "小小的趣味效果",
    hint: "偶尔，终端上会发生点什么。关闭后所有终端都保持安静。",
    field: "小小的趣味效果",
  },
};
