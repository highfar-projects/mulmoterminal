---
title: 어느 세션이 나를 기다리는지 아는 방법
nav_title: 어느 것이 기다리는가
layout: default
parent: 한국어 답변
grand_parent: 疑問に答える
nav_order: 3
description: 「끝났다」를 알려주는 coding agent CLI는 많지만, 「당신을 기다리고 있다」까지 알려주는 것은 적습니다. 여기서 다루는 일곱 중 둘뿐입니다. 비슷해 보이지만 모든 도구 호출마다 작동하는 것도 둘 있습니다.
---

# 어느 세션이 나를 기다리는지 아는 방법
{: .no_toc }

**CLI 쪽이 스스로 알려주느냐로 갈립니다.** 터미널의 글자를 읽는 방법도 있지만,
표시가 조금만 바뀌어도 깨집니다.

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 말할 수 있는 것과 없는 것

MulmoTerminal은 일곱 개의 CLI를 같은 방식으로 다루기 때문에 차이를 나란히 둘 수 있습니다.

| CLI | 「끝났다」 | 「기다리고 있다」 |
|---|---|---|
| Claude Code | 말할 수 있음 | 말할 수 있음 |
| Codex | 말할 수 있음 | 말할 수 있음 |
| GitHub Copilot | 말할 수 있음 | 말할 수 없음 |
| Cursor | 말할 수 있음 | 말할 수 없음 |
| Antigravity | 연결되지 않음 | 연결되지 않음 |
| Grok | 연결되지 않음 | 연결되지 않음 |
| Muse | 연결되지 않음 | 연결되지 않음 |

끝났다를 알릴 수 있는 것이 넷, 기다리고 있다까지 알릴 수 있는 것이 둘입니다.

## 비슷하지만 쓸 수 없는 것

GitHub Copilot의 `permissionRequest`와 Cursor의 `beforeShellExecution`은
이름만 보면 승인을 요구할 때 작동할 것 같습니다.

실측하면 둘 다 **도구를 호출할 때마다** 작동합니다. 실제로 물어봤는지와 무관하게 작동하므로,
그대로 신호로 쓰면 모든 도구 호출이 대기로 표시됩니다.
**아무것도 표시하지 않는 것보다 나쁜 상태입니다.** 늘 켜져 있는 표시는 사람이 보지 않게 됩니다.

## 말할 수 있는 둘의 구조

Claude Code에는 `Notification` hook이 있어, 입력이 필요해졌을 때 작동합니다.

Codex는 두 곳에서 가져옵니다. 작업의 경계는 rollout이라는 기록 파일이 덧붙여지는 것을 보고,
승인 대기는 `PermissionRequest` hook으로 받습니다.
**한쪽을 거절당해도 다른 쪽은 살아남습니다.**

## 직접 만드는 경우

Claude Code는 설정 파일에, Codex는 실행할 때 hook을 씁니다. 받는 쪽에서 어느 세션에서
왔는지를 기록해 소리를 냅니다.

수가 늘면 소리만으로는 부족해집니다. **아홉 개가 늘어서 있으면 울린 것이 어느 것인지
소리로는 구별할 수 없습니다.** 세션과 화면을 연결해야 합니다.

```bash
npx mulmoterminal@latest
```

MulmoTerminal은 칸의 색으로 나타냅니다. 칸마다 git worktree가 만들어지므로
동시에 돌려도 파일을 서로 빼앗지 않습니다.

## 관련

- [휴대폰 푸시 알림](../../guide/en/notifications.html)
- [Codex 세션을 병렬로 돌리는 방법](codex-parallel.html)

---

*日本語版: [which-is-waiting](../ja/which-is-waiting.html) ・ English: [which-is-waiting](../en/which-is-waiting.html)*
