---
ticket_id: 124
title: LocalRecognizerAdapter の音声パイプライン未配線バグ修正
slug: localrecognizeradapter-2
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0124-localrecognizeradapter-2/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0124-localrecognizeradapter-2/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0124-localrecognizeradapter-2/review.md
---
# LocalRecognizerAdapter の音声パイプライン未配線バグ修正

## Summary

`LocalRecognizerAdapter` に音声キャプチャ → VAD → ASR のパイプラインが実装されていないバグを修正する。併せて二重イベント問題も修正する。

## Background

`make run-local` で Qwen3-ASR を起動した際、以下の2つのバグが確認された：
1. 録音開始／停止イベントが二重に出力される
2. 音声認識が一切行われない（マイクからの音声が認識器に届いていない）

`make run-openai` では正常動作することから、Local バックエンドの配線のみに問題がある。

## Scope

### 実施すること

- `LocalRecognizerAdapter` に `PseudoAsrStreamer<Qwen3AsrBackend>` を追加し、音声キャプチャパイプラインを構築する（OpenAIRecognizer と同等の方式）
- `LocalRecognizerAdapter::start()` / `stop()` からの二重イベント送信を削除する
- 依存関係の追加が必要な場合は Cargo.toml を更新する

### 実施しないこと

- `LocalRecognizer` / `Qwen3AsrBackend` / `LocalAsrBackend` トレイト自体の変更
- OpenAIRecognizer や MacSpeechBackend の変更
- 新しい ASR バックエンドの追加
- テストコードの追加（ハードウェア依存のため手動テスト）

## Investigation

### 発見事実1: 二重イベント — SpeechRecognizer と Adapter の両方が Started/Stopped を送信

`SpeechRecognizer::start()`（`recognizer.rs:444`）は先に `SttEvent::Started` を送信してから、各エンジンの `start()` にディスパッチする：

```rust
// recognizer.rs:439-477
pub fn start(&mut self) {
    // ...
    let _ = self.tx.try_send(SttEvent::Started);   // ← SpeechRecognizer が送信
    match self.engine {
        SttEngine::Local { .. } => {
            if let Some(ref mut backend) = self.local_recognizer {
                backend.start();  // ← Adapter の start() がさらに Started を送信
            }
        }
    }
}
```

一方 `LocalRecognizerAdapter::start()`（`recognizer.rs:712`）も `SttEvent::Started` を送信している：

```rust
fn start(&mut self) {
    let _ = self.tx.try_send(SttEvent::Started);  // ← ここが二重送信の原因
}
```

同じ構造が `stop()` にも存在する。`SpeechRecognizer::stop()` 514行が Stopped を送信した後に、`LocalRecognizerAdapter::stop()` 717行でも送信する。

他のバックエンド（`OpenAIRecognizer::start()`、`MacSpeechBackend::start()`）は **Started/Stopped を一切送信しない**。これは SpeechRecognizer 側で一元送信する設計であり、Adapter 側で送るのは明らかな重複。

### 発見事実2: LocalRecognizerAdapter に音声パイプラインが存在しない

`LocalRecognizerAdapter` の構造体（`recognizer.rs:691-699`）:
```rust
struct LocalRecognizerAdapter {
    recognizer: LocalRecognizer,       // ← Qwen3AsrBackend（認識エンジン本体）
    tx: mpsc::Sender<SttEvent>,        // ← イベント送信チャネル
    locale: LocaleCode,                // ← ロケール
    // ★ PseudoAsrStreamer が存在しない ★
    // ★ VAD パイプラインが存在しない ★
    // ★ マイクキャプチャが存在しない ★
}
```

`start()` の実体（`recognizer.rs:712-714`）:
```rust
fn start(&mut self) {
    let _ = self.tx.try_send(SttEvent::Started);  // ← これだけ！
}
```

Started イベントを送るのみで、以下の処理が一切行われていない：
- `PseudoAsrStreamer` の構築・起動
- VAD パイプラインの初期化
- マイク音声キャプチャの開始
- 認識結果のポーリング

