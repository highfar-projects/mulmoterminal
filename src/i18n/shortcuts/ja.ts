// Settings → Keyboard shortcuts, out of the locale file, which is at its line cap.
import { keymapPresetJa } from "../keymapPreset/ja";

export const shortcutsJa = {
  preset: keymapPresetJa,
  intro:
    "割り当ての有無にかかわらず全部 {keymapKey} の下に並びます（一覧は読み取り専用。下のおすすめのキーは、割り当て済みのものに触れずに入門用のセットを足します）。割り当てられるのは 2 種類 —— MulmoTerminal の操作（拡大、待っているエージェントへ移動、コピー / ペースト）と、ターミナルへのキー列送信（macOS で Cmd+← を行頭へ、など）。割り当てたキーはターミナル内のプログラムに届かなくなるので、下のボタンから設定してください —— エージェントが、既にある割り当てや、ブラウザ / Mac 固有の落とし穴と突き合わせてから書き込みます。{guide}にリファレンスがあります。",
  guide: "ガイド",
  actions: {
    zoomToggle: "ターミナルを拡大 / 元に戻す",
    zoomNext: "次のターミナルを拡大",
    zoomPrev: "前のターミナルを拡大",
    focusNext: "次のターミナルへカーソルを移す（グリッド表示のみ）",
    focusPrev: "前のターミナルへカーソルを移す（グリッド表示のみ）",
    nextAttention: "あなたを待っているターミナルへ移動",
    markUnread: "このターミナルを未読 / 既読にする",
    terminalNew: "起動パネルを開く",
    terminalNewHere: "このターミナルのディレクトリで起動パネルを開く",
    terminalNewAdjacent: "このターミナルのディレクトリで、そのままシェルを開く",
    terminalClose: "このターミナルを閉じる",
    terminalRestart: "このターミナルのエージェントを再起動する",
    terminalMovePrev: "このターミナルを前へ移動",
    terminalMoveNext: "このターミナルを後ろへ移動",
    filesFind: "このターミナルの横で、ファイル名から探して開く",
    filesSearch: "このターミナルの横で、ファイルの中身を全文検索する",
    filesInsertSelection: "Files ペインの選択範囲を {'@'}ファイル#L… として入力に差し込む",
    filesTabClose: "Files ペインの前面のタブを閉じる",
    filesTabNext: "Files ペインの次のタブへ",
    filesTabPrev: "Files ペインの前のタブへ",
    focusMode: "集中モード（全画面にして、タブ操作のキー Cmd/Ctrl+W・T・N も MulmoTerminal で受ける）",
    commandPalette: "コマンドパレットを開く",
    copy: "ターミナルの選択範囲をコピー",
    paste: "ターミナルにペースト",
  },
  list: "キーボードショートカット",
  notSet: "未設定",
  reservedChip: "効かない",
  reservedTip:
    "このキーはブラウザがタブやウィンドウの操作に使うため、ページに届きません。{example} のような 2 打の割り当てなど、ブラウザが通すキーを使ってください。",
  reservedTipSingle:
    "このキーはブラウザがタブやウィンドウの操作に使うため、ページに届きません。この動作は 1 打のキーしか取れないので、ブラウザが通す別の 1 打のキーを選んでください。",
  reservedNote:
    "このブラウザは次のキーをタブやウィンドウの操作に使うため、MulmoTerminal には届きません: {keys}。たいていの動作は、{example} のような 2 打の割り当てなら届きます。集中モード（Chrome・Edge・Arc）の間は MulmoTerminal に届きます。",
  sendRow: "{key} をターミナルに送る",
  sendNone: "ターミナルにキー列を送る",
  setUp: "ショートカットを設定する…",
};
