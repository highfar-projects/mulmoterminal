# 表計算（presentSpreadsheet）のガイドページ（#3086）

## 目的

#3078 で入った表計算と、既存のグラフ（presentChart）の使い方を、利用者向けに英・日でまとめる。MulmoTerminal ではエージェントがシェルを持つので、データ集めから表・グラフまでを会話で進められる、という使い方を中心にする。

## 内容

- `docs/guide/{en,ja}/spreadsheet.md`（nav_order 6.7、右ペインのページの次）
  - 有効にする方法（Canvas の道具の分類）
  - できること：計算式入りの表、複数シートとシート間の参照、書式、xlsx、グラフ（表とは連動しない）
  - 自分で直す：セルの編集欄、Edit Spreadsheet Data、直した内容をエージェントに読み返させる（保存は式で、計算結果ではない）
  - ファイルの場所
  - 使える関数：エンジンに登録されている関数だけを書く。README とのずれは receptron/GUIChatPluginSpreadsheet#59
  - 頼み方：プロジェクトのファイル、自分のリポジトリ、前提を直して聞き直す、表にない統計をスクリプトで、requestCheck で確認
  - 制限
- `features.md`（英・日）から 1 段落でリンク
- スクリーンショット 3 枚（`docs/guide/images/spreadsheet-*.png`）：使い捨ての HOME で起動したサーバーに、MCP の本物の経路から表とグラフを出して撮影

## やらないこと

- `feature-list.md` への追記：`as_of` が package.json に縛られているので、次のリリースのときに足す
