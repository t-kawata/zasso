---
ticket_id: 159
title: "M2-1: KeyScheduler — 起動時乱択 + round-robin key 管理"
slug: m2-1-keyscheduler-round-robin-key
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0159-m2-1-keyscheduler-round-robin-key/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0159-m2-1-keyscheduler-round-robin-key/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0159-m2-1-keyscheduler-round-robin-key/review.md
---

# M2-1: KeyScheduler — 起動時乱択 + round-robin key 管理

## Summary

Provider の API key を管理する `KeyScheduler` 構造体を実装する。起動時に provider ごとに開始 index を `SystemTime` のナノ秒で乱択し、以後は `AtomicUsize` によるスレッドセーフな round-robin で key を選択する。本構造体は `std::sync::atomic` のみを使用し、tokio 非依存。`execute_with_failover` や `execute_stream` は含まず、M3-4（Transparent mode）で実装する。

## Background

`anthropx` は provider ごとに複数の API key を設定可能である。目的は:
1. **負荷分散**: 複数 key へのリクエスト分散により、単一 key のレート制限到達を防止
2. **Failover**: non-stream リクエストでは、1つの key が失敗したら別の key で再試行
3. **起動時乱択**: 全インスタンスが同一 key から開始するのを防ぎ、起動直後のバーストを回避

`KeyScheduler` は key 選択の純粋なスケジューリング責務のみを担当し、HTTP リクエストの実行や failover ロジックは M3-4（Transparent）に委譲する。

**参照設計書:** `crates/anthropx/RFC.md` (§4.2 API key スケジューラ)

## Scope

- `routing/scheduler.rs` の新規作成（`KeyScheduler` struct + impl + `mod tests`）
- 以下のメソッドを実装:

### 実装する型とメソッド

| メソッド | シグネチャ | 説明 |
|---------|-----------|------|
| `new` | `fn new(keys: Vec<String>, provider_name: String) -> Self` | 起動時乱択: `SystemTime::now()` のナノ秒 % keys.len() で開始位置を決定 |
| `with_seed` | `fn with_seed(keys: Vec<String>, provider_name: String, seed: usize) -> Self` | テスト用: 固定シードで開始位置を決定 |
| `select_key` | `fn select_key(&self) -> &str` | `current.fetch_add(1, Relaxed) % keys.len()` で round-robin |
| `key_count` | `fn key_count(&self) -> usize` | 管理している key の総数 |
| `provider_name` | `fn provider_name(&self) -> &str` | provider 識別子（デバッグ/metrics 用） |

### 内部フィールド

```rust
pub struct KeyScheduler {
    keys: Vec<String>,
    current: AtomicUsize,
    provider_name: String,
}
```

### 配置

RFC のモジュール構成では `routing/scheduler.rs` が想定されている。本チケットでは `src/routing/scheduler.rs` に新規ファイルとして作成し、`routing/mod.rs` に `pub mod scheduler;` を追加する。

### このチケットで実装しないこと

- `execute_with_failover` — M3-4（Transparent mode）で実装（`reqwest::Client` 依存）
- `execute_stream` — M3-4（Transparent mode）で実装
- `tokio` 依存の追加 — KeyScheduler は std::sync::atomic のみで完結
- `rand` crate の依存追加 — 乱数シードは `SystemTime::now()` で代用（RFC §4.2）

## Investigation

### コードベース調査結果

- **発見1**: `routing/mod.rs` は既に M1-1 で作成済み。`pub mod scheduler;` を追加するだけで module ツリーに組み込める。
- **発見2**: 既存の Cargo.toml に `rand` はない。RFC は `SystemTime::now()` のナノ秒を乱数シードとして使用することを明示しており、新規依存は不要。
- **発見3**: `std::sync::atomic::AtomicUsize` および `Ordering::Relaxed` は std のみで使用可能。`Ordering::Relaxed` は「正確な順序よりパフォーマンス優先」という RFC §4.2 の設計判断を反映。
- **発見4**: M0-1 の `ProviderConfig.api_keys` は `Vec<String>` 型。空の場合の挙動は M1-2（validate）で事前にチェックされる。
- **発見5**: CLAUDE.md のスタブ一覧に KeyScheduler は記載されていない（実装済みとして扱う想定）。

### 依存関係の充足確認

| 先行チケット | ステータス | 備考 |
|------------|-----------|------|
| M0-1 (#155) | ✅ reviewed | ProviderConfig（api_keys の型） |

## Test Plan

### ユニットテスト計画

全テストは `src/routing/scheduler.rs` 内の `#[cfg(test)] mod tests` に記述する。`thread::spawn` を使用した並行アクセステストも含む。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `with_seed_deterministic` | 正常系 | 同一シードで2回初期化 → 同一開始位置 |
| 2 | `with_seed_different_seeds` | 正常系 | 異なるシード → 異なる開始位置（統計的確率的） |
| 3 | `select_key_round_robin_order` | 正常系 | 3 keys + 3回呼出 → 順序が key[0], key[1], key[2] になる |
| 4 | `select_key_wraparound` | 正常系 | seed=2, 2 keys + 3回呼出 → 3回目は key[0] に戻る（ラップアラウンド） |
| 5 | `select_key_multi_threaded` | 正常系 | 4回呼出を2スレッドで並行実行 → 4回とも成功し全 key が選択される |
| 6 | `key_count_matches` | 正常系 | `key_count()` が key 配列長と一致 |
| 7 | `provider_name_returns_configured` | 正常系 | `provider_name()` がコンストラクタで指定した値を返す |
| 8 | `with_seed_round_robin_distribution` | 正常系 | 固定シード + 100回呼出 → 各 key の出現回数が期待値 ±20% 以内 |

### ユニットテスト不可能な項目（例外）

- 起動時乱択が実際にランダムであることの統計的検証 → `with_seed` でシード固定可能な設計のため、乱数品質そのもののテストは不要
- failover が正しく動作すること → M3-4（Transparent mode）の integration test
- 複数 provider 間での key 選択 independence → M4-3（Mock server integration tests）

## Boy Scout Rule — 翻訳可能性計画

- **関数名は動詞句**: `select_key`, `key_count`, `provider_name`
- **変数名はドメイン概念**: `keys`, `current`, `provider_name`, `seed`
- **定数化**: マジックナンバーなし。`keys.len()` はローカル変数でキャプチャ
- **コメントは「なぜ」**: `Ordering::Relaxed` の選択理由（性能優先、正確な順序不要）を注釈

## Acceptance Criteria

- [ ] `cargo check -p anthropx` が警告ゼロで通過する
- [ ] `cargo clippy -D warnings` が通過する
- [ ] `cargo test -p anthropx` が全テスト（既存75 + 新規8 = 83 + 1 doctest）通過する
- [ ] `KeyScheduler::with_seed` が同一シードで同一の開始位置を生成する
- [ ] `select_key` が round-robin 順序で key を返す
- [ ] `select_key` がラップアラウンド後も正しく動作する
- [ ] `key_count` が key 配列長と一致する
- [ ] `provider_name` が設定値を返す

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **先行実装必須 (reviewed)** | M0-1 (#155) | ProviderConfig（api_keys の型 Vec<String>） |
| **後続（本チケット完了が必要）** | M3-4 (#TBD) | execute_with_failover で KeyScheduler を使用 |
| **後続（本チケット完了が必要）** | M4-1 (#TBD) | build_schedulers() で KeyScheduler を一括生成 |
