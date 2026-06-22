---
ticket_id: 100
title: trate クレートのモックベース単体テスト
slug: trate
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0100-trate/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0100-trate/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0100-trate/review.md
---
# trate クレートのモックベース単体テスト

## Summary

trate crate にモック実装を用いた単体テストを追加する。`MockBackend` で `AsrBackend` トレイトのデフォルト実装の動作を検証し、`MockLocalBackend` で `LocalAsrBackend` トレイトの実装を検証する。全テストはメモリ内完結・決定論的・ミリ秒単位で完了する。

## Background

M1-1 / M1-2 で定義した 2 つのトレイト（`AsrBackend`, `LocalAsrBackend`）はデフォルト実装を持つ。これらのトレイトの契約（contract）が正しく機能することを MockBackend を用いて検証する必要がある。テストは trate crate に同梱され、sherpa-onnx やモデルファイルに依存しないため、CI でも常に成功する。

テストの配置は `crates/trate/src/lib.rs` 内の `#[cfg(test)] mod tests` とする（テストのみのために新規ファイルを作成する必要はない）。

## Scope

### 実施すること

- `crates/trate/src/lib.rs` に `#[cfg(test)] mod tests` を追加する
- `MockBackend` 構造体の定義（`impl AsrBackend`）
- `MockLocalBackend` 構造体の定義（`impl LocalAsrBackend`）
- 以下のテストケースを実装：
  1. `test_mock_backend_transcribe_empty` — 空サンプルで空文字列が返ること
  2. `test_mock_backend_transcribe_non_empty` — 非空サンプルでモック結果が返ること
  3. `test_mock_backend_default_backend_name` — デフォルトで "unknown" が返ること
  4. `test_mock_backend_post_correct_passthrough` — `post_correct` デフォルト実装が素通しであること
  5. `test_mock_backend_insert_punctuation_passthrough` — `insert_punctuation` デフォルト実装が素通しであること
  6. `test_mock_local_backend_model_path` — `model_path()` が設定値を返すこと
  7. `test_mock_local_backend_is_healthy` — `is_healthy()` が true/false を返すこと
- `cargo test --manifest-path crates/trate/Cargo.toml` で全テスト通過確認

### 実施しないこと

- voiput crate のテスト（M3-4 で実施）
- `Qwen3AsrBackend` の結合テスト（M8-1 で実施）
- trate crate への dev-dependencies の追加（外部依存不要）
- ファイル I/O やネットワーク I/O を伴うテスト

## Investigation

### 現在の trate crate の状態

- `lib.rs`: `AsrBackend` トレイト定義 ✅ 完了
- `local.rs`: `LocalAsrBackend` トレイト定義 ✅ 完了
- `cargo check --manifest-path crates/trate/Cargo.toml` ✅ 成功
- `cargo test --manifest-path crates/trate/Cargo.toml` → 現在は 0 テスト（本チケットで追加）

### RFC に基づくテスト設計

RFC §11.1 より:
```rust
struct MockBackend;

impl AsrBackend for MockBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        if samples.is_empty() {
            Ok(String::new())
        } else {
            Ok("mock recognition result".to_string())
        }
    }
    fn backend_name(&self) -> &'static str { "mock" }
}
```

