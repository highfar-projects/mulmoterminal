---
title: 怎么知道哪个会话在等你
nav_title: 哪个在等你
layout: default
parent: 简体中文的解答
grand_parent: 疑問に答える
nav_order: 3
description: 能告诉你「一轮结束了」的编码 agent CLI 不少，能告诉你「我被你卡住了」的很少 —— 这里托管的七个里只有两个。另外两个发出的信号看着像，实际每次调用工具都会触发。
---

# 怎么知道哪个会话在等你
{: .no_toc }

**取决于 CLI 自己说不说。** 去抓终端上的文字也行，但输出格式一变就失效，而它一定会变。

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 哪些 CLI 能说

MulmoTerminal 用同一套机制托管七个 agent，所以差别能排在一起看。

| CLI | 能说「结束了」 | 能说「在等你」 |
|---|---|---|
| Claude Code | 能 | 能 |
| Codex | 能 | 能 |
| GitHub Copilot | 能 | 不能 |
| Cursor | 能 | 不能 |
| Antigravity | 未接线 | 未接线 |
| Grok | 未接线 | 未接线 |
| Muse | 未接线 | 未接线 |

四个能报告回合结束，两个能报告被卡住。

## 看着像但不能用的

GitHub Copilot 的 `permissionRequest` 和 Cursor 的 `beforeShellExecution`，
名字看着就是「被卡住」的信号。

实测下来，两个都是**每次**调用工具就触发，不管有没有真的问你。直接拿来做等待指示，
每次工具调用都会亮 —— **这比什么都不显示更糟**，因为一直亮着的灯，人就不看了。

## 能说的那两个是怎么做的

Claude Code 有 `Notification` hook，需要输入时触发。

Codex 从两处取：回合边界取自它追加写入的 rollout 文件，被卡住取自 `PermissionRequest` hook。
**拒绝这个 hook 只会失去「被卡住」的信号**，不影响「正在运行」。

## 自己接的话

在 Claude Code 的配置里写 hook，给 Codex 启动时传参数。接收端记下是哪个会话打来的，然后响铃。

光靠声音撑不住。**九个会话同时跑的时候，铃声不会告诉你是哪一个。**
总得把会话和屏幕上的位置对应起来。

```bash
npx mulmoterminal@latest
```

MulmoTerminal 用格子的颜色表示，并且每个格子有自己的 git worktree，并行的工作不会互相踩。

## 相关

- [手机推送通知](../../guide/en/notifications.html)
- [如何并行运行 Codex 会话](codex-parallel.html)

---

*日本語版: [which-is-waiting](../ja/which-is-waiting.html) ・ English: [which-is-waiting](../en/which-is-waiting.html)*
