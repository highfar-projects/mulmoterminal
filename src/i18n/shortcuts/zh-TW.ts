// Settings → Keyboard shortcuts, out of the locale file, which is at its line cap.
import { keymapPresetZhTW } from "../keymapPreset/zh-TW";
import { shortcutActionsZhTW } from "../shortcutActions/zh-TW";

export const shortcutsZhTW = {
  preset: keymapPresetZhTW,
  intro:
    "不論有沒有綁定，全都列在 {keymapKey} 底下（列表唯讀；下方的推薦按鍵會新增一組入門按鍵，不更動你已綁定的）。可以綁定兩類：MulmoTerminal 的操作（放大、跳到正在等你的代理程式、複製 / 貼上），以及送給終端機的按鍵序列（在 Mac 上用 Cmd+← 跳到行首）。你綁定的每個鍵都不再傳給終端機裡的程式，所以請用下面的按鈕來設定 —— 代理程式會先對照你既有的綁定，以及瀏覽器和 Mac 各自帶來的陷阱，然後才寫入。參考資料見{guide}。",
  guide: "指南",
  actions: shortcutActionsZhTW,
  list: "鍵盤快速鍵",
  notSet: "未設定",
  reservedChip: "不會生效",
  reservedTip: "瀏覽器把這個鍵留給分頁和視窗操作，頁面收不到它。請使用瀏覽器會放行的鍵，例如 {example} 這樣的兩鍵綁定。",
  reservedTipSingle: "瀏覽器把這個鍵留給分頁和視窗操作，頁面收不到它。此動作只接受單一鍵，請選擇瀏覽器會放行的另一個單鍵。",
  reservedNote:
    "此瀏覽器把這些鍵留給分頁和視窗操作，它們不會傳到 MulmoTerminal：{keys}。大多數動作可以改用像 {example} 這樣的兩鍵綁定來觸發。專注模式（Chrome、Edge、Arc）期間，它們會傳到 MulmoTerminal。",
  sendRow: "把 {key} 送到終端機",
  sendNone: "把按鍵送到終端機",
  setUp: "設定快速鍵…",
};
