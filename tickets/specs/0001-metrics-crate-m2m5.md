---
ticket_id: 1
title: Metrics crate導入 + 次元拡張（M#2/M#5）
slug: metrics-crate-m2m5
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0001-metrics-crate-m2m5/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0001-metrics-crate-m2m5/review.md
---
# Metrics crate導入 + 次元拡張（M#2/M#5）

## Summary

現在の AtomicU64 グローバル変数による手動メトリクスを `metrics` crate（`metrics` + `metrics-exporter-prometheus`）によるラベル付きカウンタ・ヒストグラムに置き換える。provider/mode/stream/status の4次元ラベルを持つリクエストカウンタ、provider ラベル付き failover カウンタ、level ラベル付き lossy カウンタ、レイテンシヒストグラム（デフォルトバケット）を実装する。

## Background

**発端**: REMAININGS.md M#2/M#5 の指摘。RFC02 §2 で設計完了済みだが未実装。

**現状の問題**:
- `observability/metrics.rs` は5つの `AtomicU64` グローバル変数でメトリクスを管理
- `record_request(status: u16)` はステータスコード範囲（2xx/4xx/5xx）のみの分類で、provider/mode/stream の次元情報が欠落
- `record_failover()` は provider ラベルなし
- `record_lossy()` が未実装（RFC02 §2.8 で設計済み）
- レイテンシ計測が存在しない（p50/p95/p99 取得不可）
- `format_metrics()` は手書き文字列フォーマットで、Prometheus テキスト形式を模しているが不完全
- テストは AtomicU64 の `reset_counters()` に依存（テスト間の状態汚染リスク）

**期待する状態**:
- `metrics` crate のラベル付きカウンタ・ヒストグラムで次元を持つメトリクスを実現
- `METRICS_HANDLE.render()` で本物の Prometheus 形式出力
- server feature なしでは metrics マクロが no-op（library モードで健全）
- テストは metrics crate のテストユーティリティ（`Recorder`）で隔離

## Scope

1. **`Cargo.toml` 依存追加**:
   - `metrics = "0.24"`（通常依存）
   - `metrics-exporter-prometheus = { version = "0.16", optional = true }`（server feature 配下）

2. **`src/observability/metrics.rs` 全面改修**:
   - `register_metrics()` — `describe_counter!` / `describe_histogram!` で全メトリクスを定義
   - `METRICS_HANDLE` — `#[cfg(feature = "server")]` でガードされた `PrometheusHandle`
   - `record_request(provider, mode, stream, status, latency_ms)` — 5引数でカウンタ＋ヒストグラム記録
   - `record_failover(provider)` — provider ラベル付き failover カウンタ
   - `record_lossy(level)` — level ラベル付き lossy カウンタ（RFC02 §2.8）
   - 既存の5つの `AtomicU64` 静的変数と `format_metrics()` を全削除
   - `record_failover_count()` テスト用ヘルパーは削除（metrics crate のテストユーティリティで代替）

3. **呼び出し箇所の配線**:
   - `lifecycle.rs`: `register_metrics()` 呼び出しは現状維持（先頭で呼ばれている）
   - `http/routes.rs` `handle_messages()`:
     - 後処理で `record_request()` に provider/mode/stream/latency_ms を伝搬するよう変更
     - provider 名と mode（transparent/translate）はハンドラ内で既に取得済み
     - stream フラグは body から抽出済み
     - latency_ms は開始時刻と終了時刻の差分で計算（`std::time::Instant`）
     - `/metrics` エンドポイントの実装を `METRICS_HANDLE.render()` に変更
   - `provider/transparent.rs` `execute_with_failover()`:
     - `record_failover(provider)` に provider 名を伝搬（現在は引数なし）
     - transparent.rs は既に `provider_name: &str` を引数として持つため伝搬は容易
   - `provider/translate.rs`: `record_lossy(level)` の呼び出し追加（translate モードの lossy 検出箇所）

4. **テスト全面改修**:
   - AtomicU64 の `reset_counters()` 依存を排除
   - `metrics::Recorder`（テスト用レコーダー）でカウンタ値の検証に変更
   - 新 `record_request()` の全次元ラベル検証テストを追加
   - `record_failover(provider)` のラベル検証
   - `record_lossy(level)` の新規テスト

## Non-scope

- Translate streaming リアルタイム化（M8-1 で対応）
- Lossy handling 完全対応（EXT-1 で対応）
- `metrics-exporter-prometheus` 以外の exporter 対応
- カスタムヒストグラムバケット設定（デフォルトバケットを使用、RFC02 §2.5）
- メトリクスダッシュボードの設計

## Investigation

### 現状のコード構成

**ファイル: `src/observability/metrics.rs`**（215行）

現在の実装は以下で構成される：

1. **5つの AtomicU64 静的変数**:
   - `TOTAL_REQUESTS`, `SUCCESS_REQUESTS`, `ERROR_4XX`, `ERROR_5XX`, `FAILOVER_COUNT`

