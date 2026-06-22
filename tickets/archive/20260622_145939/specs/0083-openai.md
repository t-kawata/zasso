---
ticket_id: 83
title: OpenAI モードの音声認識パイプライン実装と二重イベント修正
slug: openai
status: reviewed
created_at: 2026-06-15
updated_at: 2026-06-15
plan_path: /Users/kawata/shyme/zasso/tickets/context/0083-openai/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0083-openai/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0083-openai/review.md
---
# OpenAI モードの音声認識パイプライン実装と二重イベント修正

## Summary

`crates/voiput/src/backends/openai.rs` の `OpenAIRecognizer` は現在スタブであり、OpenAI Whisper API を用いた音声認識が一切動作しない。`make run-openai` で起動すると二重の Started/Stopped イベントが発行され、かつ音声認識が実行されない。

本チケットでは:
1. 二重イベント（Started/Stopped）の発行を解消する
2. `OpenAIRecognizer` に `PseudoAsrStreamer<OpenAIBackend>` を組み込み、ネイティブ音声キャプチャ → VAD → Whisper API → PostCorrection のパイプラインを完成させる
3. VAD 発話検出に連動したデコレーションアニメーション（`"... ?"`）を実装し、発話中に視覚的フィードバックを提供する

## Background

`make run-openai` で起動した際、Option/Alt ダブルタップで以下の症状が発生する:
- 「🔴 録音中...」が2回表示される
- 「⏹ 録音停止」が2回表示される
- OpenAI による音声認識が実行されない（文字起こし結果が一切出ない）

本バグにより OpenAI モードが事実上使用不能である。影響範囲は `crates/voiput` のみであり、OS ネイティブモード（`make run-os`）は正常動作する。

Windows/Mac の両プラットフォームに影響する（OpenAI モードのコードはプラットフォーム非依存 + プラットフォームキャプチャ呼び出しの組み合わせ）。

## Scope

### 含むもの

#### フェーズA: 二重イベント修正 + SpeechRecognizer の改善（`crates/voiput/src/recognizer.rs`）

- `OpenAIRecognizer::start()` から `SttEvent::Started` の発行を**削除**（`SpeechRecognizer::start()` 内の `tx` 経由だけに統一。`MacSpeechBackend`/`WinSpeechBackend` は Started を発行しないため、`SpeechRecognizer` 側を残さないと OS モードで Started が消失する）
- `OpenAIRecognizer::stop()` から `SttEvent::Stopped` の発行を**削除**（同上の理由）
- `SpeechRecognizer::stop()` でアクティブエンジンのみ停止する（全バックエンド一律呼び出しをやめる）

#### フェーズB: Voiput 構造体のフィールド拡張（`crates/voiput/src/voiput.rs`）

Voiput 構造体に mycute の `MycuteManager` 相当のフィールドを追加:

| 追加フィールド | 型 | mycute での役割 |
|---|---|---|
| `is_stt_pending` | `bool` | デコレーション/ASR処理中フラグ。SttPending で true, SttCompleted で false |
| `pending_flush` | `bool` | デコレーション中に BufferFlush が来た場合の延期フラグ |
| `last_stt_seq` | `u64` | 最後に処理したシーケンス番号（古いイベントの棄却用、**任意** — 消費者の責任に委ねてもよい） |

**hotkey Start 時の状態リセット追加**: `process_hotkey_action` の Start 分岐に `flush_tx = None` リセットを追加する。現在は `buffer.clear()` と `current_text.clear()` のみ行っているが、前回の `request_flush()` から残留した stale な `flush_tx` が新セッションで誤発火する可能性がある。

#### フェーズC: next_event() のイベントハンドリング拡張（`crates/voiput/src/voiput.rs`）

現在の next_event() は5 variant のみ処理。mycute のイベントブリッジ相当の処理を追加:

