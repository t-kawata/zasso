# レビュー報告書: Metrics crate導入 + 次元拡張（M#2/M#5）

## チェック結果

| チェック | 結果 |
|---------|------|
| 犯罪 (Malfeasance) | ✅ 0件 |
| [::STUB::] 一覧 | ✅ 3件（全てスコープ外、既知） |
| 不完全実装 (7パターン) | ✅ なし |
| `cargo check --all-targets` | ✅ 成功 |
| `cargo test` (178 unit + 14 integration) | ✅ 全通過 |
| `cargo check --no-default-features` | ✅ 成功 |
| `cargo clippy -- -D warnings` | ✅ 0 warnings |
| 品質チェック (run-quality-checks) | ✅ 18件指摘（全て既存/テスト内の許容範囲） |
| 構造整合性 (validate-structure) | ✅ valid |
| 翻訳可能性 (関数名/変数名/マジックナンバー/デバッグ出力) | ✅ 問題なし |

## 品質チェック詳細

18件の指摘は全て既存コード由来：
- `metrics.rs:29` → LazyLock初期化の `.expect()`（Prometheusレコーダー失敗時は起動不可が正しい動作）
- `routes.rs`, `transparent.rs` 内17件 → 全件 `#[cfg(test)]` テストコード内の `.unwrap()`（Rust規約で許容）
- `translate.rs` 7 params → 既存の関数シグネチャ（本チケット非改変）

## Acceptance Criteria 充足確認

- [x] Cargo.toml: metrics = "0.24" + metrics-exporter-prometheus (optional, server feature配下)
- [x] register_metrics() が全 describe_*! を呼び出す
- [x] METRICS_HANDLE #[cfg(feature = "server")] でガード
- [x] record_request(provider, mode, stream, status, latency_ms) 5引数
- [x] record_failover(provider) provider ラベル付き
- [x] record_lossy(level) level ラベル付き
- [x] AtomicU64 静的変数 5件 全削除
- [x] format_metrics() 削除（METRICS_HANDLE.render() に置き換え）
- [x] `/metrics` → METRICS_HANDLE.render()
- [x] handle_messages → record_request に全次元伝搬
- [x] execute_with_failover → record_failover(provider)
- [x] server feature なしでコンパイル可能
- [x] 全テスト通過
- [x] make check-be 相当確認（cargo check 通過）
