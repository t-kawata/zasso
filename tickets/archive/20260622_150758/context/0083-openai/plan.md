# 計画: チケット#83 OpenAI モードの音声認識パイプライン実装と二重イベント修正

## 要件の再確認

1. **二重イベント解消**: `make run-openai` で Started/Stopped が2回表示される問題を修正
2. **OpenAI ASR パイプライン完成**: ネイティブキャプチャ → VAD → Whisper API → PostCorrection の配線
3. **デコレーション機能**: 発話中 `"... ?"` アニメーションと漏洩防止11バリア
4. **遅延フラッシュ**: BufferFlush が is_stt_pending 中に来た場合は pending_flush で延期

### 非影響保証
- OS 標準モード（MacSpeechBackend / WinSpeechBackend）は一切変更しない
- 既存のビルド・テストは全件通過
- Started/Stopped は SpeechRecognizer 側を維持（OS モードの唯一の発行元）

## 変更ファイル一覧

| # | ファイル | 種別 | 内容 |
|---|---------|------|------|
| 1 | `crates/voiput/src/recognizer.rs` | 修正 | OpenAIRecognizer の Started/Stopped 発行を削除、stop() でアクティブエンジンのみ停止、ダミー config→実 config |
| 2 | `crates/voiput/src/voiput.rs` | 修正+追加 | is_stt_pending/pending_flush/last_stt_seq フィールド追加、next_event() 拡張、BufferFlush 遅延フラッシュ、hotkey Start に flush_tx=None |
| 3 | `crates/voiput/src/backends/openai.rs` | 全面的書き換え | OpenAIRecognizer: PseudoAsrStreamer 統合、デコレーション機構、3タスク起動、イベントリスナー |
| 4 | `crates/voiput/src/constants.rs` | 追加 | STT_DECORATION_INTERVAL_MS = 180 |
| 5 | `crates/voiput/src/types.rs` | 確認 | SttPending/SttCompleted/DecorationPartial/ForceClearDecoration/Flushed → 全 variant 既存 ✅ |
| 6 | `crates/voiput/src/binary/test-run.rs` | 修正 | イベントループに SttPending/SttCompleted/DecorationPartial 表示追加 |

## Boy Scout 改善

### スコープ外の翻訳可能性修正

| # | ファイル | 行 | 問題 | 修正 |
|---|---------|-----|------|------|
| 1 | `recognizer.rs:408-418` | 全バックエンド一律停止 | アクティブエンジンのみ停止に変更（翻訳可能性: 「ブレ以外のエンジンも停止する」→「アクティブなエンジンのみ停止する」） |
| 2 | `voiput.rs:313-329` | hotkey Start に flush_tx=None 欠落 | 追加（状態リセットの完全性） |

## テスト計画

### ユニットテスト計画

#### テスト1: OpenAIRecognizer::init_audio() — 正常/異常
- **正常系**: 有効な設定で init_audio → Ok(())
- **異常系**: 存在しない VAD モデルパス → Err
- **場所**: `src/backends/openai.rs #[cfg(test)]`
- **外部依存**: VAD モデルファイル必須（なければスキップ）

#### テスト2: OpenAIRecognizer start/stop ライフサイクル
- **正常系**: start → is_running=true, stop → is_running=false
- **異常系**: 二重 start → 無視される、二重 stop → 無視される
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト3: StreamerEvent → SttEvent 変換（純粋関数として抽出）
- **正常系**: SpeechStart → SttPending + デコレーションタスク起動フラグ
- **正常系**: SpeechEnd → partial_result_buffer フラッシュ、is_decorating=false
- **正常系**: FinalResult → アーティファクト除去
- **境界値**: 空テキスト, "... ?"のみ
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト4: PseudoAsrStreamer<OpenAIBackend> 結合
- **正常系**: new → start → stop 正常終了
- **異常系**: 不正 VAD パスで new がエラー
- **場所**: 統合テスト（test-run.rs test_streamer に統合）

#### テスト5: 二重イベント修正確認
- **正常系**: SpeechRecognizer.start() 後に Started が1件だけ届く
- **正常系**: SpeechRecognizer.stop() 後に Stopped が1件だけ届く
- **場所**: `src/recognizer.rs #[cfg(test)]`

#### テスト6: デコレーション変換 + strip_artifacts
- **正常系**: SpeechStart→SttPending, SpeechEnd→PartialResult フラッシュ
- **正常系**: "hello ... ?" → strip → "hello"
- **正常系**: "hello ... " → strip → "hello"
- **正常系**: " ... ?" のみ → strip → ""
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト7: BufferFlush 遅延フラッシュ
- **正常系**: is_stt_pending=true で BufferFlush → pending_flush=true
- **正常系**: pending_flush=true + SttCompleted → flush 実行
- **正常系**: 非録音中 BufferFlush → 無視
- **場所**: `src/voiput.rs #[cfg(test)]`

#### テスト8: Voiput 状態遷移
- **正常系**: SttPending → is_stt_pending=true
- **正常系**: SttCompleted → is_stt_pending=false
- **正常系**: SttPending で古い pending_flush がリセット
- **正常系**: ForceClearDecoration → is_stt_pending=false
- **場所**: `src/voiput.rs #[cfg(test)]`