| SttEvent variant | 現在の処理 | 追加する処理 |
|---|---|---|
| `SttPending` | なし（`_ => {}`） | `is_stt_pending = true`, `pending_flush = false`（前回の未消費 pending_flush をリセット） |
| `SttCompleted` | `try_send_flush_text()` のみ | `is_stt_pending = false`, `pending_flush` が true なら flush 実行（後述の遅延フラッシュ機構） |
| `DecorationPartial` | なし（`_ => {}`） | なし（`current_text` / `buffer` に書き込まない。素通しで呼び出し元に届く） |
| `ForceClearDecoration` | なし（`_ => {}`） | `is_stt_pending = false`（緊急復帰） |
| `PostCorrectionFinished` | `try_send_flush_text()` のみ | `is_post_correcting = false`, `pending_flush` が true なら flush 実行 |
| `Started` | なし | なし（呼び出し元に委ねる） |
| `Stopped` | `try_send_flush_text()` | 同じ |
| `PartialResult` | `current_text` 更新 + `try_send_flush_text()` | 同じ |
| `FinalResult` | `buffer` + `current_text` 更新 + `try_send_flush_text()` | 同じ |

#### フェーズD: BufferFlush 遅延フラッシュ機構（`crates/voiput/src/voiput.rs`）

mycute ではデコレーション中または PostCorrection 中に BufferFlush が来ると即時実行せず `pending_flush = true` を設定し、`SttCompleted` または `PostCorrectionFinished` 到着時に遅延実行する。

`process_hotkey_action` の BufferFlush 分岐を以下のように変更:
1. `is_stt_pending || is_post_correcting` なら `pending_flush = true` を設定して return（即時 flush しない）
2. それ以外なら現行通り build_flush_text → paste → stop → clear

`try_send_flush_text()` に `pending_flush` の実行パスを追加:
- SttCompleted 到着時: `pending_flush` が true なら `build_flush_text()` → paste → `stop()` → state clear → commit sound → `Flushed` イベント発行
- PostCorrectionFinished 到着時: 同上

#### フェーズE: OpenAIRecognizer へのデコレーション機構追加（`crates/voiput/src/backends/openai.rs`）

mycute の `OpenAIRecognizer` が持つ全フィールドとロジックを移植。

**注意**: `init_audio()` 内で `PseudoAsrStreamer` を構築する際、`StreamerConfig` は `VoiputConfig` の以下のフィールドから組み立てる:
- `vad_model_paths` + `model_dir` → `StreamerConfig.vad_model_path`（`build_vad_processor_config()` と同様の解決）
- `vad_model_paths.gtcrn` + `model_dir` → `StreamerConfig.denoiser_model_path`（同上のパターン。VoiputConfig に直接のフィールドはなく `vad_model_paths.gtcrn` から導出する）
- `vad.*` → `StreamerConfig.vad_*` 全フィールド
- `denoiser.*` → `StreamerConfig.use_denoiser`
- `signal_filter.*` → `StreamerConfig.signal_*`
- `post_correction.*` → `StreamerConfig.post_correction_*`
- `locale` → `StreamerConfig.locale`

**もう1点**: `SpeechRecognizer::new()` (`recognizer.rs:280-293`) は現在 `OpenAIRecognizer` に**空のダミー `VoiputConfig`** を渡している。実装時には `config`（実 config）を直接渡すよう変更する。

**`SttEvent::Ready` の送信**: mycute の OpenAIRecognizer は `start()` 内でネイティブキャプチャ開始後、`OPENAI_READY_DELAY_MS` (250ms) の遅延後に `SttEvent::Ready` を送信する。voiput も同様に実装する。

