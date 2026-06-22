---
ticket_id: 126
title: LocalRecognizerAdapter にデコレーション・SttCompleted 等の不足機能を追加
slug: localrecognizeradapter-sttcompleted
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0126-localrecognizeradapter-sttcompleted/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0126-localrecognizeradapter-sttcompleted/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0126-localrecognizeradapter-sttcompleted/review.md
---
# LocalRecognizerAdapter にデコレーション・SttCompleted 等の不足機能を追加

## Summary

`LocalRecognizerAdapter` にデコレーションアニメーション、`SttPending`/`SttCompleted` 送信、発話中 PartialResult バッファリング、`strip_decoration_artifacts`、シーケンスカウンタ永続化の不足機能を追加し、`OpenAIRecognizer` と同等のイベント処理を実現する。

## Background

OpenAIRecognizer と LocalRecognizerAdapter は「音声認識処理の委譲先」以外は完全に共通であるべき。現在 LocalRecognizerAdapter には以下の機能が欠落しており、OpenAI エンジンと同等の UX を提供できない。

## Scope

### 実施すること

- デコレーションアニメーション（" ... " / "? " の巡回表示）を追加
- `SttPending` / `SttCompleted` イベント送信を追加
- `SpeechStart` / `SpeechEnd` イベントをハンドリング（デコレーション制御 / バッファフラッシュ）
- 発話中 PartialResult のバッファリング + SpeechEnd/FinalResult でフラッシュ
- `strip_decoration_artifacts()` を FinalResult に適用
- シーケンスカウンタを `Arc<AtomicU64>` にして start/stop を超えて継続
- `ForceClearDecoration` イベント送信を追加（異常時デコレーション強制クリア）

### 実施しないこと

- OpenAIRecognizer の変更
- PseudoAsrStreamer の変更
- 事後補正 (PostCorrection) 用バックエンドの分離（別チケット）

## Investigation

### 証拠: LocalRecognizerAdapter のイベント中継（現在）

`recognizer.rs:813-838` — 現在の match 式:
```rust
let stt_event = match event {
    StreamerEvent::SpeechStart(_) => None,              // ← 無視
    StreamerEvent::SpeechEnd(_) => None,                // ← 無視
    StreamerEvent::PartialResult(text) => {
        seq_counter += 1;
        Some(SttEvent::PartialResult(text, seq_counter))
    }
    StreamerEvent::FinalResult(text) => {
        seq_counter += 1;
        Some(SttEvent::FinalResult(text, seq_counter))
    }
    StreamerEvent::PostCorrectionStarted => Some(SttEvent::PostCorrectionStarted),
    StreamerEvent::PostCorrectionFinished => Some(SttEvent::PostCorrectionFinished),
};
```

### 証拠: OpenAIRecognizer のイベント中継（参照実装）

`backends/openai.rs:290-465` — 比較対象となる完全な実装:

```rust
// SpeechStart → デコレーション起動 + SttPending
StreamerEvent::SpeechStart(org_text) => {
    listener_is_decorating.store(true, Ordering::SeqCst);
    // 前回バッファクリア
    // デコレーションタスク起動（tokio::spawn）
    //   → " ... " / "? " を定期的に追加
    //   → 4重終了チェック（is_decorating, session, timeout, SpeechEnd時間）
    // PartialResult → バッファリング
    let _ = listener_tx.try_send(SttEvent::SttPending);
}

// SpeechEnd → デコレーション停止 + バッファフラッシュ + SttCompleted
StreamerEvent::SpeechEnd(org_text) => {
    listener_is_decorating.store(false, Ordering::SeqCst);
    // バッファフラッシュ
    // デコレーションタスク abort
    let _ = listener_tx.try_send(SttEvent::SttCompleted);
}

// PartialResult → デコレーション中はバッファ、非デコレーション中は直接送信
// いずれも SttCompleted 送付（is_stt_pending 解放のため）
StreamerEvent::PartialResult(text) => {
    if listener_is_decorating { バッファ } else { 直接送信 }
    let _ = listener_tx.try_send(SttEvent::SttCompleted);
}

// FinalResult → デコレーション停止 + strip + 送信 + SttCompleted
StreamerEvent::FinalResult(text) => {
    // デコレーション停止
    // バッファクリア
    // デコレーションタスク abort
    let cleaned = strip_decoration_artifacts(&text);
    let seq = listener_seq.fetch_add(1, Ordering::SeqCst);
    let _ = listener_tx.try_send(SttEvent::FinalResult(cleaned, seq));
    let _ = listener_tx.try_send(SttEvent::SttCompleted);
}
```

