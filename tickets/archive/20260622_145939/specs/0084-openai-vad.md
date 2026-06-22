---
ticket_id: 84
title: OpenAI モードのデコレーション誤作動修正とVADパラメータ調整
slug: openai-vad
status: reviewed
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: /Users/kawata/shyme/zasso/tickets/context/0084-openai-vad/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0084-openai-vad/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0084-openai-vad/review.md
---
# OpenAI モードのデコレーション誤作動修正とVADパラメータ調整

## Summary

チケット #83 で実装した OpenAI モードの音声認識パイプラインに以下の2つのバグがあり、デコレーションが正常に動作せず、音声認識品質が mycute 比で劣化している。

1. デコレーションタスクの `last_speech_end_time` が SpeechStart でクリアされず、第2発話以降のデコレーションが即座に ForceClearDecoration で強制終了される
2. VAD パラメータのデフォルト値が mycute の実績値と異なり、発話の先頭欠落と誤認識が増加する

本チケットではこれらの修正を行う。

## Background

`make run-openai` で起動し発話を行うと、以下の症状が確認されている:

**症状1**: 第1発話の認識は成功するが、第2発話以降でデコレーションが表示されない。ログに `⚠ デコレーション強制クリア` が表示される。

**症状2**: 発話の先頭部分が認識結果から欠落する（例：「お世話になります」→「世話になります」）。全体的に認識誤りが mycute より多い。

これらは #83 の実装に残ったバグであり、ユーザー体験を著しく損なっている。

## Scope

### 含むもの

#### 修正1: SpeechStart で last_speech_end_time をクリア
- **ファイル**: `crates/voiput/src/backends/openai.rs`
- **内容**: listener task の `StreamerEvent::SpeechStart` ハンドラで `*listener_speech_end_time.lock() = None;` を追加する
- **理由**: 前の発話の SpeechEnd で設定された `last_speech_end_time` が残っていると、新しい発話のデコレーションタスクの 750ms アノマリーチェックが誤発火する

#### 修正2: デコレーションタスクの abort 後に完了待ち
- **ファイル**: `crates/voiput/src/backends/openai.rs`
- **内容**: 旧デコレーションタスクの `task.abort()` の後に `let _ = task.await;` を追加する
- **理由**: abort が完了する前に新しいタスクが起動すると、session_counter による排他制御が機能せず競合が発生する

#### 修正3: VAD パラメータのデフォルト値を mycute 実績値に変更
- **ファイル**: `crates/voiput/src/types.rs`
- **内容**: `VadConfig::default()` の以下の値を変更:
  - `min_speech_duration`: 0.25 → **0.05**
  - `pre_padding_ms`: 100 → **200**
- **理由**: これらの値が mycute の実績値と異なり、発話の頭切れと認識品質劣化の原因となっている

### 依存関係

- **先行実装**: チケット #83（OpenAI モード ASR パイプライン実装）— 完了済み ✅
- 本チケットは #83 のバグ修正である

## Non-scope

- サンプルレート初期値の改善（`AtomicU32::new(0)` → 48000 は実害が極めて小さいため保留）
- デコレーション機能自体の設計変更
- mycute 以外の設定値の検討
- Windows プラットフォームでの動作確認

## Investigation

### 証拠1: last_speech_end_time 未クリア

**ソース**: `crates/voiput/src/backends/openai.rs` — listener task の SpeechStart ハンドラ（#83 実装）

第1発話の SpeechEnd で `last_speech_end_time` が設定される:
```
listener_speech_end_time.lock().insert(Instant::now());
```

第2発話の SpeechStart で mycute はこれを None にクリアするが、voiput ではクリアしていない。

**mycute の該当コード** (`~/shyme/mycute/src/stt/openai.rs:411-415`):
```rust
StreamerEvent::SpeechStart(_) => {
    // ...
    *last_speech_end_time.lock() = None;  // ← クリアしている
```

**voiput の該当コード** — SpeechStart ハンドラ内で `last_speech_end_time` をクリアしていない ← BUG

### 証拠2: デコレーションタスクの abort 非同期

