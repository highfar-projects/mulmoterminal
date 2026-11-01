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
  restart: {
    button: "MulmoTerminal 재시작",
    description: "서버를 멈추고 다시 시작합니다. 터미널은 tmux 위에서 돌고 있어 그대로 돌아오며, 서버가 응답하면 이 페이지도 다시 불러옵니다.",
    descriptionRelaunch:
      "서버를 멈추고 실행 명령으로 다시 시작합니다. 이때 최신 버전을 받아옵니다. 터미널은 tmux 위에서 돌고 있어 그대로 돌아오며, 서버가 응답하면 이 페이지도 다시 불러옵니다.",
    relaunchHint: "같은 버전으로 재시작합니다. 재시작할 때 새 버전을 받으려면 포크 README의 재시작 루프로 MulmoTerminal을 실행하세요.",
    failed: "서버에 재시작을 요청하지 못했습니다. 서버가 아직 실행 중인가요?",
    restartingTitle: "MulmoTerminal을 재시작하는 중…",
    restartingBody: "서버가 돌아오면 이 페이지는 자동으로 다시 불러옵니다.",
    restartingBodyRelaunch: "최신 버전을 받아 시작하는 중입니다. 서버가 돌아오면 이 페이지는 자동으로 다시 불러옵니다.",
    slow: "시간이 걸리고 있습니다. MulmoTerminal을 실행한 터미널을 확인하세요. 설치가 아직 진행 중이거나 오류로 멈췄을 수 있습니다.",
    updateButton: "재시작해서 업데이트",
  },
};
