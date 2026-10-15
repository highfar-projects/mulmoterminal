---
title: Codex 세션을 병렬로 돌리는 방법
nav_title: Codex 병렬 실행
layout: default
parent: 한국어 답변
grand_parent: 疑問に答える
nav_order: 2
description: Codex CLI를 여러 개 동시에 돌리면 반드시 어딘가는 승인 대기로 멈춥니다. Claude Code와 달리 승인을 건너뛰는 실행 옵션이 없기 때문입니다. 멈추는 것을 피하는 대신, 멈췄다는 사실을 알아차리는 방법을 준비하는 편이 맞습니다.
---

# Codex 세션을 병렬로 돌리는 방법
{: .no_toc }

늘어놓는 것 자체는 Claude Code와 같습니다. **다만 반드시 어딘가가 멈춥니다.**

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## 멈추는 이유

Codex는 명령을 실행하기 전에 물어봅니다.

Claude Code에는 `--permission-mode`라는, 묻지 않고 진행하는 실행 방법이 있습니다.
grok은 `--permission-mode auto`, muse는 `--yolo`가 같은 역할입니다.

**Codex에는 이에 해당하는 것이 전달되지 않습니다.** MCP 서버별 자동 승인 설정은 있지만,
전체를 건너뛰는 방법은 없습니다. 병렬로 두는 한 누군가는 기다리고 있습니다.

## 멈췄다는 것을 알아차리기

Codex 0.156부터 hook이 들어왔습니다. `PermissionRequest`는 승인 대화상자를 띄웠을 때 작동하며,
실측해 보니 그때만 작동하고 다른 도구 호출에서는 작동하지 않았습니다.

직접 붙인다면 실행할 때 옵션 하나입니다.

```bash
codex -c 'hooks.PermissionRequest=[{hooks=[{type="command",command="curl -s -X POST http://127.0.0.1:8080/waiting || true"}]}]'
```

주의할 점이 셋 있습니다.

1. **Codex가 한 번 확인을 요구합니다.** 「Hooks need review」가 뜨고, 수락하지 않으면 작동하지 않습니다.
   명령문이 바뀔 때마다 다시 묻기 때문에, 세션마다 달라지는 값은 환경 변수로 넘기고 명령 자체는 고정합니다
2. **끝에 `|| true`를 붙입니다.** Codex는 hook의 종료 상태를 보므로, 서버가 꺼져 있는 것이 거부로 읽히면 안 됩니다
3. **「끝났다」는 다른 곳에서 가져옵니다.** 턴의 경계는 rollout 파일에 덧붙여 기록되고, 그쪽은 신뢰 확인이 필요 없습니다

## MulmoTerminal의 경우

양쪽 다 처음부터 들어 있습니다.

```bash
npx mulmoterminal@latest
```

칸에서 Codex를 고르면 승인 대기일 때 색이 바뀌고, 끝났을 때와는 다른 소리가 납니다.

Windows에서는 이 hook을 등록하지 않습니다. 명령이 셸 확장에 의존하는데 Windows에서의 동작을
측정하지 않았기 때문입니다. 첫 지시를 넘겨 실행하는 경우에도 등록하지 않습니다.
확인 대화상자에 지시가 입력되어 사라지기 때문입니다.

## 관련

- [어느 세션이 나를 기다리는지 아는 방법](which-is-waiting.html)
- [tmux와의 차이](tmux-difference.html)

---

*日本語版: [codex-parallel](../ja/codex-parallel.html) ・ English: [codex-parallel](../en/codex-parallel.html)*
