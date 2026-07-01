# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-07-01T07:41:37.598Z
DesignTree バージョン: 1

---

## 全体チェック

- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [ ] 全セクションにコードスニペットが含まれていること
- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 Timeout設定がreqwest::Clientに適用されていない — 設定値は定義済みだがHTTPクライアント作成時に利用されていない ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §2 metrics::register_metrics() が ProxyServer::start() 呼び出しごとに実行される — metrics crate の describe_* マクロが重複登録時に警告/パニックする可能性 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 RFC §1.1 の依存関係表と実装 Cargo.toml に不一致（sea-orm, proxmox-sortable-macroが無い、reqwest/tokioがoptional） ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §4 util/headers.rs の build_upstream_headers() が provider/transparent.rs で使われていない — bearer_auth() が代用しているがRFC記述と不一致 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 translate_stream に #[allow(tail_expr_drop_order)] が付与 — Rust 2024 移行時のドロップ順変更による影響が未調査 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §6 lifecycle.rs で reqwest::Client::new() を素で使っている — default headers, connect timeout, プール設定のカスタマイズ余地 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

<!-- AI補足欄: 上記チェック項目に加え、プロジェクト固有の制約・注意事項をここに追記すること -->

## AI補足 1 — 実装共通（コード品質）

- [ ] `#[forbid(unsafe_code)]` が維持されていること（lib.rs）
- [ ] `#[warn(missing_debug_implementations)]` で Debug 未実装が検出されないこと
- [ ] `unwrap()` / `expect()` が実務コードに存在しないこと（テストコードのみ許可）
- [ ] `[::STUB::]` マーカー未付与の不完全実装が存在しないこと

## AI補足 2 — タイムアウト設定（Q1→B 反映）

- [ ] `lifecycle.rs` の `build_provider_clients()` で `reqwest::Client::builder().connect_timeout()` が適用されていること
- [ ] upstream リクエスト送信時に `request.timeout()` で total_ms が適用されていること（non-stream・stream 両方）
- [ ] ストリーミング時にチャンク間 idle timeout（tokio::time::timeout）が設定されていること
- [ ] User-Agent 等の default_headers が設定されていること

## AI補足 3 — metrics 登録（Q2→A 反映）

- [ ] `register_metrics()` が `std::sync::OnceLock` または `once_cell` で初回のみ実行されるようになっていること
- [ ] テストコードで `ProxyServer::start()` を複数回呼んでも metrics 登録の重複エラーが発生しないこと

## AI補足 4 — RFC と実装の整合性（Q3→A, Q4→B 反映）

- [ ] RFC-ROOT.md §1.1 の依存関係表から `sea-orm`, `proxmox-sortable-macro` が削除されていること
- [ ] RFC-ROOT.md §1.1 で `reqwest`, `tokio` が optional/server feature 依存として記載されていること
- [ ] RFC-ROOT.md §5.1 の transparent mode 記述で `build_upstream_headers()` ではなく `bearer_auth()` を用いる方式に修正されていること
- [ ] `util/headers.rs` の `build_upstream_headers()` が dead code になっていないこと（テストでカバー済み、維持でよい）

## AI補足 5 — Rust 2024 Edition 対応（Q5→A 反映）

- [ ] `#[allow(tail_expr_drop_order)]` の影響範囲が調査されていること
- [ ] `tokio::select!` 内の一時変数ドロップ順に依存するコードがないこと（バイアスされた select! の副作用）
- [ ] Edition 2024 移行後に `cargo check` が警告なくパスすること

## AI補足 6 — reqwest Client 設定（Q6→B 反映）

- [ ] `reqwest::Client::builder().pool_max_idle_per_host()` が設定されていること
- [ ] `.tcp_keepalive()` の設定が検討されていること
- [ ] 各 provider のリクエストに適切な default headers（anthropx/{version} 等）が設定されていること

## AI補足 7 — プロジェクト全体の制約

- [ ] ポート番号がハードコードされていないこと（anthropx は独立 crate のため zasso 全体の port layout とは独立だが、埋め込み利用時に衝突しない設計であること）
- [ ] 設定値はマジックナンバーではなく const または設定構造体経由で管理されていること
- [ ] `cargo fmt` / `cargo clippy -- -D warnings` がパスすること
- [ ] `make test` または `cargo test` が全テストパスすること