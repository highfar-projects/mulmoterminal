export const settingsControlsZhTW = {
  defaultAgent: {
    title: "預設代理",
    hint: "新儲存格的啟動表單中，在你自行選擇之前預先選取的代理；MulmoTerminal 啟動時也會檢查它是否已安裝。",
    field: "預設代理",
    unset: "未設定（Claude）",
    notInstalled: "{agent}（未安裝）",
    overridden: "已儲存。本次以 --agent 啟動，在不帶該參數啟動之前以它為準。",
  },
  headerTint: {
    title: "標題列的狀態顏色",
    hint: "如何在終端機標題列上顯示工作階段正在執行或已完成。每個目錄可在 .mulmoterminal.json 中個別設定。",
    field: "標題列的狀態顏色",
    tints: {
      background: "用狀態顏色填滿標題列",
      none: "保留目錄顏色（狀態由邊框、圓點和標籤顯示）",
    },
  },
  playful: {
    title: "小小的趣味效果",
    hint: "偶爾，終端機上會發生些什麼。關閉後所有終端機都保持安靜。",
    field: "小小的趣味效果",
  },
};
