---
ticket_id: 86
title: SpeechEnd の SttCompleted 追加と GTCRN デノイザーパス修正
slug: speechend-sttcompleted-gtcrn
status: reviewed
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: /Users/kawata/shyme/zasso/tickets/context/0086-speechend-sttcompleted-gtcrn/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0086-speechend-sttcompleted-gtcrn/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0086-speechend-sttcompleted-gtcrn/review.md
---
# SpeechEnd の SttCompleted 追加と GTCRN デノイザーパス修正

## Summary

2つのバグ修正を行う:

1. **SpeechEnd ハンドラに SttCompleted を追加** — 発話終了時に is_stt_pending が解放されず BufferFlush が効かなくなる問題の根本修正
2. **GTCRN デノイザーモデルパスが空文字** — OpenAI モードでノイズ除去が一切適用されていない問題の修正

## Background

### 修正1: SpeechEnd で SttCompleted がない

SpeechEnd でバッファリングされた PartialResult をフラッシュする際、SttCompleted を送信していない。#85 で非デコレーション時の PartialResult 後に SttCompleted を追加したが、SpeechEnd 経由のフラッシュでも同様の問題が発生する。

### 修正2: GTCRN パスが空

`test-run.rs:323` で `gtcrn: String::new()` となっており、OpenAI モードでも Denoiser が初期化されない。GTCRN モデル（`models/gtcrn.onnx`）は存在するが読み込まれず、全発話がノイズ除去なしで Whisper API に送信される。

## Scope

### 含むもの

#### 修正1: SpeechEnd に SttCompleted 追加
- **ファイル**: `crates/voiput/src/backends/openai.rs`
- **内容**: SpeechEnd ハンドラ内で buffered PartialResult フラッシュ後に `SttCompleted` を送信する

#### 修正2: GTCRN モデルパス設定
- **ファイル**: `crates/voiput/src/binary/test-run.rs`
- **内容**: `gtcrn: String::new()` → `gtcrn: model_path("gtcrn.onnx")`（全該当箇所）

### 依存関係
- #85（PartialResult 後の SttCompleted 復活）の延長線上にある修正

## Non-scope
- GTCRN モデル自体の変更
- Denoiser の有効/無効設定の追加
- OS 標準モードへの Denoiser 適用（不要と確認済み）

## Investigation

### 証拠1: SpeechEnd ハンドラ

**ソース**: `crates/voiput/src/backends/openai.rs:400-420`

SpeechEnd ハンドラで buffered PartialResult をフラッシュするが、SttCompleted を送信していない。
#85 で PartialResult 非デコレーション時の SttCompleted は復活したが、SpeechEnd 経由のフラッシュ経路には未対応。

### 証拠2: GTCRN パス空文字

**ソース**: `crates/voiput/src/binary/test-run.rs:323` 他

```rust
vad_model_paths(VadModelPaths {
    silero: model_path("silero_vad.onnx"),   // ✅ 設定あり
    ten: model_path("ten_vad.onnx"),          // ✅ 設定あり
    gtcrn: String::new(),                    // ❌ 空！
});
```

モデルファイルは実際に存在する:
```bash
-rw-r--r--  kawata  staff  535638  6月 11 15:25 models/gtcrn.onnx  ✅
```

### 証拠3: Denoiser 未適用の結果

- `build_streamer_config()` → `denoiser_model_path` が空文字
- `PseudoAsrStreamer::start()` → `!denoiser_model_path.is_empty()` が false → Denoiser 未初期化
- 全発話のノイズ除去なしで Whisper API へ送信 → 認識品質低下

## Test Plan

### ユニットテスト計画
- 修正1: リスナー内の純粋関数ロジック（SpeechEnd 時 SttCompleted 送信の確認）
- 修正2: テストなし（パス文字列の変更のみ）

### ユニットテスト不可能な項目
- Denoiser の実際のノイズ除去効果 — GTCRN モデルファイル + 実機が必要

### E2E / 手動テスト計画
1. `make run-openai KEY=sk-xxx` で起動
2. 発話後 Option ダブルタップで即時フラッシュされること（修正1）
3. 認識品質が改善されていること（修正2、ノイズ環境で特に）

## Boy Scout Rule — 翻訳可能性計画
- 修正1: SttCompleted 追加行に「SpeechEnd 時も is_stt_pending を解放するため」とコメント
- 修正2: 文字列リテラルから model_path() 関数呼び出しへの変更（一貫性向上）

## Acceptance Criteria
- [ ] SpeechEnd の buffered PartialResult フラッシュ後に SttCompleted が送信される
- [ ] GTCRN モデルパスが正しく設定され、Denoiser が初期化される
- [ ] 既存テスト全件がパスする
