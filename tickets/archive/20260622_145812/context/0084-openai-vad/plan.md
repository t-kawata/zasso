# 計画: チケット#84 OpenAI モードのデコレーション誤作動修正とVADパラメータ調整

## 要件の再確認

### 修正1: SpeechStart で last_speech_end_time をクリア
- 症状: 第2発話以降でデコレーションが即座に ForceClearDecoration で強制終了される
- 原因: `last_speech_end_time` が SpeechStart でクリアされず、前発話の終了時刻が残っている
- 修正: SpeechStart ハンドラ内で `*listener_speech_end_time.lock() = None;` を追加

### 修正2: デコレーションタスク abort + await
- 症状: 旧デコレーションタスクと新タスクの競合
- 原因: `task.abort()` のみで完了待ちがない
- 修正: `task.abort()` の後に `let _ = task.await;` を追加

### 修正3: VAD パラメータを mycute 実績値に変更
- 症状: 発話先頭欠落、認識誤り増加
- 原因: `min_speech_duration=0.25`（mycute: 0.05）、`pre_padding_ms=100`（mycute: 200）
- 修正: `types.rs` の `VadConfig::default()` の該当値を変更

## 変更ファイル一覧

| # | ファイル | 種別 | 内容 | 変更量 |
|---|---------|------|------|--------|
| 1 | `crates/voiput/src/backends/openai.rs` | 修正 | SpeechStart で last_speech_end_time クリア + abort 後に await | +3行 |
| 2 | `crates/voiput/src/types.rs` | 修正 | VadConfig デフォルト値変更（2箇所）+ テスト期待値更新（2箇所） | ±4行 |

## Boy Scout 改善

### スコープ外の翻訳可能性修正
- 今回のスコープは修正3点のみで、新たな改善対象はなし

## テスト計画

### ユニットテスト計画

#### テスト1: VadConfig デフォルト値の確認
- **対象**: `VadConfig::default()`
- **正常系**: `min_speech_duration == 0.05` かつ `pre_padding_ms == 200`
- **場所**: `src/types.rs` の既存テスト（テスト値も更新）

#### テスト2: 既存テストの非影響確認
- **対象**: 全テスト
- 修正1+2 は listener task 内の変更で、ユニットテストではカバー不可（実機+VADモデル需要）
- 修正3 はデフォルト値変更。既存の config テストが影響を受けるため期待値を更新
- **正常系**: 全170テストパス

### ユニットテスト不可能な項目
- 連続発話でのデコレーション動作：実機+VADモデル+人間の発話が必要
- 発話先頭欠落改善：同上

## 実装手順

### Step 1: 修正1+2 — openai.rs の SpeechStart ハンドラ修正
1. SpeechStart ハンドラ内（現在の 299-325行目付近）で:
   a. `*listener_speech_end_time.lock() = None;` を追加（クリア）
   b. `task.abort();` の後に `let _ = task.await;` を追加（完了待ち）

### Step 2: 修正3 — types.rs の VAD デフォルト値変更
1. `VadConfig::default()` の `min_speech_duration` を 0.25 → 0.05 に変更
2. `pre_padding_ms` を 100 → 200 に変更
3. テストの期待値を更新（`assert_eq!(cfg.min_speech_duration, 0.05)` 等）

### Step 3: 検証
1. `cargo check` でコンパイル確認
2. `cargo test` で全テストパス確認
3. 手動: `make run-openai KEY=sk-xxx` で連続発話しデコレーション動作確認

## 物理的レビュー方法

1. `run-quality-checks.js crates/voiput/src/backends/openai.rs crates/voiput/src/types.rs`
2. `cargo check` で警告ゼロ確認
3. `cargo test` で全テストパス確認
4. `grep -rn '\[::STUB::\]' crates/voiput/src/` で未解決スタブなし確認
5. 翻訳可能性 grep:
   - 追加したコードにマジックナンバーやデバッグ出力がないか確認

## リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| `task.await` 追加によるデッドロック | 低 | 高 | abort 後は task が即座に終了するため問題なし |
| VAD 設定変更による既存 OS モードへの影響 | 低 | 中 | OS モードも同じ VadConfig を使用するため影響あり。ただし 0.05 と 200ms は mycute 実績値のため安全 |
| テスト値の更新漏れ | 低 | 低 | `cargo test` で検出可能 |