MockLocalBackend:
```rust
struct MockLocalBackend;

impl AsrBackend for MockLocalBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        Ok("local mock".to_string())
    }
    fn backend_name(&self) -> &'static str { "local-mock" }
}

impl LocalAsrBackend for MockLocalBackend {
    fn model_path(&self) -> &str { "/mock/model.onnx" }
    fn is_healthy(&self) -> bool { true }
}
```

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/trate/` → 該当なし（M1-2 ですべて解決済み）

### 依存チケット

- M1-1 (#98): ✅ reviewed
- M1-2 (#99): ✅ reviewed
- M3-4: 後続（voiput 側のテストコード移行では、本チケットの MockBackend パターンを参照する）

## Test Plan

### ユニットテスト計画

本チケットの実装そのものがテストである。以下の 7 ケースを実装する：

| # | テスト名 | 種別 | 検証内容 |
|---|---------|------|---------|
| 1 | `test_mock_backend_transcribe_empty` | 正常系/境界値 | 空のサンプル配列 → 空文字列 |
| 2 | `test_mock_backend_transcribe_non_empty` | 正常系 | 非空サンプル → `"mock recognition result"` |
| 3 | `test_mock_backend_default_backend_name` | 正常系 | `backend_name()` → `"mock"` |
| 4 | `test_mock_backend_post_correct_passthrough` | デフォルト実装 | `post_correct("hello")` → `"hello"` |
| 5 | `test_mock_backend_insert_punctuation_passthrough` | デフォルト実装 | `insert_punctuation("hello", "ja")` → `"hello"` |
| 6 | `test_mock_local_backend_model_path` | 正常系 | `model_path()` → `"/mock/model.onnx"` |
| 7 | `test_mock_local_backend_is_healthy` | 正常系 | `is_healthy()` → `true` |

カバレッジ目標: 追加する全コード行の 100%（MockBackend / MockLocalBackend の全メソッドが少なくとも 1 回は呼ばれること）

### ユニットテスト不可能な項目（例外）

なし（全テストがメモリ内完結・決定論的）

## Boy Scout Rule — 翻訳可能性計画

本チケットで追加するテストコードは、以下の翻訳可能性を確認する：

- テスト関数名: `test_<対象>_<シナリオ>` — 命名規則に準拠（`test_mock_backend_transcribe_empty` = 「モックバックエンドが空入力を書き起こすテスト」）
- MockBackend の `backend_name` → `"mock"` — バックエンド識別子として自然
- MockLocalBackend の `model_path` → `"/mock/model.onnx"` — テスト用パスとして自明

## Acceptance Criteria

- [ ] `crates/trate/src/lib.rs` に `#[cfg(test)] mod tests` が追加されていること
- [ ] `MockBackend` / `MockLocalBackend` が実装されていること
- [ ] 7 つのテストケースがすべて実装されていること
- [ ] `cargo test --manifest-path crates/trate/Cargo.toml` が全テスト通過すること
- [ ] 全テストがメモリ内完結（外部依存なし）であること
- [ ] trate に不要な dev-dependencies が追加されていないこと

## Notes

### 実装フラグメント

`crates/trate/src/lib.rs` の末尾に追加するテストコード:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    struct MockBackend;

    impl AsrBackend for MockBackend {
        fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
            if samples.is_empty() {
                Ok(String::new())
            } else {
                Ok("mock recognition result".to_string())
            }
        }
        fn backend_name(&self) -> &'static str {
            "mock"
        }
    }

    struct MockLocalBackend;

    impl AsrBackend for MockLocalBackend {
        fn transcribe(&mut self, _samples: &[f32]) -> Result<String> {
            Ok("local mock".to_string())
        }
        fn backend_name(&self) -> &'static str {
            "local-mock"
        }
    }

    impl LocalAsrBackend for MockLocalBackend {
        fn model_path(&self) -> &str {
            "/mock/model.onnx"
        }
        fn is_healthy(&self) -> bool {
            true
        }
    }

    #[test]
    fn test_mock_backend_transcribe_empty() {
        let mut backend = MockBackend;
        assert_eq!(backend.transcribe(&[]).unwrap(), "");
    }

    #[test]
    fn test_mock_backend_transcribe_non_empty() {
        let mut backend = MockBackend;
        let samples = vec![0.0f32; 16000];
        assert_eq!(backend.transcribe(&samples).unwrap(), "mock recognition result");
    }

    #[test]
    fn test_mock_backend_default_backend_name() {
        let backend = MockBackend;
        assert_eq!(backend.backend_name(), "mock");
    }

    #[test]
    fn test_mock_backend_post_correct_passthrough() {
        let mut backend = MockBackend;
        assert_eq!(backend.post_correct("hello").unwrap(), "hello");
    }

    #[test]
    fn test_mock_backend_insert_punctuation_passthrough() {
        let mut backend = MockBackend;
        assert_eq!(backend.insert_punctuation("hello", "ja").unwrap(), "hello");
    }

    #[test]
    fn test_mock_local_backend_model_path() {
        let backend = MockLocalBackend;
        assert_eq!(backend.model_path(), "/mock/model.onnx");
    }

    #[test]
    fn test_mock_local_backend_is_healthy() {
        let backend = MockLocalBackend;
        assert!(backend.is_healthy());
    }
}
```

### 依存関係

- **先行実装必須**: M1-1 (#98) ✅ reviewed、M1-2 (#99) ✅ reviewed
- **後続**: なし（M1 マイルストーンの最終チケット）

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M1-3
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§11.1)
