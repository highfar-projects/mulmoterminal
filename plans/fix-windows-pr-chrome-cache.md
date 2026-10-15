# ci(windows-pr): どのシャードも Chrome のキャッシュを保存できるようにする

issue: https://github.com/receptron/mulmoterminal/issues/3046

## いま

`windows-pr.yaml` は `~/.cache/puppeteer` の保存を 1 番目のシャードだけに許し、ほかは `actions/cache/restore`。
キャッシュの無い run で 1 番目が Chrome の展開で止まると（#3030）、保存する者がいない。

## 直し方

`ci.yml`（#3031）と同じく、全シャードで `actions/cache` にする。重複する保存は断られるだけ。
`node_modules` の分け方はそのまま（止まる原因ではない）。

## 確かめ方

この PR の Windows ジョブで、キーが当たれば復元され、install が止まらずに終わること。
