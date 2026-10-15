---
title: 如何同時執行多個 Claude Code 工作階段
nav_title: 並行執行 Claude Code
layout: default
parent: 繁體中文的解答
grand_parent: 疑問に答える
nav_order: 1
description: 同時執行多個 Claude Code 工作階段有三種方法：分開的終端機視窗、tmux 面板、瀏覽器網格。各自解決什麼、代價是什麼，以及最簡單的方法從哪裡開始不夠用。
---

# 如何同時執行多個 Claude Code 工作階段
{: .no_toc }

有三種方法。**都不需要在 Claude Code 這一側做任何設定。**

<details open markdown="block">
  <summary>目錄</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 分開的終端機視窗

最省事。開兩個視窗，各自執行 `claude`。

問題出在兩個工作階段改同一個檔案的時候。一個會蓋掉另一個的修改，而且沒人會告訴你。
**要嘛給每個工作階段單獨的目錄，要嘛給它單獨的 git worktree。**

```bash
git worktree add ../work-auth -b fix-auth
cd ../work-auth && claude
```

## tmux 面板

視窗多到管不過來時，用 tmux 分面板。關掉終端機也不會消失，用 ssh 重連可以接著做。

```bash
tmux new-session -d -s auth -c ../work-auth 'claude'
tmux attach -t auth
```

超過幾個面板後螢幕就不夠了。九個面板的字已經看不清，而且**要知道哪個在等你，
還是得一個個點進去看。**

詳見[與 tmux 的差異](tmux-difference.html)。

## 瀏覽器網格

MulmoTerminal 底層仍然用 tmux，把工作階段放進瀏覽器的網格裡。

```bash
npx mulmoterminal@latest
```

每個格子有自己的 git worktree，所以第一個問題不會出現。格子的顏色表示正在執行、
等你輸入、還是已經結束，等待時的提示音和完成時不同。

## 怎麼選

| 同時執行數 | 合適的做法 |
|---|---|
| 2 個以內 | 分開的視窗 |
| 3–4 個 | tmux |
| 5 個以上 | 能顯示狀態的工具 |

**兩個工作階段時，什麼都不裝是最快的。** 等到「哪個卡住了」開始浪費時間，再考慮下一步。

## 相關

- [用 git worktree 隔離工作](../../guide/en/worktree.html)
- [怎麼知道哪個工作階段在等你](which-is-waiting.html)
- [其他開源選擇](../../guide/en/alternatives.html)

---

*日本語版: [claude-code-parallel](../ja/claude-code-parallel.html) ・ English: [run-claude-code-in-parallel](../en/run-claude-code-in-parallel.html)*
