---
ticket_id: 125
title: LocalRecognizerAdapter イベント中継の regression 修正
slug: localrecognizeradapter-regression
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0125-localrecognizeradapter-regression/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0125-localrecognizeradapter-regression/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0125-localrecognizeradapter-regression/review.md
---
# LocalRecognizerAdapter イベント中継の regression 修正

## Summary

チケット#124 の修正過程で混入した regression を修正する。イベント中継が機能せず、音声認識結果が一切 UI に届かない。

## Background

チケット#124 で LocalRecognizerAdapter の音声パイプラインを実装したが、その後の「モデル再読み込み防止」の修正で以下の症状が発生した：
- 録音開始・停止はできる
- 音声認識結果（PartialResult/FinalResult）が一切表示されない
- `make run-local` のログで `📝` が一度も出力されない

## Scope

### 実施すること

- `streamer_rx` を `Arc<Mutex<...>>` でラップし、start/stop サイクルを超えて生存させる
- イベント中継をバックグラウンドスレッド内で行う（`tick()` 経由ではない）
- `SpeechRecognizer::tick()` の Local ディスパッチを元の no-op に戻す
- 上記により、モデル再読み込み回避 + 正常認識 の両立を達成する

### 実施しないこと

- 既存の正常動作するバックエンド（OpenAI / macOS / Windows）への変更
- `PseudoAsrStreamer` 本体の変更
- 新規テストコードの追加（ハードウェア依存のため手動テスト）

## Investigation

### 証拠1: SpeechRecognizer::tick() はどこからも呼ばれていない

```
$ grep -rn 'recognizer\.tick' crates/voiput/ --include='*.rs'
（出力なし）
```

`SpeechRecognizer::tick()`（`recognizer.rs:627`）はコードベースのどこからも呼ばれていない。
OpenAIRecognizer / MacSpeechBackend はすべて独自のバックグラウンドタスクでイベント処理を行っており、
`tick()` に依存していない。チケット#124 の修正で `tick()` にイベント中継を委ねたことが直接の原因。

### 証拠2: イベント中継をスレッド外に移動したことで rx が誰も読まない状態になった

#124 最初の実装（正常動作）:
- スレッド内で `rx_streamer.try_recv()` → `SttEvent` 変換 → `tx.try_send()`
- `stop()` で `rx_streamer` がスレッド所有のままドロップ → 次回 `start()` で `rebuild_streamer()` 必要 → モデル再読み込み

#124 3回目の実装（regression、現在のコード）:
- `streamer_rx` をアダプターに保持
- スレッドは音声転送のみ
- `tick()` でイベント中継を期待 → しかし `tick()` が呼ばれない → 誰もイベントを読まない

### 証拠3: `tick()` 方式に依存している既存コードは一つもない

すべての既存バックエンドは start() 内で tokio::spawn または std::thread::spawn により
イベント処理のバックグラウンドタスクを起動している。tick() 方式に依存していない。

### 証拠4: ログの実動作パターン

実際の `make run-local` の出力:
```
🔴 録音中...          ← SpeechRecognizer::start() の Started イベント
🎤 録音準備完了       ← Ready イベント（250ms遅延）
[Capture] Stopped     ← ユーザーが停止操作
⏹ 録音停止            ← SpeechRecognizer::stop() の Stopped イベント
```

`📝` が一度も現れない = PartialResult イベントが一度も tx に送信されていないことを意味する。

### 結論

イベント中継はバックグラウンドスレッド内で行わなければならない。
`streamer_rx` を `Arc<Mutex<...>>` でラップしてアダプターとスレッド間で共有することで、
スレッド終了後も rx が生存し、次回 start で再利用可能になる。
これによりモデル再読み込み防止と正常認識を両立する。

### 依存・関連チケット

- #124 `LocalRecognizerAdapter の音声パイプライン未配線バグ修正`（reviewed） — 本 regression の原因となったチケット
- #115 `LocalRecognizerAdapter の実装`（reviewed） — Adapter の初回実装

## Test Plan

### 基本方針

ハードウェア依存のため自動テストではなく手動テストで検証する。

### ユニットテスト計画

- 既存の `cargo test --lib (voiput)` 160件全通過
- 既存の `cargo test --test qwen3_asr_test` 2件全通過

### 手動テスト

`make run-local` で以下のシーケンスを確認:
1. 発話 → `📝` 部分結果が表示されること
2. 無音 → `⏹ 録音停止` 後、再度発話 → 再び `📝` が表示されること（2サイクル目も正常動作）
3. モデル再読み込みが発生しないこと（2サイクル目が1サイクル目と同等の速度で開始されること）

## Boy Scout Rule — 翻訳可能性計画

- `streamer_rx` の寿命管理を明確にコメントに記述する（「start/stop サイクルを超えて生存」）
- `Arc<Mutex<...>>` の使用意図をコメントに残す

## Acceptance Criteria

- [ ] `make run-local` で発話が認識され `📝` が表示される
- [ ] 2回目の start/stop サイクルでも認識が動作する
- [ ] 2回目以降の start でモデル再読み込みが発生しない
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

- 計画: context/0125-localrecognizeradapter-regression/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0125-localrecognizeradapter-regression/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0125-localrecognizeradapter-regression/review.md（未作成、/review-ticket 全チェック通過後に作成）
