---
ticket_id: 119
title: build.rs Qwen3-ASR モデルダウンロード追加
slug: buildrs-qwen3-asr
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0119-buildrs-qwen3-asr/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0119-buildrs-qwen3-asr/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0119-buildrs-qwen3-asr/review.md
---
# build.rs Qwen3-ASR モデルダウンロード追加

## Summary

`crates/voiput/build.rs` に Qwen3-ASR モデルファイル（4 ファイル）のダウンロード処理を追加する。既存の VAD モデルダウンロードパターンに則り、`models/qwen3-asr/` サブディレクトリに配置する。

## Background

Qwen3-ASR バックエンド（M4-2）は起動時に 4 つの ONNX モデルファイルを必要とする。VAD モデルと同様に build.rs でビルド時に自動ダウンロードする。`tokens.txt` が VAD モデルと同名で衝突するため、`qwen3-asr/` サブディレクトリに分離する。

## Scope

### 実施すること

- `build.rs` に `QWEN3_MODEL_FILES` 定数を追加（4 ファイル、RFC §8.1 通り）
- ダウンロードループと存在確認ループに Qwen3 ファイルを統合
- `models/qwen3-asr/` サブディレクトリを作成
- `cargo build` で正常動作することを確認

### 実施しないこと

- VAD モデルダウンロードの変更
- テストコードの追加

## Investigation

### 既存の build.rs パターン

`MODEL_FILES` 定数 + `create_dir_all` + ダウンロードループ + 存在確認ループ。Qwen3 モデルは同一パターンで `models/qwen3-asr/` サブディレクトリに追加する。

### RFC §8.1 のダウンロード URL

```rust
const QWEN3_MODEL_FILES: &[(&str, &str)] = &[
    ("qwen3-asr/encoder.int8.onnx", "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/encoder.int8.onnx"),
    ("qwen3-asr/decoder.int8.onnx", "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/decoder.int8.onnx"),
    ("qwen3-asr/joiner.int8.onnx", "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/joiner.int8.onnx"),
    ("qwen3-asr/tokens.txt", "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/tokens.txt"),
];
```

### 依存チケット

- M2-4 (#104): ✅ reviewed（定数は別管理）
- 後続: M8-1 (結合テスト), M8-2 (最終確認)

## Test Plan

ダウンロード処理のため自動テスト不可。`cargo build` で正常動作することを確認。

## Boy Scout Rule — 翻訳可能性計画

既存パターンに則った追加のため改善不要。

## Acceptance Criteria

- [ ] `QWEN3_MODEL_FILES` 定数が 4 ファイルの URL ペアで定義されていること
- [ ] `models/qwen3-asr/` サブディレクトリが作成されていること
- [ ] ダウンロードループに Qwen3 ファイルが含まれていること
- [ ] 存在確認ループに Qwen3 ファイルが含まれていること
- [ ] `cargo build`（voiput）が成功すること

## Notes

### 依存関係

- **先行実装必須**: M2-4 (#104) ✅ reviewed
- **後続**: M8-1 (結合テスト)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M7-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§8.1)
