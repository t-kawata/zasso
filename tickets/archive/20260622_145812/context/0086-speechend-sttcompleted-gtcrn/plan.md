# 計画: チケット#86 SpeechEnd の SttCompleted 追加と GTCRN デノイザーパス修正

## 要件の再確認

### 修正1: SpeechEnd に SttCompleted 追加
- **症状**: SpeechEnd 経由のバッファフラッシュ後も is_stt_pending が解放されず BufferFlush が効かない
- **修正**: SpeechEnd ハンドラ内の buffered PartialResult 送信後に SttCompleted を追加

### 修正2: GTCRN モデルパス設定
- **症状**: OpenAI モードで Denoiser が初期化されず認識品質が低下
- **原因**: test-run.rs で gtcrn パスが空文字
- **修正**: gtcrn: String::new() → gtcrn: model_path("gtcrn.onnx")

## 変更ファイル一覧

| # | ファイル | 種別 | 内容 | 変更量 |
|---|---------|------|------|--------|
| 1 | `crates/voiput/src/backends/openai.rs` | 修正 | SpeechEnd のバッファフラッシュ後に SttCompleted 追加 | +1行 |
| 2 | `crates/voiput/src/binary/test-run.rs` | 修正 | gtcrn パスを空文字から model_path() に変更 | 複数箇所 |

## Boy Scout 改善
- `test-run.rs` の `gtcrn: String::new()` が複数箇所に存在する。すべて model_path("gtcrn.onnx") に統一する（3箇所確認）

## テスト計画

### ユニットテスト計画
- 修正1: リスナー内 SpeechEnd ロジックのテスト（純粋関数として抽出された変換ロジック）
- 修正2: test-run.rs の変更のみでテスト追加不要（コンパイルで検証可能）

### ユニットテスト不可能な項目
- Denoiser の実際のノイズ除去効果 — GTCRN モデルファイル + 実機が必要

## 実装手順

### Step 1: openai.rs — SpeechEnd に SttCompleted 追加
1. SpeechEnd ハンドラ内（400行目）の buffered PartialResult ブロックに `SttCompleted` try_send を追加
2. 「SpeechEnd 時も is_stt_pending を解放するため」とコメント

### Step 2: test-run.rs — GTCRN パス修正
1. `gtcrn: String::new()` の全出現箇所を検索（3箇所想定）
2. すべて `gtcrn: model_path("gtcrn.onnx")` に変更

### Step 3: 検証
1. `cargo check` コンパイル確認
2. `cargo test` 全テストパス確認
3. 手動: `make run-openai KEY=sk-xxx` で動作確認

## 物理的レビュー方法
1. `run-quality-checks.js` で変更ファイルをチェック
2. `cargo check` 警告ゼロ
3. `cargo test` 全テストパス
4. 翻訳可能性 grep: マジックナンバー・デバッグ出力なし

## リスク
| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| SttCompleted 追加による pending_flush 早期実行 | 低 | 低 | #85 のレビューで確認済み。リスクは低い |
| GTCRN モデル読み込み失敗 | 低 | 低 | モデルは存在確認済み。失敗時はエラーログ出力後 Denoiser なしで継続 |
