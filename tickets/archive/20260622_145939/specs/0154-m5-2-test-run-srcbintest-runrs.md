---
ticket_id: 154
title: "M5-2: test-run バイナリ (src/bin/test-run.rs)"
slug: m5-2-test-run-srcbintest-runrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0154-m5-2-test-run-srcbintest-runrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0154-m5-2-test-run-srcbintest-runrs/review.md
plan_path: /Users/kawata/shyme/zasso/tickets/context/0154-m5-2-test-run-srcbintest-runrs/plan.md
---

# M5-2: test-run バイナリ (src/bin/test-run.rs)

## Summary

目視確認用バイナリ `test-run` を実装する。`cargo run --bin test-run` で
3パターンの推論（Structured Output → 通常生成 → ストリーミング生成）を
順次実行し、各パターンの結果と最終サマリーを表示する。

## Background

### 設計上の位置づけ（RFC §9.3）

test-run バイナリは、ggufrs の全推論機能を人間が目視確認するための
エンドツーエンド検証ツール。結合テストではカバーしきれない
実際のモデルロード・推論実行の確認に使用する。

### 現在の実装状況

- `src/bin/test-run.rs`: **スタブのみ存在** — `[::STUB::]` マーカー付きで空の main 関数
- `models/`: M5-1 で2モデル（Qwen3.5-0.8B, Qwen3.5-2B）が**ダウンロード済み**
- `lib.rs`: 全公開 API（`GgufEngine`, `InferenceEngine` の4メソッド）が**利用可能**
- `Cargo.toml`: バイナリターゲット `[[bin]] name = "test-run"` は**定義済み**

### このチケットの必要性

ggufrs の開発において、実際のモデルを使ったクイックチェックは
結合テストだけでは不十分。特に Structured Output のフォーマットや
ストリーミング出力の体感を人間が確認するためのツールが必要。
また、スタブ状態の test-run.rs を解決することで M5 マイルストーンが
前進する。

## Scope

### 実装するもの

1. **`src/bin/test-run.rs` 実装（スタブからの置き換え）**
   - `GgufEngine` 初期化（Qwen3.5-0.8B, CPU-Only）
   - パターン1: Structured Output（校正アシスタント、JSON Schema 制約）
   - パターン2: 通常テキスト生成（Rust 説明）
   - パターン3: ストリーミング生成（自己紹介）
   - セパレーター・ラベル付き表示
   - エラー時 panic 回避＋サマリー PASS/FAIL 表示

### 実装しないもの

- サーバーモードの起動確認 — M5-2 ではスコープ外（M4-2 で既に結合テスト済み）
- 2B モデルを使用した推論 — 0.8B で十分
- 自動テスト — test-run は目視確認用であり自動テスト対象外

## Investigation

### ソースコード調査結果

#### 現在の test-run.rs の状態

**ファイル: `crates/ggufrs/src/bin/test-run.rs`**（10行）

```rust
//! # test-run — 目視確認用バイナリ
//! ...
//! # [::STUB::] M5-2 で実装

fn main() {
    println!("[::STUB::] test-run — M5-2 で実装予定");
}
```

M5-2 で完全な実装に置き換える。

#### モデルファイルの状態

`models/` ディレクトリに2ファイルがダウンロード済み：

| ファイル | サイズ |
|---------|--------|
| `Qwen3.5-0.8B-Q4_K_M.gguf` | 389MB |
| `Qwen3.5-2B-Q4_K_M.gguf` | 1.2GB |

`ModelConfig::qwen3_5_0_8b()` の `model_path` は `"models/Qwen3.5-0.8B-Q4_K_M.gguf"` であり、
ファイルとパスが一致する。

#### 公開 API の状態

```rust
// use ggufrs::* で利用可能
pub use config::{ConfigLayer, GgufConfig, GpuConfig, GpuProvider, ModelConfig, ServerConfig};
pub use error::GgufError;
pub use inference::{GenerateParams, InferenceEngine};
pub use registry::{ModelInfo, ModelRegistry};
// GgufEngine 構造体
// InferenceEngine トレイト（generate, generate_structured, generate_stream, send_raw）
// mistralrs 型（ChatCompletionResponse, TextMessages, TextMessageRole 等）
```

#### RFC §9.3 の参考実装