**追加フィールド:**
| フィールド | 型 | 役割 |
|---|---|---|
| `is_decorating` | `Arc<AtomicBool>` | デコレーション中フラグ |
| `session_counter` | `Arc<AtomicU64>` | デコレーションタスク無効化用カウンタ |
| `partial_result_buffer` | `Arc<Mutex<Option<String>>>` | 発話中の ASR 結果バッファ（デコレーションに上書きされない） |
| `decoration_task` | `Arc<Mutex<Option<JoinHandle<()>>>>` | デコレーションアニメーションのタスクハンドル |
| `last_speech_end_time` | `Arc<Mutex<Option<Instant>>>` | SpeechEnd 時刻（アノマリー検出用） |
| `event_rx` | `Arc<Mutex<Option<mpsc::Receiver<StreamerEvent>>>>` | PseudoAsrStreamer からのイベント受信チャネル |
| `streamer` | `Option<PseudoAsrStreamer<OpenAIBackend>>` | ASR パイプライン本体 |
| `audio_buf` | `Arc<Mutex<Vec<f32>>>` | キャプチャ → ticker 間の共有バッファ |
| `sample_rate` | `Arc<AtomicU32>` | 現在のサンプリングレート |
| `capture_rx` | `Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>>` | ネイティブキャプチャの受信チャネル |
| `ticker_task` | `Option<JoinHandle<()>>` | 20ms ticker タスク |
| `capture_task` | `Option<JoinHandle<()>>` | キャプチャ読み取りタスク |
| `listener_task` | `Option<JoinHandle<()>>` | イベントリスナータスク |

**init_audio() の実装:**
- `OpenAIBackend::new()` で AsrBackend 作成
- `PseudoAsrStreamer::new(backend, tx, config)` で streamer 構築
- `PostCorrectionProcessor` の設定

**start() の実装（mycute openai.rs:370-770 相当）:**
1. `streamer.start()` — VAD モデル初期化
2. `start_native_audio_capture()` — マイクキャプチャ開始
3. `OPENAI_READY_DELAY_MS` (250ms) の遅延後に `SttEvent::Ready` を送信（mycute openai.rs:719 と同様。ワイヤレスヘッドセットのスリープ復帰待ち）
4. 3つの tokio タスクを spawn:
   - **キャプチャ読み取りタスク**: `capture_rx` から音声データを受け取り `audio_buf` に蓄積
   - **Ticker タスク (20ms)**: `audio_buf` を drain → `streamer.push_samples()` → `streamer.tick()` を繰り返す
   - **イベントリスナータスク**: `StreamerEvent` → `SttEvent` 変換 + デコレーション管理

**イベントリスナータスクの内部ロジック（mycute openai.rs:407-640 相当）:**

```
StreamerEvent::SpeechStart(org_text) → {
    is_decorating = true
    session_counter++
    デコレーションタスク起動（180ms トグル）
    SttEvent::SttPending 送信
}

StreamerEvent::SpeechEnd(_) → {
    is_decorating = false
    session_counter++
    partial_result_buffer → SttEvent::PartialResult としてフラッシュ
    デコレーションタスク abort
}

StreamerEvent::PartialResult(text) → {
    if is_decorating なら partial_result_buffer に保存（上書き）
    else → SttEvent::PartialResult(seq) + SttEvent::SttCompleted 送信
}

StreamerEvent::FinalResult(text) → {
    is_decorating = false
    session_counter++
    partial_result_buffer クリア
    デコレーションタスク abort
    cleaned = text.replace(" … ?", "").replace(" … ", "")  // アーティファクト除去
    SttEvent::FinalResult(cleaned, seq) + SttEvent::SttCompleted 送信
}
```

**デコレーションタスク内部（180ms ループ, 4重終了チェック）:**
1. `is_decorating` が false → break
2. `session_counter` が変化 → break
3. タイムアウト（`vad_max_speech_duration + 5s`）→ break
4. SpeechEnd から 750ms 経過 → ForceClearDecoration + SttCompleted（異常復帰）

**stop() の実装:**
- `is_running = false`, `is_decorating = false`, `session_counter++`
- キャプチャタスク / ticker タスク / リスナータスク / デコレーションタスク の abort
- `stop_native_audio_capture()`
- `PostCorrectionProcessor.reset()`

#### フェーズF: シーケンス番号管理（`crates/voiput/src/backends/openai.rs`）

- `OpenAIRecognizer.sequence_counter` を各 `PartialResult`/`FinalResult` 送信時に `fetch_add(1, Ordering::SeqCst)` で increment する（現在は `#[allow(dead_code)]` のまま使用されていない）
- シーケンス番号は各イベントの `seq: u64` として SttEvent に付与され、消費者（zasso）側で古いイベントの棄却や順序追跡に使用可能
- Voiput 構造体自体に `last_stt_seq` を持たせるかどうかは**任意**（消費者に委ねる）。ただし spec のフェーズB では Voiput にフィールド追加候補として記載するが、必須ではない

