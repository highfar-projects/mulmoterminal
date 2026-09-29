export const settingsControlsKo = {
  defaultAgent: {
    title: "기본 에이전트",
    hint: "새 셀의 실행 폼에서 직접 고르기 전까지 처음 선택되어 있는 에이전트이며, MulmoTerminal이 시작할 때 설치 여부를 확인하는 에이전트이기도 합니다.",
    field: "기본 에이전트",
    unset: "설정 안 함 (Claude)",
    notInstalled: "{agent} (설치되지 않음)",
    overridden: "저장했습니다. 이번 실행은 --agent로 시작했으므로, 그것 없이 시작할 때까지는 그쪽이 우선합니다.",
  },
  headerTint: {
    title: "헤더의 상태 색",
    hint: "세션이 작업 중이거나 끝났음을 터미널 헤더에서 어떻게 보여 줄지. 디렉터리마다 .mulmoterminal.json에서 바꿀 수 있습니다.",
    field: "헤더의 상태 색",
    tints: {
      background: "헤더를 상태 색으로 칠하기",
      none: "디렉터리 색 그대로 (상태는 테두리·점·라벨로 표시)",
    },
  },
  playful: {
    title: "소소한 연출",
    hint: "가끔 터미널에 무언가가 일어납니다. 끄면 모든 터미널이 조용한 채로 있습니다.",
    field: "소소한 연출",
  },
};
