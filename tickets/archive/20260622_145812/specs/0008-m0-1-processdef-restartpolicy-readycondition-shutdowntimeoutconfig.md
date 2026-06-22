---
ticket_id: 8
title: M0-1: 純粋データ型の定義（ProcessDef, RestartPolicy, ReadyCondition, ShutdownTimeoutConfig）
slug: m0-1-processdef-restartpolicy-readycondition-shutdowntimeoutconfig
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0008-m0-1-processdef-restartpolicy-readycondition-shutdowntimeoutconfig/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0008-m0-1-processdef-restartpolicy-readycondition-shutdowntimeoutconfig/review.md
---
# M0-1: 純粋データ型の定義（ProcessDef, RestartPolicy, ReadyCondition, ShutdownTimeoutConfig）

## Summary

`crates/procreg/` クレートの基盤となる4つの純粋データ型を定義する。具体的には `ProcessDef` 構造体、`RestartPolicy` 列挙型、`ReadyCondition` 列挙型、`ShutdownTimeoutConfig` 構造体を `src/lib.rs` に実装する。これらは一切の非同期・I/Oを含まない値オブジェクトであり、Phase 0 の最下層基盤として後続全チケットから依存される。

## Background

MYCUTE のサイドカープロセス管理の中核となる `process-registry` クレートは、プロセスの定義・起動・監視・停止を統一的に扱う。その最下層には、プロセスの起動方法を記述する値オブジェクト群が必要である。本チケットではこの値オブジェクト群を定義し、クレートのコンパイルが通る状態を確立する。

**参照設計書:** docs/RFC-001-process-registry.md (§5.1, §5.2, §5.3, §5.4)

## Scope

- `crates/procreg/Cargo.toml` の作成（package 定義のみ、依存クレートは最小限）
- `crates/procreg/src/lib.rs` の作成（以下の4型をモジュールルートに定義）
  - `ProcessDef` 構造体（name, program, args, env, depends_on, restart, ready, shutdown_timeout）— `Clone + Debug`
  - `RestartPolicy` 列挙型（Never, OnCrash { max_retries, initial_delay, backoff_factor, max_delay }, Always { ... }）— `Clone + Debug + PartialEq`
  - `ReadyCondition` 列挙型（Immediate, Delay(Duration), LogContains { pattern, timeout }, TcpPort { host, port, timeout, poll_interval }）— `Clone + Debug`
  - `ShutdownTimeoutConfig` 構造体（unix_sigterm_timeout, windows_ctrl_break_timeout）— `Clone + Debug + Default`
- 各型へのderiveマクロの付与
- ユニットテスト（`#[cfg(test)] mod tests` を `lib.rs` 内に記述）

## Non-scope

- `RestartPolicy::on_crash_default()` や `next_delay()` などのメソッド実装（チケット M1-1 のスコープ）
- `serde` の導入（チケット M0-3 のスコープ）
- `thiserror` や `anyhow` の導入（チケット M0-2 のスコープ）
- tokio や petgraph など非同期・グラフ関連依存の追加（後続チケットで実施）
- メンバーシップの `src-tauri/Cargo.toml` への追加（Phase 3 統合時に実施）

## Investigation

### コードベース調査結果

```
crates/procreg/
  └── Tickets.md          # 存在するが、Cargo.toml / src/lib.rs 未作成
crates/dummy/
  └── (空)
```

- **発見1**: `crates/procreg/` はディレクトリのみ存在。Cargo.toml、src/ ともに未作成。
- **発見2**: ワークスペースは `src-tauri/Cargo.toml` 単独。`crates/` 配下のクレートはまだメンバー登録されていない。
- **発見3**: `src-tauri/Cargo.toml` の package 名は `zasso`、edition 2021。crate-type に `staticlib`, `cdylib`, `rlib`。
- **発見4**: RFC-001 §4 に示された全依存クレートのうち、M0-1 で実際に必要となるのは `std::time::Duration` のみ。tokio、petgraph、serde、thiserror 等は後続チケットで導入するため本チケットでは追加しない。
- **発見5**: `src-tauri/Cargo.toml` は workspace 定義を持たないため、`crates/procreg/` は独立した crate として cargo に認識させる必要がある。（後続チケットでワークスペース化する可能性あり）

### 設計上の制約

- 全型は `pub` 可視性を持ち、クレート外から参照可能であること
- `RestartPolicy` は PartialEq が必要（M1-1 のテストで比較に使用）
- `ShutdownTimeoutConfig` は Default トレイトを実装し、`ProcessDef` の `shutdown_timeout: Option<ShutdownTimeoutConfig>` で None 時に代替デフォルトとして利用できること

## Test Plan

### ユニットテスト計画