voiput は旧デコレーションタスクの abort を fire-and-forget で行っている:
```rust
if let Some(task) = guard.take() {
    task.abort();  // .await で完了を待たない
}
```

mycute は完了を待つ:
```rust
if let Some(task) = guard.take() {
    task.abort();
    let _ = task.await;  // ← 完了待ち
}
```

### 証拠3: デコレーション誤作動のシーケンス

実際のコンソール出力:
```
📝 お世話になります、川田です。         ← 第1発話の認識結果
⏳ 認識中...                           ← 第2発話の SpeechStart → SttPending
⚠ デコレーション強制クリア               ← 750ms アノマリー誤発火
📝 お世話になります、川田です。GWの話を… ← 第2発話の認識結果（デコレーションなし）
```

第2発話でデコレーションが即座にクリアされ、発話中の視覚的フィードバックが失われている。

### 証拠4: VAD パラメータ差異

**ソース**: `crates/voiput/src/types.rs:175-188` (`VadConfig::default()`) と `~/shyme/mycute/src/mycute_settings.rs`

| パラメータ | voiput (default) | mycute (実績値) | 差異 |
|-----------|-----------------|----------------|------|
| `min_speech_duration` | **0.25** | **0.05** | 5倍 |
| `pre_padding_ms` | **100** | **200** | 半分 |

`min_speech_duration=0.25` だと、発話開始から VAD が発話と判定するまでに 0.25秒の連続音声が必要。短い発話や母音の立ち上がりが遅い発話では先頭が欠落する。

`pre_padding_ms=100` だと、発話開始前のバッファリングが不足し、発話区間の先頭音声がチャンクから欠落する。

### 証拠5: 影響経路

`build_streamer_config()` (`crates/voiput/src/backends/openai.rs:792-829`) は `config.vad.min_speech_duration` と `config.vad.pre_padding_ms` をそのまま StreamerConfig に渡す。配線自体は正しいため、デフォルト値の変更のみで改善する。

## Test Plan

### ユニットテスト計画

#### テスト1: VadConfig のデフォルト値が期待値と一致する
- **対象**: `VadConfig::default()`
- **正常系**: `min_speech_duration == 0.05` かつ `pre_padding_ms == 200`
- **場所**: `src/types.rs #[cfg(test)]`

#### テスト2: build_streamer_config の値伝搬
- **対象**: `build_streamer_config()` の出力
- **正常系**: StreamerConfig の `vad_min_speech_duration` と `vad_pre_padding_ms` が VoiputConfig からの値を正しく反映する
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト3: 既存テストの非影響確認
- **対象**: 全既存テスト
- **正常系**: #83 で追加した strip テスト含む全 170 テストがパスする

### ユニットテスト不可能な項目（例外）

- デコレーションの連続発話動作確認 — 実機マイクと VAD モデルが必要。手動テスト
- 発話先頭欠落の改善確認 — 実機と人間の発話が必要。手動テスト

### E2E / 手動テスト計画

1. `make run-openai KEY=sk-xxx` で起動 → 発話 → 発話 → と連続で発話
   - 各発話中に `💬 ...` / `💬 ?` のデコレーションが表示されること
   - `⚠ デコレーション強制クリア` が表示されないこと
2. 認識結果の先頭が欠落していないことを確認
3. `make test` で既存テスト全件パス

## Boy Scout Rule — 翻訳可能性計画

- `last_speech_end_time` のクリア処理は「新発話開始時に前発話の終了時刻をリセットする」と日本語に逐語訳可能な単位で記述する
- デコレーションタスクの abort + await の2行は「前のタスクを完全に停止してから新しいタスクを開始する」という1つの意図の塊として、コメントでその理由を説明する

## Acceptance Criteria

- [ ] SpeechStart で `last_speech_end_time` がクリアされ、連続発話でデコレーションが正常動作する
- [ ] デコレーションタスクの abort 完了待ちが追加され、タスク競合が解消される
- [ ] VAD パラメータが mycute 実績値（min_speech_duration=0.05, pre_padding_ms=200）に変更される
- [ ] 既存テスト全件がパスする