#### フェーズG: 定数追加（`crates/voiput/src/constants.rs`）

- `STT_DECORATION_INTERVAL_MS: u64 = 180` — デコレーションアニメーション間隔

#### フェーズH: test-run.rs の拡張（`crates/voiput/src/binary/test-run.rs`）

- `SttPending` / `SttCompleted` / `DecorationPartial` / `ForceClearDecoration` の簡易表示をイベントループに追加
- `is_stt_pending` フラグに応じた表示

### 参考実装

`~/shyme/mycute/src/stt/openai.rs` に動作する実装がある。特に以下を参考にする:
- `init_audio()` の PseudoAsrStreamer 構築 (mycute openai.rs:291)
- `start()` の3タスク起動 (mycute openai.rs:370-770)
- イベントリスナーの StreamerEvent → SttEvent 変換 (mycute openai.rs:407-500)

## Non-scope

- OS ネイティブモード（`MacSpeechBackend` / `WinSpeechBackend`）の修正は一切含まない
- OS ネイティブモードへのデコレーション導入は含まない（本チケットでは OpenAI モードのみ）
- Windows プラットフォームでの動作確認は含まない（macOS で検証し、Windows はコンパイルチェックのみ）
- `SpeechDenoiser` の組み込みは含まない（後続チケットで対応）
- `PseudoAsrStreamer` 自体の修正は含まない（既存コードをそのまま利用）
- UI 側のデコレーション表示（test-run.rs および Quasar フロントエンド）の更新は含まない。本チケットではイベント発行まで。ただし test-run.rs の `SttEvent` ハンドラに `SttPending` / `SttCompleted` / `DecorationPartial` の簡易表示は追加する
- `SttEvent::Flushed(String)` は voiput 独自 variant（mycute には存在しない）。フラッシュテキストを SttEvent として明示通知するための追加。zasso 側のイベントループでハンドリング可能。mycute 互換が必要な場合は、呼び出し元で `SttEvent::Flushed` を処理するか無視するかを選択可能

## Investigation

### 証拠1: Started/Stopped の二重発行

**ソース: `crates/voiput/src/recognizer.rs:366-421` + `crates/voiput/src/backends/openai.rs:179-186`**

`SpeechRecognizer::start()` は直接 `tx.try_send(SttEvent::Started)` (371行目) を呼び、その直後に `openai_recognizer.start()` を呼ぶ。`OpenAIRecognizer::start()` は内部で `tx_internal.try_send(SttEvent::Started)` を送信し、インターセプター経由で再度アプリに届く。合計2回。

**注意**: `MacSpeechBackend::start()` は Started を発行しない。OS モードの Started は `SpeechRecognizer::start()` が唯一の発行元である。したがって修正は `OpenAIRecognizer` 側の Started を削除する方向で行う（`SpeechRecognizer` 側は維持）。

同様に `Stopped` も:
- `recognizer.rs:420`: `tx.try_send(SttEvent::Stopped)`
- `openai.rs:185`: `tx_internal.try_send(SttEvent::Stopped)` → インターセプター経由

こちらも `OpenAIRecognizer` 側の Stopped を削除する。

### 証拠2: OpenAIRecognizer がスタブ

**ソース: `crates/voiput/src/backends/openai.rs:148-197`**

```
pub fn init_audio(&mut self) -> Result<()> {
    // 音声キャプチャの初期化（後続実装で拡張）
    Ok(())
}
pub fn start(&mut self) {
    self.is_running.store(true, Ordering::SeqCst);
    let _ = self.tx.try_send(SttEvent::Started);
}
pub fn stop(&mut self) {
    self.is_running.store(false, Ordering::SeqCst);
    let _ = self.tx.try_send(SttEvent::Stopped);
}
pub fn tick(&mut self) {}
```

