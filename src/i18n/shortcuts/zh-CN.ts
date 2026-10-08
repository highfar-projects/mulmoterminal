// Settings → Keyboard shortcuts, out of the locale file, which is at its line cap.
import { keymapPresetZhCN } from "../keymapPreset/zh-CN";
import { shortcutActionsZhCN } from "../shortcutActions/zh-CN";

export const shortcutsZhCN = {
  preset: keymapPresetZhCN,
  intro:
    "不管有没有绑定，全都列在 {keymapKey} 下面（列表只读；下方的推荐按键会添加一组入门按键，不改动你已绑定的）。可以绑定两类：MulmoTerminal 的操作（放大、跳到在等你的智能体、复制 / 粘贴），以及发送给终端的按键序列（在 Mac 上用 Cmd+← 跳到行首）。你绑定的每个键都不再传给终端里的程序，所以请用下面的按钮来设置 —— 智能体会先对照你已有的绑定，以及浏览器和 Mac 各自带来的陷阱，然后才写入。参考资料见{guide}。",
  guide: "指南",
  actions: shortcutActionsZhCN,
  list: "键盘快捷键",
  notSet: "未设置",
  reservedChip: "不会生效",
  reservedTip: "浏览器把这个键留给标签页和窗口操作，页面收不到它。请使用浏览器会放行的键，例如 {example} 这样的两键绑定。",
  reservedTipSingle: "浏览器把这个键留给标签页和窗口操作，页面收不到它。此动作只接受单个键，请选择浏览器会放行的另一个单键。",
  reservedNote:
    "此浏览器把这些键留给标签页和窗口操作，它们不会传到 MulmoTerminal：{keys}。大多数动作可以改用像 {example} 这样的两键绑定来触发。专注模式（Chrome、Edge、Arc）期间，它们会传到 MulmoTerminal。",
  sendRow: "把 {key} 发送到终端",
  sendNone: "把按键发送到终端",
  setUp: "设置快捷键…",
};
