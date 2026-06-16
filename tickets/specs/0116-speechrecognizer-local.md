---
ticket_id: 116
title: SpeechRecognizer の Local ディスパッチ追加
slug: speechrecognizer-local
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0116-speechrecognizer-local/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0116-speechrecognizer-local/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0116-speechrecognizer-local/review.md
---
# SpeechRecognizer の Local ディスパッチ追加

## Summary

`crates/voiput/src/recognizer.rs` の `SpeechRecognizer` に `SttEngine::Local` のディスパッチ分岐を追加する。これにより M2-2 で発生した 4 つの match 非網羅エラーと M5-2 の簡易アダプターが解決され、`cargo test --lib` が再び通過するようになる。

## Background

M6-1 は M6 マイルストーンの最初のチケットであり、これまで蓄積された 5 つの `[::STUB::]` を一斉解決する。`SpeechRecognizer` に `local_recognizer: Option<LocalRecognizerAdapter>` フィールドを追加し、`start()/stop()/tick()/set_locale()/update_config()/validate_config() ` の全メソッドで `SttEngine::Local` の分岐を本実装する。

## Scope

### 実施すること

- `SpeechRecognizer` 構造体に `local_recognizer: Option<LocalRecognizerAdapter>` フィールド追加
- `SpeechRecognizer::new()` で `SttEngine::Local` 時に `LocalRecognizerAdapter::new()` を呼び出し
- 5 メソッドに `SttEngine::Local` 分岐追加:
  - `start()`: `local_recognizer.start()`
  - `stop()`: `local_recognizer.stop()`
  - `tick()`: no-op（RFC §7 動作表）
  - `set_locale()`: `LocalRecognizerAdapter::set_locale()` を呼ぶ
  - `update_config()`: stop → 再生成 → start
  - `validate_config()`: `Ok(())`（Local は全プラットフォーム利用可能）
- **スタブ解決（5 件）**:
  - 4 件の `SttEngine::Local` match arm 仮実装 → 本実装に置き換え
  - 1 件の `LocalRecognizerAdapter` 簡易実装 → `#[allow(dead_code)]` 除去
- `cargo test --lib` 全通過確認

### 実施しないこと

- `VoiputConfigBuilder.validate()`（M6-2）
- 結合テスト（M8-1）

## Investigation

### 解決するスタブ

| # | スタブ | ファイル | 行 | 現状 |
|---|--------|---------|-----|------|
| 1 | SttEngine::Local (start) | recognizer.rs | 〜389 | `log::error! + is_running=false` |
| 2 | SttEngine::Local (stop) | recognizer.rs | 〜425 | no-op |
| 3 | SttEngine::Local (tick) | recognizer.rs | 〜550 | no-op |
| 4 | SttEngine::Local (validate) | recognizer.rs | 〜226 | `Ok(())` |
| 5 | LocalRecognizerAdapter | recognizer.rs | 〜654 | `#[allow(dead_code)]` 簡易実装 |

### 依存チケット

- M5-1 (#114): ✅ reviewed（LocalRecognizer）
- M5-2 (#115): ✅ reviewed（LocalRecognizerAdapter）
- M6-2: 後続（Config validation）
- M6-3: 後続（全警告ゼロ確認）

## Test Plan

既存テスト（`test_validate_config_openai`, `test_validate_config_os_supported`）に加え、Local バックエンドのバリデーションテストを追加。

## Boy Scout Rule — 翻訳可能性計画

5 つの `[::STUB::]` を除去しコードベースの正確性を向上。

## Acceptance Criteria

- [ ] `SpeechRecognizer` に `local_recognizer` フィールドが追加されていること
- [ ] 5 メソッドすべてに `SttEngine::Local` の本分岐が実装されていること
- [ ] 5 つの `[::STUB::]` がすべて除去されていること
- [ ] `cargo check` が 0 errors / 0 warnings で成功すること
- [ ] `cargo test --lib` が全通過すること

## Notes

### 依存関係

- **先行実装必須**: M5-1 (#114) ✅, M5-2 (#115) ✅
- **後続**: M6-2 (Config validation), M6-3 (全警告ゼロ確認)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M6-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§7)
