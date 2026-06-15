---
ticket_id: 85
title: PartialResult 後の SttCompleted 復活 — BufferFlush が効かなくなる問題の修正
slug: partialresult-sttcompleted-bufferflush
status: open
created_at: 2026-06-15
updated_at: 2026-06-15
---
# PartialResult 後の SttCompleted 復活 — BufferFlush が効かなくなる問題の修正

## Summary

#83 のコードレビューで「SttCompleted は FinalResult の後にのみ送信すべき」として PartialResult 後の SttCompleted 発行を削除したが、これが原因で BufferFlush（Option ダブルタップによるフラッシュ）が PostCorrection 前に機能しなくなった。mycute と同様に、非デコレーション時の PartialResult 後にも SttCompleted を送信するよう復活させる。

## Background

### 症状

1. 発話 → 認識 → `PartialResult` が届く → `is_stt_pending` が true のままになる
2. ユーザーが Option ダブルタップ → `BufferFlush` → `is_stt_pending == true` → `pending_flush = true` → 何もせず return ❌
3. PostCorrection が完了するまでフラッシュ不可能
4. PostCorrection 完了後、認識が停止（execute_pending_flush による）

### 影響

事後補正が行われる前に Option ダブルタップでフラッシュできず、ユーザー体験を著しく損なっている。

## Scope

### 含むもの

**修正**: `crates/voiput/src/backends/openai.rs` — イベントリスナーの PartialResult ハンドラ

非デコレーション時に PartialResult を送信した後、`SttCompleted` も送信する（mycute 準拠）。

### 依存関係

- #83（OpenAI モード ASR パイプライン）のバグ修正
- #84（デコレーション誤作動修正）とは独立

## Non-scope

- `is_pending_correction` の挙動変更（#81 の修正を維持）
- デコレーションパターンの変更
- SpeechStart 時のバッファ処理の変更

## Investigation

### 証拠1: #83 での誤った修正

#83 のコードレビュー時に「SttCompleted は FinalResult の後にのみ送信する」と指示し、PartialResult ハンドラから SttCompleted を削除した。この判断が誤りであった。`is_stt_pending`（Voiput 構造体）と `is_pending_correction`（PostCorrectionProcessor）は独立した異なるフラグであり、SttCompleted の有無が PostCorrectionProcessor の状態に影響することはない。

### 証拠2: mycute の実装

mycute の OpenAIRecognizer イベントリスナーは、非デコレーション時の PartialResult 送信後に必ず SttCompleted を送信している。これにより各発話単位で `is_stt_pending` が解放され、BufferFlush が常に機能する。

### 証拠3: 影響経路

```
SpeechStart → SttPending → is_stt_pending = true
  → PartialResult 到着（非デコレーション）
    → mycute: SttCompleted → is_stt_pending = false ✅
    → voiput: 何もしない → is_stt_pending = true のまま ❌
  → BufferFlush（Option ダブルタップ）
    → is_stt_pending == true → pending_flush = true → return ❌
```

## Test Plan

### ユニットテスト計画

#### テスト1: PartialResult 後の SttCompleted 確認
- **対象**: イベントリスナーの PartialResult 処理ロジック
- **正常系**: 非デコレーション時の PartialResult → SttCompleted が後続する
- **正常系**: デコレーション時の PartialResult → バッファリングされ、SttCompleted は送信されない
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト2: 既存テストの非影響確認
- **対象**: 全170テスト
- **正常系**: 全てパス

### ユニットテスト不可能な項目
- BufferFlush 実際の動作確認 — 実機+OS 権限が必要。手動テスト

### E2E 手動テスト計画
1. `make run-openai KEY=sk-xxx` で起動
2. 発話 → PartialResult 表示 → Option ダブルタップ → フラッシュされること
3. 発話 → 沈黙 → PostCorrection → Option ダブルタップ → フラッシュされること

## Boy Scout Rule — 翻訳可能性計画

- 追加する1行に「mycute 準拠: 各発話単位で is_stt_pending を解放するため」とコメントを付記する

## Acceptance Criteria

- [ ] 非デコレーション時の PartialResult 後に SttCompleted が送信される
- [ ] 発話中（デコレーション中）の PartialResult は従来通りバッファリングされる
- [ ] PostCorrection 前でも Option ダブルタップで BufferFlush が実行される
- [ ] 既存テスト全件がパスする
