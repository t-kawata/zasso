---
ticket_id: 71
title: health_check 完全実装 — SpeechRecognizer 委譲 + Windows 実ヘルスチェック
slug: health-check-speechrecognizer-windows
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/kawata/shyme/zasso/tickets/context/0071-health-check-speechrecognizer-windows/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0071-health-check-speechrecognizer-windows/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0071-health-check-speechrecognizer-windows/review.md
---
# health_check 完全実装 — SpeechRecognizer 委譲 + Windows 実ヘルスチェック

## Summary

`Voiput::health_check()` が常に 0（正常）を返すハードコードから、実際の OS ヘルスチェック結果を返すように変更する。Windows では `native::win_ffi::health_check_result()` を経由し、macOS/非対応OS では 0 を返す。Cargo.toml include 設定は #61 で既に対応済み。

## Background

RFC §4.5 の要件。`Tickets.md` の Phase 6 (M7-3) に記載された2項目のうち：
- `Cargo.toml include = [...]` → 既に #61 で対応済み
- `Voiput::health_check()` の完全実装 → **未対応**

`SpeechRecognizer` の `health_check()` メソッドは M5-1 のリファクタリングで消失している。新たに追加する必要がある。

## Investigation

### Voiput::health_check() (`crates/voiput/src/voiput.rs` L224-228)
```rust
pub fn health_check(&self) -> u32 {
    // SpeechRecognizer にヘルスチェック機構は統合されていないため、
    // 現状は常に 0（正常）を返す。M6 以降で拡張予定。
    0
}
```
→ 常に 0 を返すスタブ。コメントにも `M6 以降で拡張予定` とある。

### SpeechRecognizer の health_check() 消失
M5-1/M7-2 リファクタリングで `SpeechRecognizer` から `health_check()` メソッドが削除された。grep 結果:
```
/Users/kawata/shyme/zasso/crates/voiput/src/voiput.rs:224: health_check (スタブ)
```
→ recognizer.rs には存在しない。

### win_ffi の health_check 基盤 (`crates/voiput/src/native/win_ffi.rs` L59-76)
```rust
pub fn health_check_result() -> u32;
pub fn store_health_check_result(result: u32);
pub fn is_health_check_acknowledged() -> bool;
pub fn acknowledge_health_check();
```
WinSpeechBackend 初期化時 (backends/win.rs L304) に `store_health_check_result(health as u32)` で保存されている。すなわち呼び出し基盤は既に整っている。

### test-run.rs の現状 (`crates/voiput/src/binary/test-run.rs` L933-934)
```rust
println!("    health_check() = {} (スタブ: M7-3 で実装予定)", voiput.health_check());
```
→ 実装完了後、このメッセージを更新する必要あり。

### Cargo.toml include
✅ #61 で既に対応済み。本チケットのスコープ外。

## Scope

### やること

1. **SpeechRecognizer に health_check() を追加** (`recognizer.rs`):
   - Windows: `native::win_ffi::health_check_result()` を返す
   - macOS/非対応OS: 0 を返す
   - `pub(crate)` 可視性で Voiput から呼び出せるようにする

2. **Voiput::health_check() の委譲** (`voiput.rs`):
   - `return 0` → `self.recognizer.health_check()` に変更
   - スタブコメント除去

3. **test-run.rs メッセージ更新**:
   - `(スタブ: M7-3 で実装予定)` → 削除

### やらないこと

- 🔴 Cargo.toml include 設定（#61 で済み）
- 🔴 WinSpeechBackend の health_check 保存ロジック変更
- 🔴 戻り値ビットマスク定義の変更

## Test Plan

### ユニットテスト計画
| # | テスト | 種別 | 内容 |
|---|-------|------|------|
| 1 | health_check macOS → 0 | 正常系 | `#[cfg(not(target_os = "windows"))]` で Voiput テスト |
| 2 | health_check Windows → win_ffi 値 | 正常系 | `#[cfg(target_os = "windows")]` で Voiput テスト |
| 3 | 既存テスト全通過 | 回帰 | 124 tests |

### ユニットテスト不可能な項目（例外）
- Windows 実機でのビットマスク値検証: WinRT ランタイム依存のため統合テストで補完

## Boy Scout Rule — 翻訳可能性計画
- 修正範囲は限定的で翻訳可能性の追加改善は不要

## Acceptance Criteria
- [ ] `Voiput::health_check()` が `self.recognizer.health_check()` に委譲している
- [ ] macOS で `health_check()` が 0 を返す
- [ ] Windows で `health_check()` が `native::win_ffi::health_check_result()` の値を返す
- [ ] test-run.rs のスタブ予告メッセージが削除されている
- [ ] 既存全テスト通過（124 tests）

## Notes
- Cargo.toml include 設定は本チケットのスコープ外（#61 で対応済み）

### 成果物
- 計画: context/0071-health-check-speechrecognizer-windows/plan.md（未作成）
- 実装サマリ: context/0071-health-check-speechrecognizer-windows/implementation.md（未作成）
- レビュー報告書: context/0071-health-check-speechrecognizer-windows/review.md（未作成）