2. **公開関数**:
   - `register_metrics()` → noop（静的初期化済みのため何もしない）
   - `record_request(status: u16)` → ステータスコード範囲で分岐してカウンタ増加
   - `record_failover()` → failover カウンタを増加（引数なし）
   - `record_failover_count() -> u64` → テスト用
   - `format_metrics() -> String` → 手書きフォーマットの Prometheus テキスト

3. **テスト**: 7テストケース（初期化ゼロ / 200/400/500/301 各ステータス / failover / 独立性）
   - 全テストが `reset_counters()` で AtomicU64 をゼロリセット（テスト間結合リスク）

**ファイル: `src/observability/mod.rs`**（6行）: 単に `pub mod metrics;` を宣言

**ファイル: `src/lib.rs`**: `#[cfg(feature = "server")] pub mod observability;` で feature ガード

### 呼び出し箇所の詳細

1. **`src/lifecycle.rs:42`**:
   ```rust
   metrics::register_metrics();  // ProxyServer::start() の先頭
   ```

2. **`src/http/routes.rs:184-187`**:
   ```rust
   Ok(_) => metrics::record_request(200),
   Err(e) => {
       let status = e.status_code();
       metrics::record_request(status);
   ```
   - `handle_messages()` の後処理で1度だけ呼ばれる（二重計上防止契約あり）
   - 現在は `status` のみ伝搬。provider/mode/stream/latency_ms の情報はハンドラ内で利用可能だが渡されていない

3. **`src/http/routes.rs:37`**:
   ```rust
   let body = metrics::format_metrics();  // /metrics エンドポイントハンドラ
   ```

4. **`src/provider/transparent.rs:85,90`**:
   ```rust
   metrics::record_failover();  // execute_with_failover() 内、引数なし
   ```

### 関連する既存[::STUB::]（本チケット非干渉）

- `routes.rs:209,249` — テストヘルパーの引数型（M9-1 で解決予定）
- `routing/mod.rs:26` — ApiFormat 中間型（M5-2 で解決予定、本チケットでは触らない）

これらは本チケットのスコープ外であり、Malfeasance にも未登録（0件）であるため、本チケットで対応不要。

### RFC02 設計との照合

| 設計要求 | 現状 | 対応 |
|---------|------|------|
| 依存: `metrics = "0.24"` | 未追加 | Cargo.toml に追加 |
| 依存: `metrics-exporter-prometheus` | 未追加 | server feature 配下で追加 |
| `METRICS_HANDLE` static | 未実装（`#[cfg(feature = "server")]` 必須） | 新規実装 |
| `register_metrics()` で describe_*! | noop | 全メトリクス定義 |
| `record_request(provider, mode, stream, status, latency_ms)` | `record_request(status: u16)` | シグネチャ変更・次元追加 |
| `record_failover(provider)` | `record_failover()` | provider 引数追加 |
| `record_lossy(level)` | 未実装 | 新規関数 |
| `/metrics` で `METRICS_HANDLE.render()` | `format_metrics()` 手書き | 置き換え |
| AtomicU64 全削除 | 5変数存在 | 全削除 |

### リスク評価

- **既存テストの破壊**: metrics.rs の全テストは AtomicU64 に依存しているため全書き換え必須。影響範囲は `observability::metrics::tests` モジュール内の7テストのみ。他モジュールのテストに影響しない。
- **コンパイル条件**: `metrics` crate のコアマクロ（`counter!`、`histogram!`）は feature 非依存で動作し、レコーダー未インストール時は no-op。library モード（server feature なし）でもコンパイル可能。
- **`once_cell` 依存**: RFC02 のコード例では `once_cell::sync::Lazy` を使用しているが、Rust 1.80+ では `std::sync::LazyLock` が安定している。CI の Rust バージョンを確認して採用判断。

## Test Plan

### ユニットテスト計画

**対象モジュール**: `src/observability/metrics.rs` の `#[cfg(test)] mod tests`

**テスト戦略**: metrics crate の `Recorder` ユーティリティを使用してカウンタ値・ラベルを検証する。`metrics::assert_counter!` マクロ相当の検証を実装する。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `register_metrics_creates_descriptions` | 正常 | `register_metrics()` 呼び出し後、全メトリクス名が記述されること |
| 2 | `record_request_increments_counter` | 正常 | `record_request("openai", "transparent", false, 200, 150)` → anthropx_requests_total の該当ラベルが 1 |
| 3 | `record_request_with_stream_flag` | 正常 | stream=true で別ラベルとしてカウントされること |
| 4 | `record_request_different_providers` | 正常 | provider 別にカウントが独立していること |
| 5 | `record_request_zero_latency` | 境界 | latency_ms=0 でもヒストグラムに記録されること |
| 6 | `record_request_high_latency` | 境界 | latency_ms=MAX でもオーバーフローしないこと |
| 7 | `record_failover_increments_counter` | 正常 | `record_failover("deepseek")` → anthropx_failover_total の provider=deepseek が 1 |
| 8 | `record_failover_multiple_providers` | 正常 | 複数 provider の failover が独立してカウントされること |
| 9 | `record_lossy_increments_counter` | 正常 | `record_lossy("Error")` → anthropx_lossy_total の level=Error が 1 |
| 10 | `record_lossy_all_levels` | 正常 | Error/Warn/Info の各区別でカウントされること |
| 11 | `server_feature_enables_metrics_handle` | 条件 | `#[cfg(feature = "server")]` 時のみ `METRICS_HANDLE` が利用可能（コンパイル確認） |
| 12 | `metrics_macros_are_noop_without_recorder` | 異常系 | レコーダー未インストール時も panic しないこと |

