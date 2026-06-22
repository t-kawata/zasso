# 実装サマリ: Metrics crate導入 + 次元拡張（M#2/M#5）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/anthropx/Cargo.toml` | 修正 | `metrics = "0.24"` 追加、`metrics-exporter-prometheus` を server feature 配下で追加 |
| `crates/anthropx/src/observability/metrics.rs` | 全面改修 | AtomicU64 → metrics crate 置き換え、5引数 record_request、METRICS_HANDLE、record_failover(provider)、record_lossy(level)、12テストケース |
| `crates/anthropx/src/http/routes.rs` | 修正 | `/metrics` → METRICS_HANDLE.render()、handle_messages で record_request に全次元情報を伝搬 |
| `crates/anthropx/src/provider/transparent.rs` | 修正 | execute_with_failover に provider_name 引数追加、record_failover(provider) 呼び出し |
| `crates/anthropx/src/provider/translate.rs` | 修正 | record_lossy("Error"/"Warn") 呼び出しを lossy 検出箇所に追加 |

## 検証結果

- `cargo check` (default features): ✅
- `cargo check --no-default-features` (library mode): ✅
- `cargo clippy -- -D warnings`: ✅
- `cargo test` (全178テスト): ✅ (176 passed, 0 failed)
- `cargo test` (integration tests 14件): ✅
- 品質チェック (run-quality-checks.js): ✅ (0 issues)
- 不完全実装・TODO 混入なし: ✅
- 犯罪 (Malfeasance): 0件

## 設計判断

- `std::sync::LazyLock` 使用（Rust 1.95 で利用可能、once_cell 非依存）
- `metrics-exporter-prometheus` v0.16.2 で動作確認済み
- ヒストグラムは Prometheus summary 形式（quantile + _sum + _count）で出力（metrics-exporter-prometheus のデフォルト動作）
- `record_request()` の二重計上防止契約は維持（handle_messages の後処理で1度だけ呼ぶ）
