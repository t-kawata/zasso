---
ticket_id: 64
title: 内部設計整合 — SpeechRecognizer 引数整理 + VoiputError 型修正 + 非対応OSバリデーション
slug: speechrecognizer-voiputerror-os
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/kawata/shyme/zasso/tickets/context/0064-speechrecognizer-voiputerror-os/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0064-speechrecognizer-voiputerror-os/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0064-speechrecognizer-voiputerror-os/review.md
---
# 内部設計整合 — SpeechRecognizer 引数整理 + VoiputError 型修正 + 非対応OSバリデーション

## Summary

RFC §4.4, §7.4, 付録B と実装の間の3項目の矛盾を解消する。ただし調査の結果、項目2（`VoiputError::UnsupportedEngine` の型）は**既に修正済み**であった。残る2項目（SpeechRecognizer 引数整理、非対応OSバリデーション）を実装する。

## Background

`Tickets.md` の Phase 6 (M7-2) に記載された3項目の RFC 整合性修正。
- `SpeechRecognizer::new()` の引数が RFC §7.4 の設計と異なる
- `VoiputError::UnsupportedEngine` の型が RFC §4.4 と異なる → **既に修正済み**
- `validate_config()` が OS 非対応チェックをしていない（RFC 付録B）

## Investigation

### 項目1: SpeechRecognizer::new() の引数（未修正）

**RFC §7.4 の設計**: `SpeechRecognizer::new(tx: Sender<SttEvent>, config: &VoiputConfig, replaces_map: Arc<RwLock<...>>)` — 3引数。config を受け取り内部で分解する。

**実装の現状** (`crates/voiput/src/recognizer.rs` L166-173): 6個の個別引数に分解されている。
```rust
pub fn new(
    tx: mpsc::Sender<SttEvent>,
    engine: SttEngine,
    locale: LocaleCode,
    openai_config: Option<OpenAiConfig>,
    vad_config: Option<VadConfig>,
    replaces_map: Arc<RwLock<IndexMap<String, Vec<String>>>>,
) -> Result<Self, String> {
```

**呼び出し元** (`crates/voiput/src/voiput.rs` L68-83): `Voiput::new()` 内で `config` のフィールドを個別に分解して渡している。
```rust
let openai_config = config.openai_config.clone();
let vad_processor_cfg = build_vad_processor_config(
    &config.vad, &config.vad_model_paths, &config.model_dir,
);
let recognizer = SpeechRecognizer::new(
    tx.clone(), config.engine, config.locale,
    openai_config, Some(vad_processor_cfg), replaces_map.clone(),
)?;
```

**証拠**: recognizer.rs L166-173, voiput.rs L68-83

### 項目2: VoiputError::UnsupportedEngine の型（既に修正済み）

**RFC §4.4 の設計**: `UnsupportedEngine { engine: SttEngine, reason: String }` — 名前付きフィールド。

**実装の現状** (`crates/voiput/src/error.rs` L22-23):
```rust
#[error("エンジン {engine:?} は現在のプラットフォームで利用できません: {reason}")]
UnsupportedEngine { engine: SttEngine, reason: String },
```
→ ✅ **既に RFC 準拠。修正不要。**

該当テスト (`crates/voiput/src/error.rs` L51-56) も名前付きフィールドでパターンマッチしていることも確認。

### 項目3: validate_config() OS 非対応チェック（未修正）

**RFC 付録B の要件**: Linux 等の非対応OSで `SttEngine::Os` を選択した場合、`Err(UnsupportedEngine { ... })` を返すこと。

**実装の現状** (`crates/voiput/src/recognizer.rs` L159-161):
```rust
pub fn validate_config(_engine: &SttEngine) -> Result<(), String> {
    Ok(())
}
```
`_engine` の先頭アンダースコアが示す通り、引数を受け取っているが**無視している**。常に `Ok(())` を返す。

**テストの現状** (`crates/voiput/src/recognizer.rs` L490-492):
```rust
#[test]
fn test_validate_config_os() {
    assert!(SpeechRecognizer::validate_config(&SttEngine::Os).is_ok());
}
```
macOS でこのテストが通るのは正しいが、Linux 等では本来 `Err` になるべき。`#[cfg]` による分岐が欠落している。

## Scope

### やること

1. **SpeechRecognizer::new() 引数整理**:
   - シグネチャを `pub fn new(tx, config: &VoiputConfig, replaces_map)` の3引数に変更
   - `Voiput::new()` から Config 分解ロジックを削除
   - `SpeechRecognizer::new()` 内部で `config` から必要なパラメータを取り出す

2. **validate_config() OS 非対応チェック追加**:
   - `#[cfg(not(any(target_os = "macos", target_os = "windows")))]` で `SttEngine::Os` → `Err`
   - それ以外の OS では常に `Ok`
   - テストも `#[cfg]` 分岐に対応して更新

### やらないこと

- 🔴 `VoiputError::UnsupportedEngine` — **既に修正済みのため本チケットでは何もしない**
- 🔴 `SpeechRecognizer` の内部ロジックの変更（引数シグネチャのみ）
- 🔴 `validate_config()` 以外のバリデーション処理

## Test Plan

### ユニットテスト計画

| # | テスト | 種別 | 内容 |
|---|-------|------|------|
| 1 | SpeechRecognizer::new が &VoiputConfig で呼べること | 正常系 | 3引数シグネチャ確認（コンパイル時） |
| 2 | Voiput::new() の分解ロジック削除確認 | 回帰 | 既存テストが通ること |
| 3 | validate_config Os → 非対応OSで Err | 異常系 | `#[cfg(not(any(target_os = "macos", windows)))]` テスト関数追加 |
| 4 | validate_config Os → macOS/Windows で Ok | 正常系 | `#[cfg(any(target_os = "macos", windows))]` テスト関数追加 |
| 5 | validate_config OpenAI → 常に Ok | 正常系 | OS 非依存 |
| 6 | 既存テスト全通過 | 回帰 | 124 tests |

### ユニットテスト不可能な項目（例外）

なし。全項目ユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

- 本チケットで触るコードは以下のファイル：
  - `recognizer.rs` — `SpeechRecognizer::new()` と `validate_config()` の修正
  - `voiput.rs` — Config 分解ロジックの削除
- 修正範囲は限定的で、新たな翻訳可能性の改善点は特になし（既存コードは M7-1 で改善済み）

## Acceptance Criteria

- [ ] `SpeechRecognizer::new(tx, &config, replaces_map)` の3引数シグネチャでコンパイル可能
- [ ] `Voiput::new()` 内の不要な Config 分解処理が削除されている
- [ ] Linux 等の非対応OSで `SttEngine::Os` → `Err(UnsupportedEngine { ... })`
- [ ] macOS/Windows で `SttEngine::Os` → `Ok`
- [ ] 既存全テスト通過（124 tests）
- [ ] 翻訳可能性の検証が通っている

## Notes

- 項目2（UnsupportedEngine 型）は調査により既に修正済みと判明したため、本チケットのスコープから除外
- `SpeechRecognizer::new()` の引数変更に伴い、`Voiput::new()` の impl ブロックも修正が必要

### 成果物

- 計画: context/0064-speechrecognizer-voiputerror-os/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0064-speechrecognizer-voiputerror-os/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0064-speechrecognizer-voiputerror-os/review.md（未作成、/review-ticket 全チェック通過後に作成）
