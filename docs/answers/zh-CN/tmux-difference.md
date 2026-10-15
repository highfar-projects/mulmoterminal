---
title: 和直接用 tmux 比，浏览器网格多了什么
nav_title: 与 tmux 的区别
layout: default
parent: 简体中文的解答
grand_parent: 疑問に答える
nav_order: 10
description: tmux 已经解决了面板、持久化和布局，MulmoTerminal 底层也继续用它。tmux 没解决的是：哪个面板被你卡住、哪个面板对应哪个 worktree、以及面板一多屏幕就不够。
---

# 和直接用 tmux 比，浏览器网格多了什么
{: .no_toc }

**如果 tmux 够用，那它就是更快的答案。** 不用装东西，快捷键也是你已经熟的。

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## tmux 已经解决的

分面板。关掉终端不丢。记住布局。用 ssh 重连。

MulmoTerminal 这几样全都交给 tmux。**一样都没有重写。**

## tmux 没解决的

面板里装的是 agent 之后才冒出来的问题，不在终端复用器的职责范围内。

- **哪个面板被你卡住。** tmux 不解释面板里的内容
- **哪个面板对应哪个 worktree。** 这个对应关系只存在你脑子里
- **屏幕空间。** 九个面板的字已经看不清
- **通知。** tmux 没有可以触发的东西，信号得从 agent 来

## 这是个数量问题

| 面板数 | tmux 够不够 |
|---|---|
| 2–3 | 够 |
| 4–6 | 分辨开始费时间 |
| 7 以上 | 屏幕不够了 |

**两个面板时，什么都不装最划算。**

## MulmoTerminal 的位置

不是替代品，是加在上面的一层画面。tmux 在底下跑，关掉浏览器会话还在，`tmux ls` 照样列得出来。

```bash
npx mulmoterminal@latest
```

每个格子有一个 worktree 和一个表示状态的颜色。**tmux 擅长的都留着，只补上「分辨」这一件。**

## 相关

- [用 git worktree 隔离工作](../../guide/en/worktree.html)
- [怎么知道哪个会话在等你](which-is-waiting.html)

---

*日本語版: [tmux-difference](../ja/tmux-difference.html) ・ English: [tmux-difference](../en/tmux-difference.html)*
