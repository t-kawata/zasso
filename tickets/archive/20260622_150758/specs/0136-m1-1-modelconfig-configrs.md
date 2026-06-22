---
ticket_id: 136
title: M1-1: ModelConfig ビルトインコンストラクタ (config.rs)
slug: m1-1-modelconfig-configrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0136-m1-1-modelconfig-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0136-m1-1-modelconfig-configrs/review.md
---

# M1-1: ModelConfig ビルトインコンストラクタ (config.rs)

## Summary

`ModelConfig` にビルトインモデル設定コンストラクタ `qwen3_5_0_8b()` / `qwen3_5_2b()` / `custom(name, path)` を実装する。ビルトイン Qwen3.5 モデルと任意モデルを同一の型システムで設定可能にする。

## Background

ビルトインモデル設定の提供は ggufrs の価値提案の核。`custom()` は crate 利用者が任意の mistralrs 対応モデルを登録するための汎用インターフェース。Qwen3.5 シリーズ以外を利用する場合も全く同じ型システム内で設定可能であることを保証する。

依存関係: M0-5（ModelConfig 構造体）reviewed ✅

## Scope

- `ModelConfig::qwen3_5_0_8b()`:
  - name = "qwen3.5-0.8b"
  - model_path = "models/Qwen3.5-0.8B-Q4_K_M.gguf"
  - lazy_load = true
  - context_size = Some(32768)
  - gpu_layers / batch_size / chat_template = None
- `ModelConfig::qwen3_5_2b()`:
  - name = "qwen3.5-2b"
  - model_path = "models/Qwen3.5-2B-Q4_K_M.gguf"
  - lazy_load = true
  - context_size = Some(32768)
  - gpu_layers / batch_size / chat_template = None
- `ModelConfig::custom(name: impl Into<String>, path: impl Into<PathBuf>)`:
  - name = 引数, model_path = 引数
  - lazy_load = true
  - context_size / gpu_layers / batch_size / chat_template = None

## Non-scope

- マージロジック → M1-4
- レジストリ操作 → M1-5

## Investigation

### 証拠 1: ModelConfig の現状確認

`ModelConfig` は M0-5 で定義済み。現時点では関連メソッドは一切実装されていない。

**ソース**: `src/config.rs` ModelConfig struct 定義（直接読み取り）

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-5 (#134) | reviewed ✅ | ModelConfig 構造体定義 |

### 証拠 3: 定数参照

ビルトインモデルの context_size は `DEFAULT_CONTEXT_SIZE`（32768）と同一。model_path のベースディレクトリは `DEFAULT_MODEL_DIR`（"models"）と一致するよう設計。

**ソース**: `src/consts/settings.rs` 定数定義

## Test Plan

### ユニットテスト計画

**テスト対象**: `config.rs` の `ModelConfig` コンストラクタ3メソッド

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `qwen3_5_0_8b_has_correct_name` | 正常系 | name == "qwen3.5-0.8b" |
| `qwen3_5_0_8b_has_correct_context_size` | 正常系 | context_size == Some(32768) |
| `qwen3_5_0_8b_lazy_load_is_true` | 正常系 | lazy_load == true |
| `qwen3_5_2b_has_correct_name` | 正常系 | name == "qwen3.5-2b" |
| `qwen3_5_2b_has_correct_context_size` | 正常系 | context_size == Some(32768) |
| `qwen3_5_2b_lazy_load_is_true` | 正常系 | lazy_load == true |
| `custom_uses_given_name_and_path` | 正常系 | name と model_path が引数通り |
| `custom_optional_fields_are_none` | 正常系 | context_size/gpu_layers/batch_size/chat_template が None |
| `custom_lazy_load_is_true` | 正常系 | lazy_load == true |
| `qwen3_5_0_8b_is_idempotent` | 正常系 | 2回呼んで全フィールド一致 |
| `qwen3_5_2b_is_idempotent` | 正常系 | 2回呼んで全フィールド一致 |

**カバレッジ目標**: 100%
**モック/スタブ**: 不要

### ユニットテスト不可能な項目（例外）

なし。全テストケースが純粋関数の検証。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（config.rs ModelConfig impl）

- コンストラクタ名は動詞句 + モデル識別子（`qwen3_5_0_8b` = Qwen3.5-0.8B 用）
- `custom(name, path)` は「カスタムモデル設定を名前とパスで作成する」と日本語訳可能
- 全コンストラクタは純粋関数（副作用なし、入力→出力の変換のみ）

### スコープ外の改善

特になし。

## Acceptance Criteria

- [ ] `ModelConfig::qwen3_5_0_8b()` が正しい固定値で実装されている
- [ ] `ModelConfig::qwen3_5_2b()` が正しい固定値で実装されている
- [ ] `ModelConfig::custom(name, path)` が引数通りの値 + lazy_load=true + オプション全Noneで実装されている
- [ ] `make check-ggufrs` が成功する
- [ ] 全11ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-5 (#134) | 先行実装必須 — ModelConfig 構造体（reviewed ✅） |
| M1-4 (未作成) | 後続 — GgufConfig マージロジック |
| M1-5 (未作成) | 後続 — ModelRegistry 同期メソッド |

### STUB 解決

本チケットは config.rs の M1-1 の STUB 部分を解決する。

### 成果物

- 計画: context/0136-m1-1-modelconfig-configrs/plan.md（未作成）
- 実装サマリ: context/0136-m1-1-modelconfig-configrs/implementation.md（未作成）
- レビュー報告書: context/0136-m1-1-modelconfig-configrs/review.md（未作成）