`init_audio()` は `PseudoAsrStreamer` の作成を行っていない。
`start()` はネイティブ音声キャプチャを起動していない。
`tick()` は何もしない（本来 VAD + ASR パイプラインを駆動すべき）。

### 証拠3: 必要な部品はすべて存在する

`crates/voiput/src/` 以下に必要な全コンポーネントが揃っている:

| コンポーネント | ファイル | 状態 |
|---------------|---------|------|
| `OpenAIBackend` (AsrBackend impl) | `backends/openai.rs:31-143` | ✅ 実装済み |
| `PseudoAsrStreamer<B>` | `pipeline/streamer.rs` | ✅ 実装済み |
| `AsrBackend` trait | `pipeline/streamer.rs` | ✅ 実装済み |
| `start_native_audio_capture()` (macOS) | `backends/mac.rs:157-187` | ✅ 実装済み |
| `stop_native_audio_capture()` (macOS) | `backends/mac.rs:178-187` | ✅ 実装済み |
| `start_native_audio_capture()` (Windows) | `backends/win.rs:133-163` | ✅ 実装済み（コンパイルのみ確認） |
| `VadProcessor` | `pipeline/vad.rs` | ✅ 実装済み |
| `SincResampler` | `pipeline/resampler.rs` | ✅ 実装済み |
| `PostCorrectionProcessor` | `pipeline/post_correct.rs` | ✅ 実装済み |
| `SignalFilter` | `pipeline/signal_filter.rs` | ✅ 実装済み |

### 証拠4: mycute に動作する実装がある

`~/shyme/mycute/src/stt/openai.rs` に以下の完全な実装が存在する:
- `init_audio()`: PseudoAsrStreamer 構築 (291行目)
- `start()`: 3つの tokio タスクを起動 (370-770行目)
- イベントリスナー: StreamerEvent を SttEvent に変換 (407-500行目)

### 証拠5: 二重発行の影響

test-run.rs:233 で `SttEvent::Started` 受信時に「🔴 録音中...」を出力、237行目で `SttEvent::Stopped` 受信時に「⏹ 録音停止」を出力。どちらも2回受信するため2回表示される。

### 証拠6: mycute のデコレーションシステム（発話中アニメーション）

mycute では VAD 発話検出に連動したデコレーションアニメーションが実装されている。

**ソース: `~/shyme/mycute/src/stt/openai.rs:410-640`**

VAD が発話開始を検出すると `PseudoAsrStreamer` が `StreamerEvent::SpeechStart(org_text)` を発行する。OpenAIRecognizer のイベントリスナータスクがこれを受けて:

1. `SttEvent::SttPending` を送信（UI に「認識中」状態を通知）
2. 180ms 間隔で `" ... "` / `"?"` をトグルするデコレーションタスクを起動
3. トグル文字列を `base_text` に連結して `SttEvent::DecorationPartial(text)` として送信

発話中の `PartialResult` は `partial_result_buffer` にバッファリングされ、`SpeechEnd` 到着後にフラッシュされる。

`FinalResult` 受信時はテキストからデコレーションアーティファクト (`" … ?"`, `" … "`) を削除してから送信する。

**アノマリー検出**: SpeechEnd から 750ms 経過してもデコレーションが継続している場合は異常状態と判断し、`ForceClearDecoration` + `SttCompleted` を送信して強制復帰する。

**必要となる SttEvent variant**:
- `SttPending` — STT 処理中（デコレーション開始）
- `SttCompleted` — 発話単位の処理完了
- `DecorationPartial(String)` — デコレーション文字列
- `ForceClearDecoration` — デコレーション強制解除

### 証拠7: 全ギャップ分析 — mycute vs voiput 包括比較

以下の全 BLOCKER ギャップを確認した:

