---
title: 怎麼知道哪個工作階段在等你
nav_title: 哪個在等你
layout: default
parent: 繁體中文的解答
grand_parent: 疑問に答える
nav_order: 3
description: 能告訴你「一輪結束了」的 coding agent CLI 不少，能告訴你「我被你卡住了」的很少 —— 這裡託管的七個裡只有兩個。另外兩個發出的訊號看著像，實際每次呼叫工具都會觸發。
---

# 怎麼知道哪個工作階段在等你
{: .no_toc }

**取決於 CLI 自己說不說。** 去抓終端機上的文字也行，但輸出格式一變就失效，而它一定會變。

<details open markdown="block">
  <summary>目錄</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 哪些 CLI 能說

MulmoTerminal 用同一套機制託管七個 agent，所以差別能排在一起看。

| CLI | 能說「結束了」 | 能說「在等你」 |
|---|---|---|
| Claude Code | 能 | 能 |
| Codex | 能 | 能 |
| GitHub Copilot | 能 | 不能 |
| Cursor | 能 | 不能 |
| Antigravity | 未接線 | 未接線 |
| Grok | 未接線 | 未接線 |
| Muse | 未接線 | 未接線 |

四個能回報回合結束，兩個能回報被卡住。

## 看著像但不能用的

GitHub Copilot 的 `permissionRequest` 和 Cursor 的 `beforeShellExecution`，
名字看著就是「被卡住」的訊號。

實測下來，兩個都是**每次**呼叫工具就觸發，不管有沒有真的問你。直接拿來做等待指示，
每次工具呼叫都會亮 —— **這比什麼都不顯示更糟**，因為一直亮著的燈，人就不看了。

## 能說的那兩個是怎麼做的

Claude Code 有 `Notification` hook，需要輸入時觸發。

Codex 從兩處取：回合邊界取自它持續追加的 rollout 檔案，被卡住取自 `PermissionRequest` hook。
**拒絕這個 hook 只會失去「被卡住」的訊號**，不影響「正在執行」。

## 自己接的話

在 Claude Code 的設定裡寫 hook，給 Codex 啟動時傳參數。接收端記下是哪個工作階段打來的，然後響鈴。

光靠聲音撐不住。**九個工作階段同時跑的時候，鈴聲不會告訴你是哪一個。**
總得把工作階段和螢幕上的位置對應起來。

```bash
npx mulmoterminal@latest
```

MulmoTerminal 用格子的顏色表示，而且每個格子有自己的 git worktree，並行的工作不會互相踩。

## 相關

- [手機推播通知](../../guide/en/notifications.html)
- [如何並行執行 Codex 工作階段](codex-parallel.html)

---

*日本語版: [which-is-waiting](../ja/which-is-waiting.html) ・ English: [which-is-waiting](../en/which-is-waiting.html)*
