---
title: 如何並行執行 Codex 工作階段
nav_title: 並行執行 Codex
layout: default
parent: 繁體中文的解答
grand_parent: 疑問に答える
nav_order: 2
description: 同時跑多個 Codex CLI 工作階段，總有一個停在核准提示上。Codex 沒有像 Claude Code 那樣跳過核准的啟動參數。辦法不是避免停下，而是讓它停下時能通知你。
---

# 如何並行執行 Codex 工作階段
{: .no_toc }

並排執行的方法和 Claude Code 一樣。**但總會有一個停下來。**

<details open markdown="block">
  <summary>目錄</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 為什麼會停

Codex 在執行命令前會先問你。

Claude Code 有 `--permission-mode` 可以跳過詢問，grok 有 `--permission-mode auto`，
muse 有 `--yolo`。

**Codex 沒有傳入任何對應的參數。** 雖然可以按 MCP 伺服器逐個設定自動核准，
但沒有整體跳過的辦法。只要並行放著不管，總有一個在等你。

## 讓它告訴你停了

Codex 0.156 加入了 hook。`PermissionRequest` 在彈出核准對話框時觸發，
實測只在那時觸發，其他工具呼叫都不會。

自己接的話，啟動時傳一個參數就行：

```bash
codex -c 'hooks.PermissionRequest=[{hooks=[{type="command",command="curl -s -X POST http://127.0.0.1:8080/waiting || true"}]}]'
```

有三點要注意：

1. **Codex 會讓你確認一次。** 會彈出「Hooks need review」，不接受就不會觸發。
   命令文字一變就會再問，所以每個工作階段不同的值要放進環境變數，命令本身保持固定
2. **結尾要加 `|| true`。** Codex 看 hook 的結束碼，伺服器沒起來不能被當成拒絕
3. **「結束」要從別處取。** 回合邊界會持續追加寫進 rollout 檔案，讀它不需要任何確認

## 用 MulmoTerminal 的話

兩邊都已經接好了。

```bash
npx mulmoterminal@latest
```

在格子裡選 Codex，等待核准時格子會變色，提示音和完成時不同。

Windows 上不註冊這個 hook，因為命令依賴的 shell 展開在 Windows 上沒有實測過。
傳入初始指令啟動時也不註冊，否則指令會被打進確認對話框而遺失。

## 相關

- [怎麼知道哪個工作階段在等你](which-is-waiting.html)
- [與 tmux 的差異](tmux-difference.html)

---

*日本語版: [codex-parallel](../ja/codex-parallel.html) ・ English: [codex-parallel](../en/codex-parallel.html)*