| # | ギャップ | 該当ファイル | 重要度 |
|---|---------|-------------|--------|
| 1 | `pending_flush` フィールドが Voiput にない | `voiput.rs:54-80` | BLOCKER |
| 2 | `is_stt_pending` フィールドがない | `voiput.rs:54-80` | BLOCKER |
| 3 | `SttPending` / `SttCompleted` のハンドリングがない | `voiput.rs:200-232` | BLOCKER |
| 4 | `DecorationPartial` のハンドリングがない（素通しは正しいが pending_flush 連動が必要） | `voiput.rs:200-232` | BLOCKER |
| 5 | `PostCorrectionFinished` に pending_flush 実行パスがない | `voiput.rs:200-232` | BLOCKER |
| 6 | `SttCompleted` に pending_flush 実行パスがない | `voiput.rs:200-232` | BLOCKER |
| 7 | BufferFlush に `is_stt_pending` 遅延チェックがない | `voiput.rs:330-349` | BLOCKER |
| 8 | hotkey Start 時に `flush_tx = None` リセットがない（古い request_flush の残留） | `voiput.rs:313-329` | BLOCKER |
| 9 | OpenAIRecognizer が完全なスタブ（デコレーション/イベントリスナー/ticker/キャプチャの全欠） | `backends/openai.rs:148-197` | BLOCKER |
| 10 | シーケンス番号が使われていない（sequence_counter 宣言のみ） | `backends/openai.rs:155` | BLOCKER |
| 11 | デコレーションアーティファクト除去がない | `backends/openai.rs` | BLOCKER |
| 12 | `is_decorating`, `session_counter`, `partial_result_buffer`, `decoration_task` フィールドがすべて欠落 | `backends/openai.rs:148-197` | BLOCKER |
| 13 | `STT_DECORATION_INTERVAL_MS` 定数がない | `constants.rs` | BLOCKER |

MAJOR ギャップ:
| # | ギャップ | 該当ファイル | 重要度 |
|---|---------|-------------|--------|
| 1 | `last_stt_seq` が Voiput にない（消費者が任意で使用。必須ではない） | `voiput.rs:54-80` | MAJOR |

**補足**: `Error` / `Ready` / `Started` のハンドリングは SttEvent が素通しで呼び出し元に届くため、voiput crate として**ギャップではない**。これらのイベントに対する処理（サウンド再生、オーバーレイ更新等）は zasso 側の責務である。

**voiput 独自の差分**: `SttEvent::Flushed(String)` は voiput 独自の variant（mycute にはない）。フラッシュテキストを SttEvent として明示的に通知するための追加であり、zasso 側でハンドリング可能。 |

`build_flush_text()` は voiput の方が `ends_with` チェック追加で mycute より優れている（重複出力防止の追加防衛線）。

## Test Plan

### ユニットテスト計画

#### テスト1: OpenAIRecognizer の init_audio がエラーなく完了する
- **対象**: `OpenAIRecognizer::init_audio()`
- **正常系**: 妥当な設定で呼び出した場合、Ok(()) を返す
- **異常系**: VAD モデルパスが存在しない場合、エラーを返す
- **成果物**: `#[cfg(test)]` モジュール内のテストとして `src/backends/openai.rs` に追加

#### テスト2: OpenAIRecognizer の start → stop ライフサイクル
- **対象**: `OpenAIRecognizer::start()` / `stop()`
- **正常系**: start 後に is_running が true、stop 後に false になる
- **異常系**: 二重 start が無視される / 二重 stop が無視される
- **成果物**: `src/backends/openai.rs` に追加

#### テスト3: StreamerEvent → SttEvent 変換の正しさ
- **対象**: 新規の変換関数 (event_listener task のコアロジック)
- **正常系**: SpeechStart, SpeechEnd, PartialResult, FinalResult など各 variant が正しく SttEvent に変換される
- **境界値**: 空テキストの PartialResult
- **成果物**: 変換関数を純粋関数として抽出しテスト可能にする

#### テスト4: PseudoAsrStreamer と OpenAIBackend の結合試験
- **対象**: `PseudoAsrStreamer<OpenAIBackend>` の作成と開始
- **正常系**: New → start → stop がエラーなく完了する
- **異常系**: 不正な VAD モデルパスで new がエラーを返す
- **成果物**: `test-streamer` テスト関数と統合

