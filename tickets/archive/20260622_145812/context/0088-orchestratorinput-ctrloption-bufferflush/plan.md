# 計画: チケット#88 OrchestratorInput を BufferFlush と共通化

## 要件の再確認

### 修正: OrchestratorInput の stub を BufferFlush と統合
- 現在: モード切替（無意味な死コード）
- 修正後: BufferFlush と同じフラッシュ処理を行い、ペーストの代わりに Flushed イベントを発行

## 変更ファイル一覧

| ファイル | 種別 | 内容 | 変更量 |
|---------|------|------|--------|
| `crates/voiput/src/voiput.rs` | 修正 | `flush_and_cleanup(`bool`)` 抽出 + BufferFlush/OrchestratorInput 両方から呼び出し | ±5行 |

## テスト計画

### ユニットテスト計画
- OrchestratorInput 動作テスト: 録音中 → stop + Flushed + cleanup
- 既存テスト全170件パス確認

### ユニットテスト不可能な項目
- 実際の Ctrl+Option 動作 — 実機+OS 権限

## 実装手順

### Step 1: voiput.rs 修正
1. `flush_and_cleanup(paste_to_clipboard: bool)` を `emit_flushed` の隣に追加
2. BufferFlush の本体部分を `flush_and_cleanup(true)` に置き換え
3. OrchestratorInput を `flush_and_cleanup(false)` に置き換え（モード切替削除）
4. `test_process_hotkey_orchestrator_input()` の期待値を更新（モード切替→Flushed発行）

### Step 2: 検証
1. `cargo check`
2. `cargo test`

## 物理的レビュー方法
1. `run-quality-checks.js`
2. `cargo check` 警告ゼロ
3. `cargo test` 全テストパス
4. 翻訳可能性 grep

## リスク
- なし（BufferFlush の完全なコピーからペースト行だけ削った処理）
