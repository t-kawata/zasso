---
ticket_id: 127
title: PseudoAsrStreamer に事後補正専用バックエンド注入を追加
slug: pseudoasrstreamer
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/kawata/shyme/zasso/tickets/context/0127-pseudoasrstreamer/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0127-pseudoasrstreamer/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0127-pseudoasrstreamer/review.md
---
# PseudoAsrStreamer に事後補正専用バックエンド注入を追加

## Summary

`PseudoAsrStreamer` のコンストラクタに事後補正 (PostCorrection) 専用の `Arc<dyn PostCorrectionBackend>` を注入可能にし、Local（Qwen3-ASR）エンジンでも OpenAI API による事後補正を利用できるようにする。

## Background

OpenAIRecognizer は `PseudoAsrStreamer<OpenAIBackend>` を使用しており、`OpenAIBackend` が transcribe と post_correct の両方を OpenAI API で処理する。一方 LocalRecognizerAdapter は `PseudoAsrStreamer<LocalRecognizer>` を使用しており、事後補正は `LocalRecognizer→Qwen3AsrBackend::post_correct()` に委譲されるが、trate のデフォルト実装が `Ok(text.to_string())`（passthrough）を返すため、事後補正が機能しない。

## Scope

### 実施すること

- `PseudoAsrStreamer::new()` に `post_correct_backend: Option<Arc<dyn PostCorrectionBackend>>` を追加
- 指定された場合、事後補正処理でそちらを使用する（従来の BackendWrapper はフォールバック）
- `OpenAIRecognizer` の `new()` / `init_audio()` 呼び出しを新しいシグネチャに合わせる（None を渡して従来動作維持）
- `LocalRecognizerAdapter::new()` で `--openai-key` 相当の設定があれば事後補正用 OpenAI バックエンドを生成して渡す
- `test-run.rs` / `VoiputConfig` 経由で事後補正用 OpenAI 設定が Local エンジンでも有効になることを確認

### 実施しないこと

- OpenAIRecognizer の内部ロジック変更
- LocalRecognizerAdapter の既存パイプライン変更
- デコレーションなどの他の差異修正（#126 で完了）

## Investigation

### 証拠1: PseudoAsrStreamer::new() の現在のシグネチャ

`pipeline/streamer.rs:227`:
```rust
pub fn new(
    backend: B,
    tx: mpsc::Sender<StreamerEvent>,
    config: StreamerConfig,
) -> Result<Self> {
```

内部で `BackendWrapper(shared_backend.clone())` を作成し、これを事後補正用の `Arc<dyn PostCorrectionBackend>` として使用している。この backend は transcribe と post_correct の両方に使われる。

### 証拠2: PseudoAsrStreamer の事後補正呼び出し箇所

`pipeline/streamer.rs:403-404` — tick() 内の事後補正呼び出し:
```rust
let res = block_in_place(|| {
    Handle::current().block_on(async {
        match be.post_correct(&text_to_correct).await {
```
`be` は `PostCorrectionBackend` トレイトオブジェクト。ここに渡すインスタンスを差し替え可能にすればよい。

### 証拠3: `post_correct_backend` フィールドの追加位置

`pipeline/streamer.rs:201` 付近の構造体:
```rust
pub struct PseudoAsrStreamer<B: AsrBackend + Send + Sync + 'static> {
    backend: Arc<Mutex<B>>,
    post_correction_processor: PostCorrectionProcessor, // ← 内部で post_correct 使用
    // ...
}
```

`PostCorrectionProcessor` のコンストラクタに `Arc<dyn PostCorrectionBackend>` を渡している。この backend を注入可能にする。

### 証拠4: OpenAIRecognizer の呼び出し箇所

`backends/openai.rs:129`:
```rust
let streamer = PseudoAsrStreamer::new(oa_backend, tx_streamer, streamer_config)?;
```
ここに `None`（従来通り）を渡す。追加パラメータはデフォルト None にするか、全呼び出し箇所を修正する。

### 証拠5: LocalRecognizerAdapter の呼び出し箇所

`recognizer.rs:741`:
```rust
let streamer = PseudoAsrStreamer::new(recognizer, tx_streamer, streamer_config)?;
```
ここに事後補正用 OpenAI バックエンド（VoiputConfig の `post_correction_openai_config` から生成）を渡す。