RFC に約100行の実装例が記載されている。以下の構造：

1. `print_separator()` — セパレーター線＋ラベル表示
2. `main()` — エンジン初期化 → 3パターン → サマリー

RFC のコード例では `anyhow::Result` を使用しているが、ggufrs の実際の API は
`GgufError` を返す。test-run はバイナリのため `anyhow` が適切。

#### スタブ状況

M5-2 で解決される STUB：
```
crates/ggufrs/src/bin/test-run.rs:6:
  [::STUB::] M5-2 で実装 → 実装完了後削除
crates/ggufrs/src/bin/test-run.rs:9:
  println!("[::STUB::] test-run — M5-2 で実装予定"); → 実装に置き換え
```

#### 依存チケットの状態

- **M3-5** (#149): ✅ reviewed — lib.rs 統合・re-export 完了
- **M4-2** (#151): ✅ reviewed — サーバー起動（推奨だが必須ではない）
- **M5-1** (#153): ✅ reviewed — build.rs モデル自動DL完了、実モデル利用可能

3つの依存全て完了しており、M5-2 はブロックされていない。

## Test Plan

### テスト計画

test-run は目視確認用バイナリであるため、自動テストの対象外。
以下の検証で代替する：

| # | 検証項目 | 方法 |
|---|---------|------|
| 1 | コンパイル確認 | `cargo check --bin test-run` |
| 2 | バイナリビルド | `cargo build --bin test-run` |
| 3 | 全3パターン実行（目視） | `cargo run --bin test-run` で出力確認 |
| 4 | モデル不在時のエラー表示 | `models/` 退避後実行 → 明確なエラーメッセージ |
| 5 | 既存テストへの影響 | `cargo test` 全159件通過 |

### テスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 推論結果の内容検証 | LLM の出力は非決定論的。フォーマットのみ確認可能 |
| ストリーミング出力の自動テスト | 実際の逐次出力を目視確認するための機能 |

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

スタブ実装を本実装に置き換える。RFC §9.3 の参考実装には `anyhow::Result` や
`unwrap()` が使われているが、test-run はバイナリのため許容範囲。

### 遵守すべき翻訳可能性のルール

1. **関数名は動詞句にする**:
   - `print_separator` — 「セパレーターを表示する」
   - `main` — エントリポイント

2. **変数名はドメイン概念を表現する**:
   - `engine` — GgufEngine インスタンス
   - `schema` — JSON Schema
   - `result` — 生成結果テキスト

3. **一関数一責務**:
   - `print_separator`: 表示フォーマットのみ
   - `main`: エンジン初期化 → パターン実行 → サマリー表示

4. **エラーハンドリング（バイナリ向け）**:
   - 各パターンは `match` でエラーを捕捉し、panic せずサマリーで FAIL 表示
   - エンジン初期化エラーは早期 return（モデル不在時など）

## Acceptance Criteria

- [ ] `cargo check --bin test-run` が通過する
- [ ] `cargo build --bin test-run` が成功する
- [ ] 3パターンの推論（Structured Output → 通常生成 → ストリーミング）が実装されている
- [ ] 各パターンにセパレーター＋ラベルが表示される
- [ ] エラー時は panic せずサマリーで FAIL 表示される
- [ ] 最終サマリーで全パターンの PASS/FAIL が一覧表示される
- [ ] `[::STUB::]` マーカーが test-run.rs から除去されている
- [ ] 全既存テスト（159件）が通過する

## Notes

- test-run は CPU-Only モードで動作する（`GpuProvider::Cpu`, `cpu_only: true`）
- `tracing_subscriber::fmt::init()` で tracing を初期化する
- 0.8B モデルを使用（1.2GB の 2B モデルより軽量で高速）
- `tokio::time::sleep` を入れなくても逐次実行で問題ない
- 依存: M3-5（lib.rs 統合）✅完了、M4-2（推奨）✅完了、M5-1（モデルDL）✅完了
- 参照: RFC.md §9.3（test-run バイナリ実装詳細）
- 参照: `crates/ggufrs/Tickets.md` L575-595（オリジナルチケット定義）

### 成果物

- 計画: context/0154-m5-2-test-run-srcbintest-runrs/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0154-m5-2-test-run-srcbintest-runrs/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0154-m5-2-test-run-srcbintest-runrs/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
