# 計画: チケット#89 OrchestratorInput 非録音時自動開始 + 遅延フラッシュ種別追跡

## 要件の再確認

### 修正1: OrchestratorInput 非録音時自動開始
- 現在: `is_running()` ガードで無視
- 修正後: 非録音時 → BufferFlush Start と同様に録音開始

### 修正2: pending_flush 種別追跡
- 現在: `execute_pending_flush()` が常にクリップボードペースト
- 修正後: `pending_flush_is_orchestrator` フラグで paste / Flushed を分岐

## 変更ファイル一覧

| ファイル | 種別 | 内容 | 変更量 |
|---------|------|------|--------|
| `crates/voiput/src/voiput.rs` | 修正 | OrchestratorInput 自動開始 + pending_flush 種別追跡 | +15行 |

## テスト計画

### ユニットテスト計画
- OrchestratorInput 非録音時 → is_running=true
- execute_pending_flush + is_orchestrator → Flushed 発行
- execute_pending_flush + !is_orchestrator → clipboard
- 既存テスト全件パス

## 実装手順

### Step 1: voiput.rs
1. 構造体に `pending_flush_is_orchestrator: bool` 追加
2. コンストラクタで初期化
3. OrchestratorInput の is_running ガード削除 → 非録音時開始処理に変更
4. BufferFlush defer 時に `= false`、OrchestratorInput defer 時に `= true`
5. `execute_pending_flush()` 内で分岐

### Step 2: 検証
1. cargo check
2. cargo test

## リスク
- なし（既存のStart/フラッシュ処理の組み合わせのみ）