### 依存・関連チケット

- #126 `LocalRecognizerAdapter にデコレーション・SttCompleted 等の不足機能を追加`（reviewed） — 本チケットの直前の共通化対応
- #124 `LocalRecognizerAdapter の音声パイプライン未配線バグ修正`（reviewed） — LocalRecognizerAdapter のベース実装

## Test Plan

### 基本方針

PseudoAsrStreamer のコンストラクタ変更のため、既存の全テストで回帰検証する。
事後補正の動作確認は手動テスト。

### ユニットテスト計画

- `cargo test --lib (voiput)` 160件全通過
- `cargo test --test qwen3_asr_test` 2件全通過
- `cargo test -p trate` 7件全通過

### 手動テスト

`make run-local KEY=sk-proj-xxx` で事後補正が適用されることを確認:
- `🔄 LLM 事後補正開始...` がログに表示されること
- 認識結果の末尾に `[OK]` プレフィックス（MockPostCorrectBackend の場合）が付くこと

### ユニットテスト不可能な項目（例外）

- 事後補正の実際の API 呼び出し — OpenAI API キーとネットワークが必要

## Boy Scout Rule — 翻訳可能性計画

- `PseudoAsrStreamer::new()` のパラメータが増えるため、各引数の役割をドキュメントコメントに明記する
- OpenAIRecognizer 側は `None` を渡すだけなのでコメントで意図を説明

## Acceptance Criteria

- [ ] `make run-local KEY=sk-xxx` で事後補正が機能する（`🔄 LLM 事後補正開始...` が表示される）
- [ ] `make run-openai KEY=sk-xxx` の既存動作が維持される（回帰なし）
- [ ] `cargo test --lib` 全件通過
- [ ] `make check-be` 成功

## Summary

<!-- このチケットで達成することの簡潔な説明 -->

## Background

<!-- なぜこのチケットが必要か -->

## Scope

<!-- 何をするか -->

## Non-scope

<!-- 何をしないか -->

## Investigation

<!--
憶測や論理的な推論だけでは不十分である。ソースコードの解析、grep、解析調査用テストコードの作成、テストの実行、ログの確認などを通じて**物理的な証拠**を見つけ出し、ここに記録すること。

記録すべき証拠の例：
- エラーメッセージ、スタックトレース、テスト失敗の再現手順
- grep や検索で見つけた関連コードの該当箇所（ファイル名・行番号）
- 実際に確認した動作や期待との乖離
- 検証済みの仮説と反証された仮説

記載された証拠は後日 /plan-ticket が正確な計画を立てるための唯一の材料となる。
-->

## Test Plan

<!--
★★★ 重要: テスト計画はユニットテストの網羅性を最優先する ★★★

**基本方針**: ユニットテストでカバーできる範囲は全てユニットテストで検証する。
ユニットテストのみで検証できない部分（外部サービス結合、ハードウェア依存等）に
限り、E2Eテストまたは手動テストを計画する。「ユニットテスト不可能な項目」として
理由を明記したものだけが例外として認められる。

### ユニットテスト計画

- どの関数／モジュールに対してテストを書くか
- 正常系・異常系・境界値の各ケース
- モック・スタブが必要な外部依存
- カバレッジ目標（目安: 80%以上、クリティカルパスは90%以上）

### ユニットテスト不可能な項目（例外）

ユニットテストでは検証不可能な項目のみを、理由とともに列挙する。
例：
- 理由1: 外部APIとの結合（モックでは再現不可能な挙動がある）
- 理由2: ハードウェア依存の処理（実機が必要）
-->

## Boy Scout Rule — 翻訳可能性計画

<!--
このチケットで触るコードに対して、以下の観点で「来たときよりも美しく（翻訳可能に）」する計画を書く:

- 関数名/変数名が散文として読めるか
- 責務が混在している関数は分割すべきか
- ハードコード値を定数化すべきか
- コメントが「なぜ」を説明しているか
-->

## Acceptance Criteria

- [ ] 実装要件を満たしている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0127-pseudoasrstreamer/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0127-pseudoasrstreamer/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0127-pseudoasrstreamer/review.md（未作成、/review-ticket 全チェック通過後に作成）
