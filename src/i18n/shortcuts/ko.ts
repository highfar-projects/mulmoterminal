// Settings → Keyboard shortcuts, out of the locale file, which is at its line cap.
import { keymapPresetKo } from "../keymapPreset/ko";
import { shortcutActionsKo } from "../shortcutActions/ko";

export const shortcutsKo = {
  preset: keymapPresetKo,
  intro:
    "할당 여부와 상관없이 전부 {keymapKey} 아래에 나열됩니다(목록은 읽기 전용이며, 아래의 추천 키는 이미 할당한 것은 건드리지 않고 기본 세트를 추가합니다). 할당할 수 있는 것은 두 가지 —— MulmoTerminal의 동작(확대, 기다리는 에이전트로 이동, 복사 / 붙여넣기), 그리고 터미널로 보내는 키 시퀀스(Mac에서 Cmd+←로 줄 맨 앞으로). 할당한 키는 터미널 안의 프로그램에 더 이상 닿지 않으므로, 아래 버튼으로 설정하세요 —— 에이전트가 기존 할당과 브라우저·Mac이 각자 만들어 내는 함정을 먼저 대조한 뒤에 씁니다. 레퍼런스는 {guide}에 있습니다.",
  guide: "가이드",
  actions: shortcutActionsKo,
  list: "키보드 단축키",
  notSet: "설정 안 됨",
  reservedChip: "작동 안 함",
  reservedTip: "브라우저가 탭과 창 조작에 쓰는 키라 페이지에 전달되지 않습니다. {example} 같은 두 키 지정 등 브라우저가 통과시키는 키를 쓰세요.",
  reservedTipSingle: "브라우저가 탭과 창 조작에 쓰는 키라 페이지에 전달되지 않습니다. 이 동작은 한 키만 받으므로 브라우저가 통과시키는 다른 한 키를 고르세요.",
  reservedNote:
    "이 브라우저는 다음 키를 탭과 창 조작에 쓰므로 MulmoTerminal에 전달되지 않습니다: {keys}. 대부분의 동작은 {example} 같은 두 키 지정이면 닿습니다. 집중 모드(Chrome, Edge, Arc) 중에는 MulmoTerminal에 전달됩니다.",
  sendRow: "{key}를 터미널로 보내기",
  sendNone: "터미널로 키 보내기",
  setUp: "단축키 설정하기…",
};