**テスト手法**: metrics crate のテスト用レコーダー（`metrics::Recorder`）の利用を検討する。`metrics-exporter-prometheus` の `PrometheusBuilder::new().install_recorder()` もテスト可能だが、テスト間で競合する可能性があるため、テスト用には `metrics::recorder::Counter` や独自のダムレコーダーを使用する。

**カバレッジ目標**: 95%以上（metrics.rs の公開関数は全網羅）

### ユニットテスト不可能な項目（例外）

- **理由1**: `/metrics` エンドポイントの HTTP レスポンス検証（M3-1 の integration test でカバー済み、本チケットでは統合テストは追加しない）
- **理由2**: PrometheusHandle.render() の完全なフォーマット検証（Prometheus 形式の正確性は metrics-exporter-prometheus の責務）

## Boy Scout Rule — 翻訳可能性計画

本チケットで改修する `observability/metrics.rs` に対して以下を適用する：

1. **関数シグネチャの散文化**: `record_request(provider, mode, stream, status, latency_ms)` は「リクエストを記録する（プロバイダー、モード、ストリーム、ステータス、レイテンシ）」と日本語に逐語訳できる。引数順序は意味的なまとまり（識別子 → 動作特性 → 結果）に従う。
2. **責務の明確化**: 現状の `format_metrics()`（手書きフォーマット + 文字列出力）と `register_metrics()`（noop）は責務が不明瞭。`register_metrics()` で記述とレコーダーインストールを行い、出力は `METRICS_HANDLE.render()` に委譲する。
3. **テストの翻訳可能性**: テスト関数名を日本語の条件節として読めるようにする（`record_200_increments_success` → 維持。日本語への逐語訳が可能な命名を継続）。
4. **既存コードの改善**: 現状の `reset_counters()` に依存するテストパターンは、metrics crate の Recorder パターンに移行することでテスト間結合を解消する。

## Acceptance Criteria

- [ ] `Cargo.toml` に `metrics = "0.24"` と `metrics-exporter-prometheus`（optional）が追加されている
- [ ] `metrics-exporter-prometheus` が server feature 配下に含まれている
- [ ] `register_metrics()` が全カウンタ・ヒストグラムの `describe_*!` を呼び出す
- [ ] `METRICS_HANDLE` が `#[cfg(feature = "server")]` でガードされた PrometheusHandle として存在する
- [ ] `record_request(provider, mode, stream, status, latency_ms)` がカウンタ＋ヒストグラムを記録する
- [ ] `record_failover(provider)` が provider ラベル付きで failover を記録する
- [ ] `record_lossy(level)` が level ラベル付きで lossy を記録する
- [ ] 既存の5つの AtomicU64 静的変数が削除されている
- [ ] `format_metrics()` が削除されている（`METRICS_HANDLE.render()` に置き換え）
- [ ] `/metrics` エンドポイントが `METRICS_HANDLE.render()` を使用している
- [ ] `handle_messages()` の後処理で `record_request()` に全次元情報が伝搬されている
- [ ] `execute_with_failover()` の `record_failover()` に provider 名が伝搬されている
- [ ] server feature なしでコンパイル可能（metrics マクロは no-op）
- [ ] 全テストが通過する
- [ ] `make check-be` が成功する

## Notes

### 関連チケット

- **依存**: M6-5（Feature gate 整備）— 完了済み。server feature 配下の依存関係は既に整備されている。
- **後続**: M8-1（Translate streaming リアルタイム化）— 本チケットとは独立。
- **参照設計書**: RFC02 §2（メトリクス再設計）、DesignTree.json ノード M#2/M#5

### 設計判断

- デフォルトヒストグラムバケットを使用する（RFC02 §2.5, Decision D05）。カスタムバケットは導入しない。
- メトリクスプレフィックスは `anthropx_`（RFC02 §2.2, Decision D03）。
- `METRICS_HANDLE` は `#[cfg(feature = "server")]` でガード（RFC02 §2.3）。library モードでは metrics マクロが no-op。
- `record_request()` の二重計上防止契約は維持（handle_messages の後処理で1度だけ呼ぶ）。

### 成果物

- 計画: context/0001-metrics-crate-m2m5/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0001-metrics-crate-m2m5/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0001-metrics-crate-m2m5/review.md（未作成、/review-ticket 全チェック通過後に作成）
