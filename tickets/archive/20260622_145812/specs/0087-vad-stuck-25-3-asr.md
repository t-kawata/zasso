---
ticket_id: 87
title: VAD 発話 stuck 復帰 — インテリジェントタイムアウトの 25秒条件撤廃と 3秒 ASR 停滞閾値
slug: vad-stuck-25-3-asr
status: reviewed
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: /Users/kawata/shyme/zasso/tickets/context/0087-vad-stuck-25-3-asr/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0087-vad-stuck-25-3-asr/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0087-vad-stuck-25-3-asr/review.md
---
# VAD 発話 stuck 復帰 — インテリジェントタイムアウトの 25秒条件撤廃と 3秒 ASR 停滞閾値

## Summary

VAD が背景ノイズにより「発話中」状態から戻らなくなったとき、インテリジェントタイムアウトが発話を強制終了するまでの条件に 25秒の連続発話上限（`vad_max_speech_duration`）が含まれているため、短い発話後に VAD が stuck すると最大25秒間 ASR が停止する。

この 25秒条件を撤廃し、ASR 停滞 + 低信号の条件のみで強制終了させる。あわせて ASR 停滞検出の閾値を 5秒から 3秒に短縮する。

## Background

`make run-openai` で「はい、お世話になります。川田です。」（約2秒）と発話した後、デコレーションが永久に回り続け ASR 結果が一切返らない。

原因は VAD が背景ノイズを「発話中」と誤認識し、`SpeechEnd` が送出されないこと。発話を強制終了するインテリジェントタイムアウトの条件に **25秒経過** (`vad_max_speech_duration`) が含まれているため、短い発話後に VAD が stuck しても25秒間復帰できない。

## Scope

### 含むもの

**修正**: `crates/voiput/src/pipeline/streamer.rs` — `handle_vad()` 内の `is_intelligent_timeout`

```rust
// 修正前（25秒＋5秒＋低信号の3条件AND）:
time_exceeded && asr_stagnant && is_low_signal

// 修正後（3秒＋低信号の2条件AND、time_exceeded を撤廃）:
asr_stagnant && is_low_signal
```

**あわせて変更**:
- `ASR_STAGNATION_THRESHOLD_SECS`: 5.0 → **3.0**

### 依存関係
- なし（独立した修正）

## Non-scope
- VAD モデル自体の変更
- `vad_threshold` や `min_silence_duration` の調整
- Denoiser 関連の変更

## Investigation

### 証拠1: 現在の条件式

**ソース**: `crates/voiput/src/pipeline/streamer.rs:443-454`

```rust
let is_intelligent_timeout = if let Some(start_time) = self.current_speech_start {
    let elapsed_since_start = start_time.elapsed().as_secs_f32();
    let elapsed_since_text_change = self.last_asr_text_change.elapsed().as_secs_f32();
    let time_exceeded = elapsed_since_start >= self.config.vad_max_speech_duration;  // 25.0
    const ASR_STAGNATION_THRESHOLD_SECS: f32 = 5.0;
    let asr_stagnant = elapsed_since_text_change >= ASR_STAGNATION_THRESHOLD_SECS;
    let rms = self.calculate_rms(vad_window);
    let is_low_signal = rms < self.config.signal_rms_threshold;  // 0.005
    time_exceeded && asr_stagnant && is_low_signal  // ← 3つのANDで復帰不能に
```

### 証拠2: 症状の再現条件

- ユーザー発話 2秒 → VAD がノイズで stuck
- `asr_stagnant = true`（5秒後）→ しかし `time_exceeded = false`（25秒未満）
- 強制終了されずデコレーション継続、ASR 結果が永久に返らない

### 証拠3: リスク評価（全シナリオ確認済み）

| シナリオ | RMS | 結果 | 評価 |
|---------|-----|------|------|
| 発話中に3秒間考える | >0.005 | 強制終了しない（RMSが高いため `is_low_signal` 不成立） | ✅ |
| 発話後に無音 | <0.005 → 3秒後 | SpeechEnd より先にタイムアウトが来ても `process_one_utterance()` は空バッファで即リターン | ✅ |
| VAD がノイズに stuck | <0.005 → 3秒後 → 強制終了 | 発話キュー → 文字起こし → 結果到着 | ✅ |

## Test Plan

### ユニットテスト計画
- `handle_vad()` 内の条件式の論理をテスト
- **場所**: `src/pipeline/streamer.rs #[cfg(test)]`

### ユニットテスト不可能な項目
- 実際の VAD stuck 動作 — 実機+ノイズ環境が必要。手動テスト

### E2E / 手動テスト計画
1. `make run-openai KEY=sk-xxx` で起動
2. 「はい、お世話になります、川田です」と発話 → 発話終了後3秒以内に認識結果が表示されること
3. デコレーションが長時間回り続けないこと

## Boy Scout Rule — 翻訳可能性計画
- 条件式の変更意図（「ASR停滞＋低信号で強制終了」）をコメントに明記

## Acceptance Criteria
- [ ] VAD がノイズに stuck しても ASR 停滞 + 低信号で 3秒以内に強制終了する
- [ ] 発話中の「間」（RMS > 0.005）では強制終了しない
- [ ] 既存テスト全件がパスする