### 比較: OpenAIRecognizer は完全なパイプラインを持つ

`OpenAIRecognizer` の構造体（`backends/openai.rs:51-71`）:
```rust
pub struct OpenAIRecognizer {
    // ...
    streamer: Arc<Mutex<Option<PseudoAsrStreamer<OpenAIBackend>>>>,  // ← パイプラインを持つ
    streamer_rx: Option<mpsc::Receiver<StreamerEvent>>,
    // ...
}
```

`start()`（`backends/openai.rs:148-185`）の実装:
1. `is_running` を true にセット
2. `rebuild_streamer()` で **PseudoAsrStreamer を構築**（VAD 設定 → ストリーマー生成）
3. `s.start()` で **ストリーマーを起動**（別スレッドで VAD + ASR）
4. `platform_start_capture()` で **マイクキャプチャを開始**
5. `PseudoAsrStreamer` に音声データを送り込むバックグラウンドタスクを起動

この一連の流れにより「マイク → VAD区間検出 → ASR(OpenAI API) → イベント送信」が成立する。

### 比較: MacSpeechBackend も独自パイプラインを持つ

`MacSpeechBackend::start()`（`backends/mac.rs:346`）:
1. macOS ネイティブの音声認識（Tahoe/従来）を開始
2. `VadProcessor` を初期化
3. `start_native_audio_capture()` でマイクキャプチャ開始
4. バックグラウンドタスクで音声データを認識器に送る

### 結論: Qwen3AsrBackend は単体で動作可能だが、音声経路が欠落

`cargo test --test qwen3_asr_test -- --nocapture` では実音声認識が成功しており、`Qwen3AsrBackend` および `sherpa-onnx OfflineRecognizer` 自体は正常に動作する。
問題は **LocalRecognizerAdapter が OpenAIRecognizer のように PseudoAsrStreamer を内蔵しておらず、マイク音声を Qwen3AsrBackend に届ける経路が完全に欠落している** ことにある。

### 依存・関連チケット

- #115 `LocalRecognizerAdapter の実装`（reviewed） — 本バグの元になった初回実装。PseudoAsrStreamer 未統合のままマージされた。
- #49 `PseudoAsrStreamer + test-run.rs`（reviewed） — PseudoAsrStreamer 自体の実装。

## Test Plan

### 基本方針

修正内容は音声ハードウェア依存のパイプライン構築が中心であるため、自動テストではなく手動テストで検証する。

### ユニットテスト計画

- 既存の `cargo test --lib (voiput)` 160件が全て通過することを確認（回帰テスト）
- 既存の `cargo test --test qwen3_asr_test` 2件が全て通過することを確認（Qwen3AsrBackend 自体の動作）

### ユニットテスト不可能な項目（例外）

- `PseudoAsrStreamer` の構築・起動 — 実際のマイクハードウェアと VAD モデルが必要
- 音声キャプチャ→VAD→ASR のパイプライン結合 — 実機・実音声が必要
- これらの動作は手動テストで検証する

## Boy Scout Rule — 翻訳可能性計画

- `LocalRecognizerAdapter` は「アダプター」という名前に反してパイプライン構築の責務を持たせることになる。適切な責務粒度かどうか見直す
- OpenAIRecognizer が持つ `rebuild_streamer()` と同様の処理を LocalRecognizerAdapter に追加するが、共通化できる部分は抽出を検討する
- 新規コードは既存スタイル（snake_case、意味のある変数名）に従う

## Acceptance Criteria

- [ ] `make run-local` で音声認識が動作する（マイク発話 → テキスト認識）
- [ ] Started/Stopped が二重に出力されない
- [ ] `make run`（Os エンジン）の既存動作が維持される
- [ ] `make run-openai` の既存動作が維持される
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

- 計画: context/0124-localrecognizeradapter-2/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0124-localrecognizeradapter-2/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0124-localrecognizeradapter-2/review.md（未作成、/review-ticket 全チェック通過後に作成）
