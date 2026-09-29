import type { forkTipsEn } from "./en";

type Tree<T> = { [K in keyof T]: T[K] extends string ? string : Tree<T[K]> };

export const forkTipsKo: Tree<typeof forkTipsEn> = {
  reconnect: "이 세션에 다시 연결",
  renameSession: "이 세션 이름 바꾸기",
  renameSessionNamed: "세션 {title} 이름 바꾸기",
  deleteSession: "이 세션을 영구 삭제",
  deleteSessionNamed: "세션 {title} 영구 삭제",
  launchConfigMenu: ".vscode/launch.json 구성을 빈 터미널에서 실행",
  switchToStack: "카드 스택으로 전환",
  switchToGrid: "타일 그리드로 전환",
  devcontainer: {
    building: "devcontainer 빌드 중… ({seconds}초)",
    stopping: "devcontainer 중지 중…",
    fixing: "Claude Code 설정 유지 문제 수정 중…",
    copied: "복사됨",
    runningNamed: "이 디렉터리의 devcontainer({name})에서 실행 중 — 클릭하여 복사",
    running: "이 디렉터리의 devcontainer에서 실행 중",
    available: "이 디렉터리에 devcontainer가 있습니다 — 클릭하여 빌드하고 시작",
    rebuild: "이 디렉터리의 devcontainer 다시 빌드",
    stop: "이 디렉터리의 devcontainer 중지",
    fixPersistence: "여기서는 다시 빌드하면 Claude Code 설정이 사라집니다 — 클릭하여 수정",
  },
};
