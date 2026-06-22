---
ticket_id: 102
title: SttEngine::Local バリアントの追加
slug: sttenginelocal
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0102-sttenginelocal/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0102-sttenginelocal/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0102-sttenginelocal/review.md
---
# SttEngine::Local バリアントの追加

## Summary

`crates/voiput/src/types.rs` の `SttEngine` 列挙型に `Local { backend: LocalAsrKind }` バリアントを追加する。これにより、ローカル ASR バックエンド（Qwen3-ASR）がエンジン選択肢の一つとして認識されるようになる。

**⚠️ 注意**: このバリアント追加により、既存の全 `match SttEngine` 式が非網羅になりコンパイルエラーが発生する。これは許容される中間状態であり、M6-1（SpeechRecognizer dispatch）で全ての分岐を追加して解消する。

## Background

RFC のアーキテクチャでは、`SttEngine` に第3のバリアント `Local` を追加する。これにより `SpeechRecognizer` の dispatch ロジックが `SttEngine::OpenAI` / `SttEngine::Os` / `SttEngine::Local` の3分岐になり、エンジン切り替えが enum のパターンマッチで完結する。

M2-1 で定義した `LocalAsrKind` が内部データとして使用され、どのローカル ASR モデル（Qwen3-ASR / 将来の Whisper 等）を使用するかを指定する。

## Scope

### 実施すること

- `crates/voiput/src/types.rs` の `SttEngine` に `Local { backend: LocalAsrKind }` を追加
- `#[deruve(Debug, Clone, Copy, PartialEq, Eq, Default)]` を維持（`#[default]` は `Os` のまま）

### 実施しないこと

- `SpeechRecognizer` の match 分岐追加（M6-1）
- `ConfigBuilder` のバリデーション（M6-2）
- 既存の match 式の更新 — 本チケットでは型追加のみ行い、match の更新は M6 に委ねる

## Investigation

### 現在の SttEngine 定義

`crates/voiput/src/types.rs` L10-18:
```rust
/// 音声認識エンジンの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SttEngine {
    /// OpenAI Whisper API（疑似ストリーミング）
    OpenAI,
    /// OS ネイティブ認識（macOS: SFSpeechRecognizer / Windows: WinRT）
    #[default]
    Os,
}
```

### SttEngine を match している箇所一覧

`crates/voiput/src/recognizer.rs` の以下 4 メソッド（+ validate_config のテスト）:
- `validate_config()` — L218-225（2 分岐 + Local 未対応 → 一旦 `Ok(())` で仮対応）
- `start()` — L364-372（2 分岐）
- `stop()` — L401-406（2 分岐）
- `tick()` — L523-528（2 分岐）

計 4 箇所の match 式が非網羅になる。これらは M6-1 で一斉に対応する。

### 依存チケット

- M2-1 (#101): ✅ reviewed（`LocalAsrKind` の定義完了）
- M6-1: 後続（SpeechRecognizer dispatch — 全 match 分岐の追加）

## Test Plan

### ユニットテスト計画

本チケットは型定義の変更のみであり、ランタイムテストは不要。コンパイルが通らない中間状態になるため、単体テストの追加は M6-1 以降で行う。

### ユニットテスト不可能な項目（例外）

型定義のみのためランタイムテスト不要。

## Boy Scout Rule — 翻訳可能性計画

`SttEngine::Local { backend }` — 「ローカルバックエンド（種別: backend）」として自然な英語に翻訳可能。

既存コードの改善は行わない。

## Acceptance Criteria

- [ ] `SttEngine` に `Local { backend: LocalAsrKind }` バリアントが追加されていること
- [ ] `#[default]` が引き続き `Os` にあること
- [ ] derive 属性が維持されていること
- [ ] 型定義の追加のみで、既存の match 式は修正しないこと
- [ ] M6-1 で対応する match 非網羅エラーが 4 箇所存在すること（認識済み）

## Notes

### 実装フラグメント

`crates/voiput/src/types.rs` の `SttEngine` に追加:

```rust
/// ローカル ASR モデル（sherpa-onnx 経由）
Local { backend: LocalAsrKind },
```

### 既存 match 式の非網羅箇所（M6-1 で対応）

| メソッド | ファイル | 行 | 対応チケット |
|---------|----------|-----|-------------|
| `validate_config()` | recognizer.rs | 218-225 | M6-1 |
| `start()` | recognizer.rs | 364-372 | M6-1 |
| `stop()` | recognizer.rs | 401-406 | M6-1 |
| `tick()` | recognizer.rs | 523-528 | M6-1 |

### 依存関係

- **先行実装必須**: M2-1 (#101) ✅ reviewed
- **後続**: M6-1 (SpeechRecognizer dispatch) — 本チケットで生じた match 非網羅エラーを解消
- **後続**: M6-2 (Config validation)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M2-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§3)
