# 計画: チケット#85 PartialResult 後の SttCompleted 復活

## 要件の再確認

### 修正: PartialResult 非デコレーション時に SttCompleted を復活
- **症状**: PostCorrection 前に Option ダブルタップでフラッシュできない
- **原因**: #83 で PartialResult 後の SttCompleted を削除したため、is_stt_pending が解放されず BufferFlush が deferred 状態から抜け出せない
- **修正**: イベントリスナーの PartialResult ハンドラで、非デコレーション時に PartialResult 送信後に SttCompleted も送信する（mycute 準拠）

## 変更ファイル一覧

| # | ファイル | 種別 | 内容 | 変更量 |
|---|---------|------|------|--------|
| 1 | `crates/voiput/src/backends/openai.rs` | 修正 | PartialResult 非デコレーション時、SttCompleted を追加送信 | +1行 |

## Boy Scout 改善
- スコープ外の改善対象はなし（1行追加のみ）

## テスト計画

### ユニットテスト計画

#### テスト1: PartialResult 後の SttCompleted 確認
- **対象**: イベントリスナーの PartialResult ハンドラ（コアロジック）
- **正常系**: 非デコレーション時 → PartialResult 送信後に SttCompleted が続く
- **正常系**: デコレーション時 → バッファリングされ SttCompleted は送信されない
- **場所**: `src/backends/openai.rs #[cfg(test)]`

#### テスト2: 既存テストの非影響確認
- **対象**: 全170テスト
- **正常系**: 全てパス

### ユニットテスト不可能な項目
- BufferFlush 実際の動作確認 — 実機+OS 権限が必要。手動テスト

## 実装手順

### Step 1: openai.rs 修正
1. PartialResult ハンドラ（422行目）の非デコレーション分岐内で、PartialResult try_send の直後に SttCompleted try_send を追加
2. コメントを更新: "SttCompleted は FinalResult の後にのみ送信する" → "mycute 準拠: 各発話単位で is_stt_pending を解放するため SttCompleted を送信"

### Step 2: 検証
1. `cargo check` コンパイル確認
2. `cargo test` 全テストパス確認
3. 手動: `make run-openai KEY=sk-xxx` で発話後 Option ダブルタップでフラッシュされることを確認

## 物理的レビュー方法
1. `run-quality-checks.js crates/voiput/src/backends/openai.rs`
2. `cargo check` 警告ゼロ
3. `cargo test` 全テストパス
4. 翻訳可能性 grep: マジックナンバー・デバッグ出力なし

## リスク
| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| SttCompleted 追加による Voiput の next_event 誤動作 | 低 | 低 | try_send_fush_text は is_stt_pending が false の時のみ flush_tx をチェック。SttCompleted で is_stt_pending が false になるが flush_tx は None なので無害 |