#### テスト5: 二重イベント修正の確認
- **対象**: `SpeechRecognizer::start()` / `stop()` のイベント発行数
- **正常系**: start() 呼び出し後に Rx が受信する Started は1件のみ
- **正常系**: stop() 呼び出し後に Rx が受信する Stopped は1件のみ
- **成果物**: `src/recognizer.rs` のテストモジュールに追加

#### テスト6: デコレーションイベント変換の正しさ
- **対象**: 新規のイベントリスナー関数（StreamerEvent → SttEvent 変換）
- **正常系**: SpeechStart 受信時に `SttPending` + デコレーションタスク起動
- **正常系**: SpeechEnd 受信時にバッファリングされた PartialResult がフラッシュされる
- **正常系**: FinalResult 受信時にアーティファクト `" ... "` が除去される
- **異常系**: SpeechEnd なしで FinalResult が来た場合も正常に終了する
- **境界値**: 空テキストの PartialResult が decoration 中に届いた場合
- **成果物**: イベントリスナーコアロジックを純粋関数として抽出しテスト可能にする

#### テスト7: BufferFlush 遅延フラッシュ機構
- **対象**: `Voiput::process_hotkey_action()` BufferFlush + `next_event()` SttCompleted 処理
- **正常系**: `is_stt_pending=true` 状態で BufferFlush → `pending_flush=true` に設定され、即時 flush されない
- **正常系**: `pending_flush=true` 状態で SttCompleted 到着 → flush が実行される
- **正常系**: `is_post_correcting=true` 状態で BufferFlush → `pending_flush=true`
- **正常系**: `pending_flush=true` 状態で PostCorrectionFinished 到着 → flush が実行される
- **異常系**: 録音未開始の BufferFlush → 無視される（既存動作）
- **成果物**: `src/voiput.rs` のテストモジュールに追加

#### テスト8: Voiput 構造体の状態遷移
- **対象**: `Voiput` の `is_stt_pending`, `pending_flush`, `is_post_correcting` フィールド
- **正常系**: start → SttPending 到着 → `is_stt_pending = true`
- **正常系**: SttCompleted 到着 → `is_stt_pending = false`
- **正常系**: SttPending 到着時に古い `pending_flush` がリセットされる
- **正常系**: ForceClearDecoration 到着 → `is_stt_pending = false`
- **異常系**: 二重 SttPending → フラグは true のまま
- **成果物**: `src/voiput.rs` のテストモジュールに追加

#### テスト9: シーケンス番号管理
- **対象**: `OpenAIRecognizer.sequence_counter` の increment 動作
- **正常系**: start → stop 後もカウンタが 0 から再開されない（単調増加）
- **正常系**: 各 SttEvent 発行時にカウンタが increment される
- **成果物**: `src/backends/openai.rs` のテストモジュールに追加

#### テスト10: デコレーション漏洩防止の全11バリア（統合テスト）
- **対象**: イベントリスナー関数 + decoration_strip_artifacts 純粋関数
- **正常系**: `"hello ... ?"` → `strip_artifacts()` → `"hello"`
- **正常系**: `"hello ... "` → `strip_artifacts()` → `"hello"`
- **正常系**: `"hello"` → `strip_artifacts()` → `"hello"`（変更なし）
- **正常系**: 空文字 → `strip_artifacts()` → `""`
- **境界値**: `" ... ?"` のみ → `strip_artifacts()` → `""`
- **成果物**: 純粋関数 `strip_decoration_artifacts(text: &str) -> String` を抽出し単体テスト

### ユニットテスト不可能な項目（例外）

- 理由1: **外部 API 結合（OpenAI Whisper API）** — `OpenAIBackend::call_transcribe()` の実際の HTTP 通信はユニットテスト不可。`test_openai()` 関数（test-run.rs）は CI ではスキップされ、開発者の明示的な実行時のみ動作確認する。
- 理由2: **ハードウェア依存（ネイティブ音声キャプチャ）** — `start_native_audio_capture()` / `stop_native_audio_capture()` は実機マイクと OS 権限が必要。UI テストまたは手動テストでのみ検証可能。
- 理由3: **VAD モデルファイルの依存** — テストには `models/` ディレクトリの ONNX モデルが必要。存在しない場合は該当テストをスキップする（test-run.rs の test_vad() と同様のパターン）。