### 不足機能一覧

| # | 機能 | OpenAIRecognizer | LocalRecognizerAdapter | 実装規模 |
|---|------|-----------------|----------------------|---------|
| 1 | デコレーションアニメーション | ✅ SpeechStart 時に " ... " → "? " 巡回 | ❌ 未実装 | ~80行 |
| 2 | SttPending イベント | ✅ SpeechStart で送信 | ❌ 未送信 | +1行 |
| 3 | SttCompleted イベント | ✅ PartialResult/FinalResult/SpeechEnd で送信 | ❌ 未送信 | +4行 |
| 4 | 発話中 PartialResult バッファリング | ✅ デコレーション中はバッファ、SpeechEnd でフラッシュ | ❌ 未実装 | ~20行 |
| 5 | strip_decoration_artifacts | ✅ FinalResult に適用 | ❌ 未適用 | +1行 |
| 6 | シーケンスカウンタ永続化 | ✅ Arc\<AtomicU64\> | ❌ スレッドローカル変数 | 変更のみ |
| 7 | ForceClearDecoration | ✅ 異常時デコレーション強制クリア | ❌ 未実装 | ~5行 |

### 依存・関連チケット

- #124 `LocalRecognizerAdapter の音声パイプライン未配線バグ修正`（reviewed） — 本チケットのベース実装
- #125 `LocalRecognizerAdapter イベント中継の regression 修正`（reviewed） — 同上

## Test Plan

### 基本方針

ハードウェア依存のため手動テスト。回帰テストのみ自動実行。

### ユニットテスト計画

- `cargo test --lib (voiput)` 160件全通過
- `cargo test --test qwen3_asr_test` 2件全通過

### 手動テスト

`make run-local` で以下を目視確認:
1. 発話中に `💬` デコレーションアニメーションが表示されること
2. 発話終了でデコレーションが停止し認識結果が表示されること
3. 複数サイクルの start/stop でデコレーションが正常動作すること

### ユニットテスト不可能な項目（例外）

- デコレーションアニメーションの動作確認 — UI 出力のため自動テスト不可
- SttPending/SttCompleted の送信確認 — イベントチェーン全体の動作のため手動テスト

## Boy Scout Rule — 翻訳可能性計画

- デコレーションタスクのロジックは OpenAIRecognizer からコピーするが、コメントに「参照元」を明記する
- シーケンスカウンタやデコレーションフラグの役割をフィールドコメントに記述

## Acceptance Criteria

- [ ] `make run-local` で発話中に `💬` デコレーションが表示される
- [ ] `SttPending` / `SttCompleted` が適切に送信される（イベントチェーンが OpenAI と同等）
- [ ] 発話中の PartialResult がバッファリングされ SpeechEnd/FinalResult で正しくフラッシュされる
- [ ] FinalResult からデコレーションアーティファクトが除去される
- [ ] シーケンスカウンタが start/stop を超えて継続する
- [ ] `cargo test --lib` 全件通過（160 passed）
- [ ] `make check-be` 成功

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0126-localrecognizeradapter-sttcompleted/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0126-localrecognizeradapter-sttcompleted/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0126-localrecognizeradapter-sttcompleted/review.md（未作成、/review-ticket 全チェック通過後に作成）
