# RFC 要件チェックリスト

> **⚠️ このファイルはスクリプトにより自動生成された雛形です。**
> AIが目視チェックし、補足事項・プロジェクト固有の制約を追記してから使用すること。

生成日時: 2026-07-01T08:00:20.516Z
DesignTree バージョン: 1

---

## 全体チェック

- [ ] RFC全体にTBD / TODO / スタブ / 委譲 が0件であること
- [ ] 全セクションにコードスニペットが含まれていること
- [ ] DesignTreeの全ノードがRFCのいずれかのセクションに対応していること

---

## §1 HTTP クライアント接続設定の追加（build_provider_clients）— timeout / pool / keepalive / User-Agent ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §2 リクエストレベル・ストリーミングタイムアウトの実装 — non-stream .timeout() と streaming idle timeout ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §3 register_metrics() の冪等性ガード — OnceLock または Once で初回のみ実行 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §4 handle_messages 後処理で record_request() メトリクス記録の追加 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## §5 llm-bridge-core v0.2.6 → v0.3.0 バージョン更新戦略 — breaking change 対応 ✅

- [ ] セクション全体が完全に記述されている
- [ ] コードスニペットが含まれている
- [ ] TBD / TODO / 別バージョンで対応 という表現が含まれていないこと

---

## AI補足 1 — OMISSIONS 対応網羅性

- [ ] O-001: build_provider_clients() に connect_timeout(connect_ms) + pool_max_idle_per_host(usize::MAX) + tcp_keepalive(Some(30s)) + default_headers(User-Agent) の全てが実装されていること
- [ ] O-002: execute_with_failover() 内の reqwest::RequestBuilder に .timeout(total_ms) が適用されていること
- [ ] O-002: translate_non_stream 内の reqwest::RequestBuilder に .timeout(total_ms) が適用されていること
- [ ] O-003: proxy_sse_stream の select! ループで tokio::time::timeout(read_ms) が実装されていること
- [ ] O-003: translate_stream の select! ループで tokio::time::timeout(read_ms) が実装されていること
- [ ] O-004: register_metrics() が OnceLock<()> のモジュールレベル static でガードされていること
- [ ] O-005: handle_messages() の return 直前で record_request() が呼び出されていること
- [ ] O-005: 全経路（成功 + 全 ProxyError 種別）の status_code が record_request() に渡されていること
- [ ] O-006: Cargo.toml の llm-bridge-core が v0.3.0 に更新されていること
- [ ] O-006: v0.3.0 の breaking change が全テストパスで確認されていること
- [ ] O-006: llm-bridge-core v0.3.0 に TransformResult API が存在する場合、RFC §6.3 の独自実装をライブラリ API に置き換える対応が記述されていること

## AI補足 2 — 親RFC（RFC-ROOT.md）との関係性

- [ ] 親RFC §F.1（タイムアウト関連）の設計が本RFCの実装で完全に充足されていること
- [ ] 親RFC §F.2（metrics 登録）の OnceLock 設計判断#8 が本RFCで具体化されていること
- [ ] 親RFC §10.4（record_request）の記述が本RFCの実装と一致していること
- [ ] 親RFC §6.2（lossy-tolerant 変換）→ O-006 による v0.3.0 TransformResult 確認結果が反映されていること
- [ ] 親RFCの依存関係表（§1.1）が本RFCの llm-bridge-core v0.3.0 更新と整合していること

## AI補足 3 — 実装詳細の過不足チェック

### §1 HTTP クライアント接続設定
- [ ] reqwest::Client::builder() の connect_timeout 値が provider.config.timeouts.connect_ms または GlobalConfig のデフォルトから取得されていること
- [ ] pool_max_idle_per_host(usize::MAX) の根拠が RFC 内に記述されていること（max_in_flight による実効制限）
- [ ] tcp_keepalive(Some(Duration::from_secs(30))) の 30 秒がマジックナンバーではなく const または設定値として定義されていること
- [ ] User-Agent 値が env!("CARGO_PKG_VERSION") で動的に生成されていること

### §2 タイムアウト
- [ ] non-stream の .timeout() 値は provider.config.timeouts.total_ms → GlobalConfig.timeouts.total_ms（デフォルト 600000ms）のフォールバックチェーンであること
- [ ] streaming idle timeout の read_ms 値は provider.config.timeouts.read_ms → GlobalConfig.timeouts.read_ms（デフォルト 600000ms）のフォールバックチェーンであること
- [ ] タイムアウト時切断のエラーハンドリング（即時切断・後続チャンクなし）が実装されていること
- [ ] 既に partial response 送信後の切断において panic やリソースリークがないこと

### §3 OnceLock
- [ ] static REGISTERED: OnceLock<()> が observability/metrics.rs または observability/mod.rs のモジュールレベルに定義されていること
- [ ] register_metrics() の先頭で REGISTERED.set(()).is_err() による初回判定を行い、既登録時は即 return していること
- [ ] テストコードで複数回の register_metrics() 呼び出しが重複警告を発生させないこと

### §4 record_request
- [ ] handle_messages 内で Instant::now() が関数先頭で取得されていること
- [ ] transparent/translate 分岐後に mode が正しく判定されていること
- [ ] エラー経路も含め全 return 直前で record_request() が呼び出されていること
- [ ] status_code が成功（200）・エラー（400/401/403/429/502/504/500）の各ケースで正しく取得されていること

### §5 llm-bridge-core バージョン更新
- [ ] cargo add llm-bridge-core@0.3.0 による依存更新手順が記述されていること
- [ ] v0.3.0 の breaking change に対する対応方針（API 変更点の調査と修正手順）が記述されていること
- [ ] TransformResult API の有無確認手順と、あった場合の RFC §6.3 独自実装置き換え計画が記述されていること
- [ ] v0.3.0 が Rust 2024 Edition 対応版であることの注意喚起が記述されていること

## AI補足 4 — プロジェクト全体のコード品質制約

- [ ] `#[forbid(unsafe_code)]` が lib.rs で維持されていること
- [ ] `unwrap()` / `expect()` が実務コードに存在しないこと（テストコードのみ許可）
- [ ] 新規追加コードに `[::STUB::]` 未付与の不完全実装が存在しないこと
- [ ] `cargo clippy -- -D warnings` がパスすること
- [ ] `cargo fmt` がパスすること
- [ ] `cargo test` が全テストパスすること
- [ ] ポート番号・マジックナンバーがハードコードされていないこと（const または設定値経由）