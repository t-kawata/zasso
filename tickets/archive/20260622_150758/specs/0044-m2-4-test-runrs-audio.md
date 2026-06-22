---
ticket_id: 44
title: M2-4: 効果音再生 + test-run.rs [AUDIO]
slug: m2-4-test-runrs-audio
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0044-m2-4-test-runrs-audio/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0044-m2-4-test-runrs-audio/review.md
---
# M2-4: 効果音再生 + test-run.rs [AUDIO]

## Summary

MYCUTE の効果音再生システム（Actor パターン + rodio）を voiput `src/audio.rs` に移植する。
WAV ファイル（piro.wav / commit.wav）を同封し、test-run.rs に `[AUDIO]` セクションを追加する。
`cargo add rodio && cargo add lazy_static` で依存追加。

## Background

録音開始音（piro.wav）と確定音（commit.wav）を再生する。専用スレッド（Actor）で Audio OutputStream を保持し、Send/Sync 制約を回避する。擬似無音（PseudoSilence）をポストロールとして 500ms 流すことで OS のオーディオハードウェアサスペンドを防止する。

MYCUTE `~/shyme/mycute/src/tools/audio.rs`（217行）から完全移植。
WAV ファイルは `~/shyme/mycute/src/wav/` からコピー。

## Scope

### 0. 依存追加

```bash
cargo add rodio && cargo add lazy_static
```

### 1. WAV ファイル

`~/shyme/mycute/src/wav/piro.wav` と `~/shyme/mycute/src/wav/commit.wav` を `src/wav/` にコピー。

### 2. `src/audio.rs`

MYCUTE から完全移植（変更不要）:
- READY_WAV / COMMIT_WAV の include_bytes!
- AudioCommand enum（PlayReady / PlayCommit）
- PseudoSilence struct（rodio::Source impl: 極小振幅ノイズ）
- AudioHandle（専用スレッド Actor）
- `play_ready_sound()` / `play_commit_sound()` / `init()` — 公開API

### 3. `src/lib.rs`

- `mod audio;` のコメントアウト解除
- `pub use audio::{init, play_ready_sound, play_commit_sound};` 追加

### 4. `src/binary/test-run.rs`

- `test_audio()` 関数追加:
  1. `init()` の初期化確認
  2. `play_ready_sound()` → `play_commit_sound()` の呼び出し確認（実際の再生音は聞こえない可能性あり）
- Stage 5/6 維持

## Non-scope

- 実際のオーディオ再生テスト（ヘッドレス環境では不可）

## Investigation

### 証拠1: MYCUTE audio.rs

`~/shyme/mycute/src/tools/audio.rs`（217行）:
- READY_WAV / COMMIT_WAV: `include_bytes!("../wav/piro.wav")` 等
- PseudoSilence: rodio::Source impl, 疑似乱数 LCG で極小振幅ノイズ生成
- AudioHandle: `thread::Builder` + `mpsc::channel` で Actor 起動
- `run_audio_actor(rx)`: メッセージループ、Sink 管理
- `lazy_static!` でグローバル AUDIO_HANDLE 管理

### 証拠2: WAV ファイル

`~/shyme/mycute/src/wav/piro.wav`（12KB） / `commit.wav`（23KB）

### 証拠3: 依存関係

rodio と lazy_static はコメントアウト済み。

## Test Plan

### ユニットテスト計画（2テスト）

1. `init()` が2回呼ばれてもパニックしないこと
2. 初期化前の play_ready_sound / play_commit_sound がパニックしないこと

### ユニットテスト不可能な項目

- 実際の音声再生（ヘッドレス環境では確認不可）

## Boy Scout Rule

- MYCUTE から完全移植。変更不要
- 関数名: `init()` / `play_ready_sound()` / `play_commit_sound()` — 動詞句

## Acceptance Criteria

- [ ] `cargo add rodio && cargo add lazy_static` 成功
- [ ] `cargo test` 全72テスト PASS
- [ ] `cargo run --bin test-run` で `[AUDIO]` 表示

## Notes

- rodio はバックグラウンドスレッドで動作。test-run では実際の音声再生確認はできないが、初期化と関数呼び出しの成功は確認できる
- piro.wav と commit.wav は Git 管理対象（小さいバイナリ）

### 成果物

- 計画: context/0044-m2-4-audio/plan.md（未作成）
- 実装サマリ: context/0044-m2-4-audio/implementation.md（未作成）
- レビュー報告書: context/0044-m2-4-audio/review.md（未作成）