#### テスト9: sequence_counter increment
- **正常系**: 各 PartialResult/FinalResult 発行で +1
- **正常系**: start→stop 間で単調増加
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト10: デコレーション漏洩防止
- **対象**: strip_decoration_artifacts() 純粋関数
- **正常系**: 全入力パターンで期待通りの出力
- **場所**: `src/backends/openai.rs #[cfg(test)]`

### ユニットテスト不可能な項目

1. **OpenAI Whisper API 結合**: 実際の HTTP 通信が必要。手動テスト (test_openai)
2. **ネイティブ音声キャプチャ**: 実機マイク + OS 権限。手動テスト (test-run)
3. **VAD モデルファイル依存**: models/ に ONNX が必要。なければスキップ

### E2E 手動テスト（test-run.rs で確認）

1. `make run-openai KEY=sk-xxx` → Started 1回、発話認識、Stopped 1回
2. 発話中デコレーション表示 → "... ?" アニメーション
3. BufferFlush 遅延 flush → 発話中に Option 2回 → 発話完了後に自動ペースト
4. Ctrl+Option 中断 → 停止 + デコレーションなし
5. 連続発話サイクル → 古い pending_flush 持ち越しなし
6. **`make run KEY=sk-xxx` (OS モード) → 従来通り動作することを必ず確認**

## 実装手順

### Step 1: 下準備
- `rustc` / `cargo check` が通ることを確認
- `make test` が全件パスすることを確認
- `[::STUB::]` マーカーが3箇所あることを確認

### Step 2: フェーズA — 二重イベント修正 (`recognizer.rs`)
1. `OpenAIRecognizer::start()` から `SttEvent::Started` 送信を削除（openai.rs:182）
2. `OpenAIRecognizer::stop()` から `SttEvent::Stopped` 送信を削除（openai.rs:187）
3. `SpeechRecognizer::stop()` の全バックエンド停止 → アクティブエンジンのみ停止に変更
4. `SpeechRecognizer::new()` で OpenAIRecognizer へダミー config ではなく実 config を渡す

### Step 3: フェーズB — Voiput フィールド拡張 (`voiput.rs`)
1. 構造体に `is_stt_pending: bool`, `pending_flush: bool`, `last_stt_seq: u64` 追加
2. コンストラクタで初期化
3. `process_hotkey_action Start` に `flush_tx = None` 追加

### Step 4: フェーズC — next_event() 拡張 (`voiput.rs`)
1. SttPending → is_stt_pending=true, pending_flush=false
2. SttCompleted → is_stt_pending=false, pending_flush flush 実行
3. ForceClearDecoration → is_stt_pending=false
4. PostCorrectionFinished → is_post_correcting=false, pending_flush flush 実行

### Step 5: フェーズD — BufferFlush 遅延フラッシュ (`voiput.rs`)
1. process_hotkey_action BufferFlush に is_stt_pending/is_post_correcting チェック追加
2. try_send_flush_text() に pending_flush 実行パス追加

### Step 6: フェーズE — OpenAIRecognizer 本実装 (`backends/openai.rs`)
1. 構造体フィールド追加（is_decorating, session_counter, etc.）
2. init_audio(): PseudoAsrStreamer<OpenAIBackend> 構築
3. start(): streamer.start() + ネイティブキャプチャ + 250ms Ready + 3タスク起動
4. イベントリスナータスク: StreamerEvent → SttEvent 変換
5. デコレーションタスク: 180ms トグル + 4重終了チェック
6. stop(): 全タスク abort + キャプチャ停止 + PostCorrection.reset

### Step 7: フェーズF — シーケンス番号管理 (`backends/openai.rs`)
1. sequence_counter を PartialResult/FinalResult 送信時に increment

### Step 8: フェーズG — 定数追加 (`constants.rs`)
1. STT_DECORATION_INTERVAL_MS = 180

### Step 9: フェーズH — test-run.rs 拡張
1. SttPending/SttCompleted/DecorationPartial/ForceClearDecoration 表示追加
2. is_stt_pending フラグ反映

### Step 10: ビルド & 検証
1. `make check-be` コンパイル確認
2. `make test` 全テストパス
3. `make run-openai KEY=sk-xxx` 手動動作確認（Started/Stopped 1回、認識動作、デコレーション表示）
4. `make run KEY=sk-xxx` OS モードが従来通り動作することを確認
5. テスト10 (strip_artifacts) の動作確認
6. `[::STUB::]` マーカーが解決されたことを確認

## 物理的レビュー方法

1. `run-quality-checks.js` を実行し、報告された issues がゼロであることを確認
2. 翻訳可能性 grep:
   - 追加した関数が名詞始まりになっていないか（動詞句であること）
   - マジックナンバーが紛れ込んでいないか（constants.rs 参照）
   - デバッグ出力 (`eprintln!`, `dbg!`) が残っていないか
3. 既存テスト全件パス: `make test`
4. OS モード非影響確認: `make check-be` + `make test` で OS モード由来のテストが通ること
5. `[::STUB::]` 未解決がないこと

## リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| PseudoAsrStreamer の VAD モデルパス生成にミス | 低 | 中 | 起動時にエラーログ、test-run.rs の test_vad() で事前確認 |
| 既存 OS モードに影響 | 極低 | 高 | 全フェーズで OS モードパスをトレース、E2E テストで確認 |
| Windows 未テスト | 中 | 低 | macOS で十分検証、Windows はコンパイルチェックのみ |
| デコレーションアーティファクト漏洩 | 低 | 中 | 11バリアで防御、テスト10で strip 関数を検証 |
