---
title: 如何并行运行 Codex 会话
nav_title: 并行运行 Codex
layout: default
parent: 简体中文的解答
grand_parent: 疑問に答える
nav_order: 2
description: 同时跑多个 Codex CLI 会话，总有一个停在审批提示上。Codex 没有像 Claude Code 那样跳过审批的启动参数。办法不是避免停下，而是让它停下时能通知你。
---

# 如何并行运行 Codex 会话
{: .no_toc }

并排运行的方法和 Claude Code 一样。**但总会有一个停下来。**

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 为什么会停

Codex 在执行命令前会先问你。

Claude Code 有 `--permission-mode` 可以跳过询问，grok 有 `--permission-mode auto`，
muse 有 `--yolo`。

**Codex 没有传入任何对应的参数。** 虽然可以按 MCP 服务器逐个设置自动批准，
但没有整体跳过的办法。只要并行放着不管，总有一个在等你。

## 让它告诉你停了

Codex 0.156 加入了 hook。`PermissionRequest` 在弹出审批对话框时触发，
实测只在那时触发，其他工具调用都不会。

自己接的话，启动时传一个参数就行：

```bash
codex -c 'hooks.PermissionRequest=[{hooks=[{type="command",command="curl -s -X POST http://127.0.0.1:8080/waiting || true"}]}]'
```

有三点要注意：

1. **Codex 会让你确认一次。** 会弹出「Hooks need review」，不接受就不会触发。
   命令文本一变就会再问，所以每个会话不同的值要放进环境变量，命令本身保持固定
2. **末尾要加 `|| true`。** Codex 看 hook 的退出码，服务没起来不能被当成拒绝
3. **「结束」要从别处取。** 回合边界会追加写进 rollout 文件，读它不需要任何确认

## 用 MulmoTerminal 的话

两边都已经接好了。

```bash
npx mulmoterminal@latest
```

在格子里选 Codex，等待审批时格子会变色，提示音和完成时不同。

Windows 上不注册这个 hook，因为命令依赖的 shell 展开在 Windows 上没有实测过。
传入初始指令启动时也不注册，否则指令会被打进确认对话框而丢失。

## 相关

- [怎么知道哪个会话在等你](which-is-waiting.html)
- [与 tmux 的区别](tmux-difference.html)

---

*日本語版: [codex-parallel](../ja/codex-parallel.html) ・ English: [codex-parallel](../en/codex-parallel.html)*