全テストは `src/lib.rs` 内の `#[cfg(test)] mod tests` に記述する。外部依存は一切ないため、全テストがメモリ内完結・決定論的・0msで完了する。

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `process_def_fields` | 正常系 | `ProcessDef` の全フィールドに値を代入し、`assert_eq!` で読み出し値を確認 |
| 2 | `restart_policy_never` | 正常系 | `RestartPolicy::Never` の構築と `matches!` によるバリアント確認 |
| 3 | `restart_policy_on_crash` | 正常系 | `RestartPolicy::OnCrash { ... }` の全フィールド代入・読み出し |
| 4 | `restart_policy_always` | 正常系 | `RestartPolicy::Always { ... }` の全フィールド代入・読み出し |
| 5 | `restart_policy_equality` | 正常系 | `PartialEq` — 同値比較が true、異値比較が false であること |
| 6 | `ready_condition_immediate` | 正常系 | `ReadyCondition::Immediate` の構築確認 |
| 7 | `ready_condition_delay` | 正常系 | `ReadyCondition::Delay(Duration::from_secs(5))` の構築と値取り出し |
| 8 | `ready_condition_log_contains` | 正常系 | `ReadyCondition::LogContains { pattern, timeout }` の構築と読み出し |
| 9 | `ready_condition_tcp_port` | 正常系 | `ReadyCondition::TcpPort { host, port, timeout, poll_interval }` の構築と読み出し（`host: IpAddr` は `"127.0.0.1".parse().unwrap()` で生成） |
| 10 | `shutdown_timeout_config_default` | 正常系 | `ShutdownTimeoutConfig::default()` の全フィールド確認（`unix_sigterm_timeout: 5s`, `windows_ctrl_break_timeout: 8s`） |
| 11 | `shutdown_timeout_config_custom` | 正常系 | カスタム値での構築と読み出し |
| 12 | `all_types_impl_clone` | 特性確認 | 全4型が `Clone` トレイトを実装していることの確認。クローン後の値が元と一致することを検証 |
| 13 | `process_def_clone_independence` | 特性確認 | `ProcessDef` のクローンがディープコピーであり、元の値を変更してもクローンに影響しないこと |

**カバレッジ目標:** クリティカルパス（型定義そのもの）のため100%。全バリアント・全フィールドを網羅する。

### ユニットテスト不可能な項目（例外）

なし。本チケットの全実装は純粋な値オブジェクトであり、メモリ内で完結するためユニットテスト100%カバレッジが可能。

## Boy Scout Rule — 翻訳可能性計画

本チケットはグリーンフィールド（新規作成）であり、Boy Scout Rule の対象となる既存コードは存在しない。しかし、新規に書くコードが翻訳可能性を満たすよう以下の点を遵守する：

1. **関数名を動詞句に**: 本チケットでは関数実装はないが、将来の `on_crash_default()` 等の命名が動詞句（`next_delay`, `resolve_start_order`）になるよう型設計で指針を示す
2. **フィールド名をドメイン概念に**: RFC に従い `name`, `program`, `args`, `env`, `depends_on`, `restart`, `ready`, `shutdown_timeout` — すべてプロセス管理ドメインの名詞として散文的に読める
3. **一型一責務**: `ProcessDef` は「プロセスの定義」、`RestartPolicy` は「再起動ポリシー」、`ReadyCondition` は「起動完了条件」、`ShutdownTimeoutConfig` は「シャットダウンタイムアウト設定」— 責務の混在なし
4. **コメントで「なぜ」を説明**: 各フィールドに日本語の doc コメントを付与し、値の意味や制約を説明する（「何を」は型名とフィールド名がすでに語る）

## Acceptance Criteria

- [ ] `crates/procreg/Cargo.toml` が正しく作成され、`cargo check` が通過する
- [ ] `ProcessDef` 構造体が RFC §5.1 通りの全フィールドを持つ
- [ ] `RestartPolicy` 列挙型が RFC §5.2 通りの3バリアントを持つ
- [ ] `ReadyCondition` 列挙型が RFC §5.3 通りの4バリアントを持つ
- [ ] `ShutdownTimeoutConfig` 構造体が RFC §5.4 通りの2フィールド + `Default` 実装を持つ
- [ ] 全型が `Clone + Debug` を derive する（`RestartPolicy` はさらに `PartialEq`）
- [ ] 全13テストケースが通過する
- [ ] 各フィールドに doc コメント（日本語）が記述され、「なぜ」を説明している
- [ ] `cargo build` が警告なく通過する（`#![allow(unused)]` 不使用）

## Notes

### 依存関係

このチケットは Phase 0 の最下層基盤であり、後続全チケットの前提条件となる。
- M0-2（エラー型）は本チケットの型を参照しない（独立）
- M0-3（状態・レジストリ型）は本チケットの `ProcessDef` を `RegistryEntry.def` として使用
- M1-1（RestartPolicy メソッド）は本チケットの `RestartPolicy` にメソッド追加

### 成果物

- 計画: context/0008-m0-1-processdef-restartpolicy-readycondition-shutdowntimeoutconfig/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0008-m0-1-processdef-restartpolicy-readycondition-shutdowntimeoutconfig/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0008-m0-1-processdef-restartpolicy-readycondition-shutdowntimeoutconfig/review.md（未作成、/review-ticket 全チェック通過後に作成）
