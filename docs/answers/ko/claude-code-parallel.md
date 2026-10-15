---
title: Claude Code 세션을 여러 개 동시에 돌리는 방법
nav_title: Claude Code 병렬 실행
layout: default
parent: 한국어 답변
grand_parent: 疑問に答える
nav_order: 1
description: Claude Code 세션을 여러 개 동시에 돌리는 방법은 세 가지입니다. 터미널 창을 나누기, tmux로 나누기, 브라우저 그리드에 늘어놓기. 각각 무엇이 편해지고 무엇이 번거로워지는지 적었습니다.
---

# Claude Code 세션을 여러 개 동시에 돌리는 방법
{: .no_toc }

세 가지입니다. **어느 쪽도 Claude Code 쪽 설정은 필요 없습니다.**

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 터미널 창을 나눈다

가장 간단합니다. 창을 두 개 열고 각각에서 `claude`를 칩니다.

곤란해지는 건 두 세션이 같은 파일을 건드렸을 때입니다. 한쪽이 다른 쪽의 수정을 덮어쓰고,
아무도 알려주지 않습니다. **세션마다 디렉터리를 나누거나, git worktree를 따로 만들어야 합니다.**

```bash
git worktree add ../work-auth -b fix-auth
cd ../work-auth && claude
```

## tmux로 나눈다

창이 늘어나 감당이 안 되면 tmux로 나눕니다. 터미널을 닫아도 사라지지 않으므로
ssh로 다시 붙으면 하던 작업이 이어집니다.

```bash
tmux new-session -d -s auth -c ../work-auth 'claude'
tmux attach -t auth
```

몇 개를 넘어가면 화면이 좁아집니다. 아홉 개를 늘어놓으면 글자가 읽히지 않고,
**어느 것이 사람을 기다리는지는 들어가 봐야 압니다.**

자세한 내용은 [tmux와의 차이](tmux-difference.html)에 적었습니다.

## 브라우저 그리드에 늘어놓는다

MulmoTerminal은 뒤에서 tmux를 그대로 쓰면서, 브라우저에 격자를 띄웁니다.

```bash
npx mulmoterminal@latest
```

칸마다 git worktree가 만들어지므로 첫 번째 문제가 생기지 않습니다. 칸의 색으로
돌고 있는지, 사람을 기다리는지, 끝났는지 알 수 있고, 기다릴 때는 끝났을 때와 다른 소리가 납니다.

## 어느 것을 고를까

| 동시에 돌리는 수 | 맞는 방법 |
|---|---|
| 2개까지 | 터미널 창을 나눈다 |
| 3~4개 | tmux |
| 5개 이상 | 상태가 보이는 것 |

**두 개라면 아무것도 설치하지 않는 쪽이 가장 빠릅니다.** 「어느 것이 멈췄는지 모르겠다」가
시간을 잡아먹기 시작하면 그때 다음을 생각하면 됩니다.

## 관련

- [git worktree로 작업을 격리하기](../../guide/en/worktree.html)
- [어느 세션이 나를 기다리는지 아는 방법](which-is-waiting.html)
- [다른 오픈소스 선택지](../../guide/en/alternatives.html)

---

*日本語版: [claude-code-parallel](../ja/claude-code-parallel.html) ・ English: [run-claude-code-in-parallel](../en/run-claude-code-in-parallel.html)*
