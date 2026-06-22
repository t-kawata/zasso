# 計画: チケット#87 VAD 発話 stuck 復帰

## 要件の再確認

### 修正: インテリジェントタイムアウトの条件緩和 + 閾値短縮
- `time_exceeded`（25秒）条件を撤廃
- `ASR_STAGNATION_THRESHOLD_SECS`: 5.0 → 3.0

## 変更ファイル一覧

| ファイル | 種別 | 内容 | 変更量 |
|---------|------|------|--------|
| `crates/voiput/src/pipeline/streamer.rs` | 修正 | 条件式変更（`time_exceeded` 削除）＋閾値変更 | ±2行 |

## Boy Scout 改善
- 変更箇所が少ないためスコープ外改善なし

## テスト計画

### ユニットテスト計画
- handle_vad() の条件式ロジック確認（正常系・異常系・境界値）

### ユニットテスト不可能な項目
- 実際の VAD stuck 動作 — 実機+ノイズ環境

## 実装手順

### Step 1: streamer.rs 修正
1. `ASR_STAGNATION_THRESHOLD_SECS`: 5.0 → 3.0
2. `time_exceeded && asr_stagnant && is_low_signal` → `asr_stagnant && is_low_signal`

### Step 2: 検証
1. `cargo check`
2. `cargo test`
3. 手動: `make run-openai KEY=sk-xxx` で発話後3秒以内に結果が返ることを確認

## 物理的レビュー方法
1. `run-quality-checks.js`
2. `cargo check` 警告ゼロ
3. `cargo test` 全テストパス
4. 翻訳可能性 grep

## リスク
- 条件緩和による誤切断: 発話中は RMS > 0.005 のため `is_low_signal` 不成立。リスクは極めて低い（事前評価済み）
