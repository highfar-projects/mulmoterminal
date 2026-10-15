---
title: tmux로 병렬화하는 것과 무엇이 다른가
nav_title: tmux와의 차이
layout: default
parent: 한국어 답변
grand_parent: 疑問に答える
nav_order: 10
description: tmux는 이미 페인·영속화·레이아웃을 해결했고, MulmoTerminal도 뒤에서 그대로 씁니다. 해결하지 못한 것은 어느 페인이 사람을 기다리는지, 어느 페인이 어느 worktree인지, 그리고 수가 늘면 화면이 좁아진다는 점입니다.
---

# tmux로 병렬화하는 것과 무엇이 다른가
{: .no_toc }

**tmux로 충분하다면 그쪽이 빠릅니다.** 설치할 것이 없고, 익숙한 조작이 그대로 쓰입니다.

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## tmux가 이미 해결한 것

페인으로 나누기. 닫아도 사라지지 않기. 레이아웃 기억하기. ssh로 다시 붙기.

MulmoTerminal은 이 전부를 tmux에 맡깁니다. **다시 만들지 않았습니다.**

## tmux가 해결하지 않은 것

페인 안에 agent가 들어간 뒤에 생기는 문제들은, 터미널 멀티플렉서의 담당 범위 밖입니다.

- **어느 페인이 사람을 기다리는가.** tmux는 페인 안의 내용을 해석하지 않습니다
- **어느 페인이 어느 worktree인가.** 그 대응은 머릿속에만 있습니다
- **화면의 좁음.** 아홉 개를 늘어놓으면 글자가 읽히지 않습니다
- **알림.** 울릴 재료를 어디서 가져올지는 tmux의 이야기가 아닙니다

## 수에 따라 달라집니다

| 페인 수 | tmux로 충분한가 |
|---|---|
| 2~3 | 충분합니다 |
| 4~6 | 구별이 번거로워집니다 |
| 7 이상 | 화면이 좁아집니다 |

**두 개라면 아무것도 설치하지 않는 쪽이 빠릅니다.**

## MulmoTerminal의 자리

tmux를 대체하는 것이 아니라, tmux 위에 화면을 더한 것입니다. 뒤에서 tmux가 돌고 있고,
브라우저를 닫아도 세션은 남습니다. `tmux ls`로 보입니다.

```bash
npx mulmoterminal@latest
```

칸마다 worktree가 만들어지고, 칸의 색으로 상태가 보입니다.
**tmux의 좋은 점은 남긴 채, 구별만 더한 형태입니다.**

## 관련

- [git worktree로 작업을 격리하기](../../guide/en/worktree.html)
- [어느 세션이 나를 기다리는지 아는 방법](which-is-waiting.html)

---

*日本語版: [tmux-difference](../ja/tmux-difference.html) ・ English: [tmux-difference](../en/tmux-difference.html)*
