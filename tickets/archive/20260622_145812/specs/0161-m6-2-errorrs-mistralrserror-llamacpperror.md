---
ticket_id: 161
title: M6-2: error.rs 修正 — MistralrsError → LlamaCppError
slug: m6-2-errorrs-mistralrserror-llamacpperror
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0161-m6-2-errorrs-mistralrserror-llamacpperror/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0161-m6-2-errorrs-mistralrserror-llamacpperror/review.md
---
# M6-2: error.rs 修正 — MistralrsError → LlamaCppError

## Summary

`crates/ggufrs/src/error.rs` の `MistralrsError` バリアントを `LlamaCppError` に名称変更し、対応する doc コメント・エラーメッセージ・テストを更新する。バリアントの内部構成（6バリアント構成）は維持する。`#[from]` のターゲット型は `mistralrs::error::Error` のまま一旦維持し、M6-11 で `llama_cpp_2::LlamaCppError` に差し替える。

## Background

llama-cpp-2 移行に伴い、`GgufError` の mistralrs 特化バリアント名とエラーメッセージを llama-cpp-2 用に変更する。ただし llama-cpp-2 クレートの依存追加（M6-11）より先に型名のみを変更することで、後続チケット（M6-4〜M6-8）が参照するエラー型名を早期に確定させる。

**制約**: この段階では `llama-cpp-2` クレートが Cargo.toml に追加されていないため、`#[from] llama_cpp_2::LlamaCppError` への変更はコンパイルできない。そのため `#[from]` のターゲットは `mistralrs::error::Error` のまま維持し、`[::STUB::]` マーカーで M6-11 での差し替え予定を明記する。

## Scope

- `error.rs`: `MistralrsError(#[from] mistralrs::error::Error)` → `LlamaCppError(#[from] mistralrs::error::Error)` にリネーム（`#[from]` ターゲットは M6-11 まで維持）
- `#[error("mistralrs エラー: {0}")]` → `#[error("llama-cpp エラー: {0}")]`
- doc コメント内の "mistralrs バックエンド" 関連記述を "llama-cpp" に更新
- テストコードもバリアント名・メッセージ・アサーションを同期して更新

## Non-scope

- `#[from]` ターゲットの `mistralrs::error::Error` → `llama_cpp_2::LlamaCppError` への変更は **M6-11** で行う（本チケットでは `[::STUB::]` マーカーのみ記載）
- `router.rs` の `MistralrsError` パターンマッチ（行50）は本チケットで同時に更新する（同一バリアント名の参照のため）
- `router.rs` のテスト（`mistralrs_error_returns_500`）は本チケットで同時に更新する
- `inference/generate.rs` の `GgufError::MistralrsError(...)` 構築（4箇所）は M6-6 で全書き換え時に削除されるため本チケットでは対応しない

## Investigation

**llama-cpp-2 v0.1.150 のエラー型**: docs.rs で確認。
- エラー型名: `LlamaCppError`（enum）
- 定義場所: `llama_cpp_2::LlamaCppError`
- 依存関係: `thiserror ^2` を使用
- 型エイリアス: `llama_cpp_2::Result<T>` は `Result<T, LlamaCppError>`

**MistralrsError の全使用箇所**（変更対象の分類）:

| ファイル | 行 | 使用形態 | 対応方針 |
|---------|-----|---------|---------|
| `error.rs:90` | バリアント定義 | `MistralrsError(#[from] mistralrs::error::Error)` | リネーム（#[from]維持） |
| `error.rs:11,22,56,85,87,89` | doc/attr コメント | 説明文 | 文言更新 |
| `error.rs:189-202,231-237,316-323` | テスト | バリアント構築 + アサーション | リネーム反映 |
| `router.rs:50` | パターンマッチ | `GgufError::MistralrsError(_)` | リネーム反映 |
| `router.rs:129-132` | テスト | `GgufError::MistralrsError(...)` | リネーム反映 |
| `inference/generate.rs:99,141,183,227` | エラー変換 | `.map_err(GgufError::MistralrsError)` | M6-6 で削除予定のため未対応 |

**既存テストの現状**（`cargo test --lib error`）:
- 20テストが error.rs 内に存在
- `from_mistralrs_error_works_via_from_attr` テストは `mistralrs::error::Error::RequestValidation(...)` から `GgufError` への変換を検証
- 本チケットではこのテストを維持する（`#[from]` ターゲットは mistralrs のままのため）

**スタブの確認**: ggufrs/src/server 配下のスタブは0件。ggufrs/src 全体では `settings.rs:19` の `[::STUB::] dead_code 抑制の理由` のみで本チケットに関係なし。

## Test Plan

### ユニットテスト計画

**対象**: `error.rs` 内 `#[cfg(test)] mod tests`（テスト更新）

全テストは外部依存なし・メモリ内完結。Mock/Stub は不要。

| # | カテゴリ | ケース | 検証内容 |
|---|---------|--------|---------|
| 1 | 正常系 | LlamaCppError Display 確認 | `GgufError::LlamaCppError(...)` の文字列出力に `"llama-cpp エラー:"` が含まれる |
| 2 | 正常系 | LlamaCppError source 確認 | `LlamaCppError` バリアントの `source()` が `Some` を返す |
| 3 | 正常系 | From mistralrs 継続確認 | `#[from]` 経由の `mistralrs::error::Error` → `GgufError` 変換が引き続き動作する |
| 4-20 | 維持 | 既存17テスト | 変更なしで通過すること |

### ユニットテスト不可能な項目（例外）

なし。全テスト項目がユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

**スコープ内（error.rs 修正）**:
- doc コメント内の "mistralrs バックエンド" という表現を "llama-cpp" に更新する。ただし本チケットの性質上、バリアント名とメッセージの置き換えが主であり、翻訳可能性に影響する新たなコードは追加しない。
- `ModelLoadFailed` の doc コメント（行56-57）に `mistralrs` への言及がある → `"llama-cpp バックエンドでのモデル読み込み処理..."` に修正する。

**スコープ外**:
- `router.rs` 行50 のパターンマッチの変数名（`MistralrsError`）をリネームする — これは本チケットで触れるファイルであるため同時に行う（必須）。
- `router.rs` 行79-80 の `use mistralrs::{...}` およびテスト内の `mistralrs` 参照は M6-9 で一括置き換え対象のため、本チケットでは触れない。

## Acceptance Criteria

- [ ] `MistralrsError` バリアントが `LlamaCppError` に名称変更されている
- [ ] `#[error("llama-cpp エラー: {0}")]` に変更されている
- [ ] doc コメントが llama-cpp 用に更新されている
- [ ] `[::STUB::]` マーカーで M6-11 での `#[from]` 差し替え予定が明記されている
- [ ] `router.rs` のパターンマッチが更新されている
- [ ] error.rs の全20テストが通過する
- [ ] 全テストスイートが通過する（`cargo test`）
- [ ] 翻訳可能性の検証が通っている

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0161-m6-2-errorrs-mistralrserror-llamacpperror/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0161-m6-2-errorrs-mistralrserror-llamacpperror/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0161-m6-2-errorrs-mistralrserror-llamacpperror/review.md（未作成、/review-ticket 全チェック通過後に作成）
