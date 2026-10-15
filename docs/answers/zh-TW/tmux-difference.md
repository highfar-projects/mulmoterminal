---
title: 和直接用 tmux 比，瀏覽器網格多了什麼
nav_title: 與 tmux 的差異
layout: default
parent: 繁體中文的解答
grand_parent: 疑問に答える
nav_order: 10
description: tmux 已經解決了面板、持久化和版面，MulmoTerminal 底層也繼續用它。tmux 沒解決的是：哪個面板被你卡住、哪個面板對應哪個 worktree、以及面板一多螢幕就不夠。
---

# 和直接用 tmux 比，瀏覽器網格多了什麼
{: .no_toc }

**如果 tmux 夠用，那它就是更快的答案。** 不用裝東西，快捷鍵也是你已經熟的。

<details open markdown="block">
  <summary>目錄</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## tmux 已經解決的

分面板。關掉終端機不丟。記住版面。用 ssh 重連。

MulmoTerminal 這幾樣全都交給 tmux。**一樣都沒有重寫。**

## tmux 沒解決的

面板裡裝的是 agent 之後才冒出來的問題，不在終端機多工器的職責範圍內。

- **哪個面板被你卡住。** tmux 不解釋面板裡的內容
- **哪個面板對應哪個 worktree。** 這個對應關係只存在你腦子裡
- **螢幕空間。** 九個面板的字已經看不清
- **通知。** tmux 沒有可以觸發的東西，訊號得從 agent 來

## 這是個數量問題

| 面板數 | tmux 夠不夠 |
|---|---|
| 2–3 | 夠 |
| 4–6 | 分辨開始費時間 |
| 7 以上 | 螢幕不夠了 |

**兩個面板時，什麼都不裝最划算。**

## MulmoTerminal 的位置

不是替代品，是加在上面的一層畫面。tmux 在底下跑，關掉瀏覽器工作階段還在，`tmux ls` 照樣列得出來。

```bash
npx mulmoterminal@latest
```

每個格子有一個 worktree 和一個表示狀態的顏色。**tmux 擅長的都留著，只補上「分辨」這一件。**

## 相關

- [用 git worktree 隔離工作](../../guide/en/worktree.html)
- [怎麼知道哪個工作階段在等你](which-is-waiting.html)

---

*日本語版: [tmux-difference](../ja/tmux-difference.html) ・ English: [tmux-difference](../en/tmux-difference.html)*