### E2E / 手動テスト計画

1. **基本フロー**: `make run-openai KEY=sk-xxx` で起動し、Option ダブルタップで録音開始 → 発話 → ダブルタップでフラッシュ
   - 「🔴 録音中...」が1回だけ表示されること
   - 発話中に `"... ?"` デコレーションアニメーションが表示されること
   - 発話後、Whisper API の認識結果が表示されること
   - 「⏹ 録音停止」または「📋 Flushed」が表示されること（2回表示されないこと）
   - フラッシュされたテキストにデコレーションアーティファクト（`" ... "` や `"?"`）が含まれないこと

2. **BufferFlush 遅延フラッシュ**: 発話中（デコレーション中）に Option ダブルタップ → 発話完了後に自動フラッシュされること

3. **Ctrl+Option (OrchestratorInput)**: 発話中に Ctrl+Option → 停止 + `request_flush()` が正しく動作し、結果にデコレーションが含まれないこと

4. **空の状態でフラッシュ**: 録音開始 → 即座にフラッシュ → クラッシュしないこと

5. **長時間発話（30秒超）**: VAD タイムアウト後も正常動作すること

6. **PostCorrection 中の BufferFlush**: LLM 事後補正中に Option ダブルタップ → `pending_flush = true` に設定され、補正完了後に自動フラッシュされること

7. **連続発話**: 発話 → フラッシュ → 再度発話 → フラッシュ のサイクルが問題なく動作すること。前回の `pending_flush` が次のセッションに持ち越されないこと

## Boy Scout Rule — 翻訳可能性計画

### 関数名の改善

- `OpenAIRecognizer::tick()`: 現在 no-op。実装後は「バックグラウンド ticker タスクが処理するため本メソッドは no-op」とコメントで明記。ただし本メソッド自体は `SpeechRecognizer::tick()` からのインタフェースなので削除しない。
- 新規追加タスク駆動関数群（`start_capture_task()`, `start_ticker_task()`, `start_listener_task()` など）は処理内容を関数名から読み取れるように命名する。

### 翻訳可能性の確保

- 新規実装する各メソッドは «capture task を開始する» «ticker task を起動する» のように日本語に逐語訳可能な単位で関数抽出する
- タスク内のループ処理は責務ごとに関数化し、一関数一責務を徹底する
- マジックナンバー（20ms tick 周期、180ms デコレーション間隔、750ms アノマリー検出閾値等）は `constants.rs` に定数化する

### デコレーション関連

- デコレーションタスクのトグルパターン `[" ... ", "?"]` は定数として定義する
- `STT_DECORATION_INTERVAL_MS` を `constants.rs` に追加する（mycute の `constants.rs:103` と値は180msで統一）
- デコレーションアーティファクト除去用のパターン文字列も定数化する

### 既存コードの改善

- `SpeechRecognizer::stop()` (recognizer.rs:408-416) がアクティブエンジンのみ停止するように変更する（現在は全バックエンドを一律で停止している）
- この修正で非アクティブバックエンドに余計な `stop()` が呼ばれなくなる（実害はないが設計として適切でない）。

### 状態管理の翻訳可能性

- `is_stt_pending`, `pending_flush`, `is_post_correcting` の3フラグは「STT 処理中」「フラッシュ延期」「補正中」というドメイン状態を表現する。各フラグのセット/クリア条件と、フラグ間の相互作用をコメントに明記する。
- `try_send_flush_text()` 内の `pending_flush` 実行パスは、呼び出し元のイベント種別ごとに分岐条件を関数名で区別できるようにする（`execute_pending_flush_if_needed()` など）。
- 遅延フラッシュ機構全体は「BufferFlush が is_stt_pending 中に来た場合は延期し、SttCompleted/PostCorrectionFinished 到着時に自動実行する」と日本語で逐語訳可能な流れになるよう設計する。

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0083-openai/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0083-openai/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0083-openai/review.md（未作成、/review-ticket 全チェック通過後に作成）
