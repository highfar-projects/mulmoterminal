---
title: 如何使用多个 Codex 订阅
nav_title: 多个 Codex 订阅
layout: default
parent: 简体中文的解答
grand_parent: 疑問に答える
nav_order: 23
description: 给每个 Codex 订阅一个单独的 CODEX_HOME 目录，注册成账号就能并排使用。和 Claude 不同的是没有自动选择 —— 哪个格子用哪个订阅要自己决定。
---

# 如何使用多个 Codex 订阅
{: .no_toc }

**按格子手动选。** Codex 没有 Claude 那样的自动轮换。

<details open markdown="block">
  <summary>目录</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 原理

Codex 把设置和登录信息放在 `CODEX_HOME` 下面。**给每个订阅一个单独的目录，它们就能并排存在。**

把目录注册成账号：

```json
{ "id": "personal", "label": "个人", "agent": "codex", "home": "~/.codex-personal" }
```

也可以从**设置 → 模型与后端**里的「第二个以后的订阅」添加：填名字、选 Codex、填目录。

## 不要指向 `~/.codex` 本身

那是平时登录用的目录。指过去的话，这个账号的格子只是用平时的登录在跑，也不会有单独的用量表。

**新建一个目录，指向新的那个。**

## 怎么用

1. 在空格子里选 Codex
2. 模型下面会出现 **ACCOUNT** 选择框
3. 选「Default login」（平时的登录）或已注册的订阅

六个格子里有两个用工作的订阅、其余用个人的，这种用法是常见的。

## 第一次登录

新目录的账号**从空白开始**。

你的设置、你注册的 MCP 服务器、按项目的信任回答，全都属于平时的登录，不会带过来。
那个账号的第一次会话会重新问一遍。

## 用量表

Codex 账号**不需要额外的准备步骤**。在那个账号里跑过第一次会话之后，
数字就从该账号自己的会话记录里读出来。

从没跑过会话的账号，工具栏上什么都不显示。跑一次就有了。

## 和 Claude 的区别

| | Claude | Codex |
|---|---|---|
| 按格子选订阅 | 可以 | 可以 |
| 自动选余量最宽裕的 | 可以 | **没有** |
| 快到上限时迁移会话 | 可以 | **没有** |
| 用量表的准备 | 需要一步 | 不需要 |

**自动选择只有 Claude 有。**「余量除以到重置的时间」这个规则不覆盖 Codex。

## 相关

- [并排使用多个订阅](../../guide/en/accounts.html)
- [如何并行运行 Codex 会话](codex-parallel.html)

---

*日本語版: [codex-multiple-accounts](../ja/codex-multiple-accounts.html) ・ English: [codex-multiple-accounts](../en/codex-multiple-accounts.html)*
