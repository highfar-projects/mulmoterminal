# Cloudflare 構成 — 必ず詰める点

- [ ] **公開すると誰でも開ける**。ログインなしにするなら、何を誰に見せてよいかを仕様どおりに絞る。身内だけで使うなら、ログインか Cloudflare Access で入口を閉じる
- [ ] **SQL は必ずバインド**（`prepare("… ?").bind(value)`）。文字列をつないで SQL を作らない
- [ ] **入力は API の入口で検査する**（型・長さ・必須）。画面側の検査だけに頼らない
- [ ] **状態を変える API は、同じオリジンからの呼び出しだけ受ける**（別のサイトから勝手に呼ばれないように）
- [ ] **セキュリティヘッダーを付ける**。API の応答は Worker で、画面のファイルは `public/_headers` で（静的なファイルは Worker を通らない）。`Content-Security-Policy` に `frame-ancestors 'none'`、`X-Content-Type-Options: nosniff`
- [ ] **パスワードを保存するなら、平文で保存しない**（Web Crypto の PBKDF2 で塩付きのハッシュにする）
- [ ] **秘密の値は wrangler の secret に置く**（`wrangler secret put`）。手元では `.dev.vars` に置き、`.dev.vars` を `.gitignore` に入れる。コードや `wrangler.jsonc` に書かない
- [ ] **データのバックアップ**の手順を README に書く（`wrangler d1 export`）
