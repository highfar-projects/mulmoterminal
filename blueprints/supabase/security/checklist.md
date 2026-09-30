# Supabase 構成 — 必ず詰める点

- [ ] **画面は誰でも書き換えられる**。ブラウザは公開の鍵で Supabase を直接呼ぶので、誰が何を読み書きできるかは、表ごとの行ごとの権限（RLS）と制約で決める。画面の中の検査は守りにならない
- [ ] **public の表はすべて RLS を有効にする**。有効にしただけでは誰も読めないので、読む・足す・変える・消すの方針（policy）を、仕様の表どおりに一つずつ書く。`using (true)` は、誰にでも見せる表だけに使う
- [ ] **行の持ち主は利用者に選ばせない**。持ち主の列は既定値を `auth.uid()` にし、足すときも変えるときも `with check (owner = (select auth.uid()))` で確かめる
- [ ] **秘密の鍵（secret / service_role）は画面に入れない**。画面が持つのは公開の鍵（publishable / anon）だけ
- [ ] **関数（`security definer`）を作るなら、中で呼び出した人を確かめ、`search_path` を固定する**。誰でも呼べる関数は、RLS を通らずに表を読み書きできる
- [ ] **ログインの登録を誰に開くか**を決める（誰でも登録できるか、招いた人だけか）
- [ ] **セキュリティヘッダーを付ける**。画面のファイルは Cloudflare の `_headers` で。`Content-Security-Policy` の `connect-src` には、画面が話す Supabase の URL を入れる
- [ ] **データのバックアップ**の手順を README に書く（`supabase db dump`）
