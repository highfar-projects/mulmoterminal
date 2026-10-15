---
title: 如何同时运行多个 Claude Code 会话
nav_title: 并行运行 Claude Code
layout: default
parent: 简体中文的解答
grand_parent: 疑問に答える
nav_order: 1
description: 同时运行多个 Claude Code 会话有三种方法：分开的终端窗口、tmux 面板、浏览器网格。各自解决什么、代价是什么，以及最简单的方法从哪里开始不够用。
---

# 如何同时运行多个 Claude Code 会话
{: .no_toc }

有三种方法。**都不需要在 Claude Code 一侧做任何配置。**

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 分开的终端窗口

最省事。开两个窗口，各自运行 `claude`。

问题出在两个会话改同一个文件的时候。一个会覆盖另一个的修改，而且没人会告诉你。
**要么给每个会话单独的目录，要么给它单独的 git worktree。**

```bash
git worktree add ../work-auth -b fix-auth
cd ../work-auth && claude
```

## tmux 面板

窗口多到管不过来时，用 tmux 分面板。关掉终端会话也不会消失，用 ssh 重连可以接着干。

```bash
tmux new-session -d -s auth -c ../work-auth 'claude'
tmux attach -t auth
```

超过几个面板后屏幕就不够了。九个面板的字已经看不清，而且**要知道哪个在等你，
还是得一个个点进去看。**

详见[与 tmux 的区别](tmux-difference.html)。

## 浏览器网格

MulmoTerminal 底层仍然用 tmux，把会话放进浏览器的网格里。

```bash
npx mulmoterminal@latest
```

每个格子有自己的 git worktree，所以第一个问题不会出现。格子的颜色表示正在运行、
等你输入、还是已经结束，等待时的提示音和完成时不同。

## 怎么选

| 同时运行数 | 合适的做法 |
|---|---|
| 2 个以内 | 分开的窗口 |
| 3–4 个 | tmux |
| 5 个以上 | 能显示状态的工具 |

**两个会话时，什么都不装是最快的。** 等到「哪个卡住了」开始浪费时间，再考虑下一步。

## 相关

- [用 git worktree 隔离工作](../../guide/en/worktree.html)
- [怎么知道哪个会话在等你](which-is-waiting.html)
- [其他开源选择](../../guide/en/alternatives.html)

---

*日本語版: [claude-code-parallel](../ja/claude-code-parallel.html) ・ English: [run-claude-code-in-parallel](../en/run-claude-code-in-parallel.html)*
