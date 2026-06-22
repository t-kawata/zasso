# 変更したファイル一覧と実装内容の概要

## 変更ファイル

### 1. `src/voiput.rs` (メイン)
- `start()` / `stop()` を `pub fn` → `pub async fn` に変更（RFC §4.2 準拠）
- `request_permissions()` を新規追加（macOS: FFI 経由 SFSpeechRecognizer.requestAuthorization、Windows: health_check bit2 確認、非対応OS: Ok(false)）
- `set_engine()` を `pub fn` → `pub async fn` に変更（内部で start/stop を .await で呼ぶため）
- `flush()` の内部呼び出しを `stop()?` → `stop().await?`、`start()?` → `start().await?` に更新
- Boy Scout: `was_running` → `was_engine_running` に rename（翻訳可能性向上）
- Boy Scout: macOS unsafe ブロックに // SAFETY コメントを追加
- 既存ユニットテストを rt.block_on 経由の async 呼び出しに対応
- `test_voiput_request_permissions` テストを追加

### 2. `tests/integration_test.rs`
- `test_voiput_start_stop` を rt.block_on 経由の async 呼び出しに対応
- `test_voiput_set_engine` を同様に async 対応

### 3. `src/binary/test-run.rs`
- `test_voiput()` 関数内の start()/stop()/set_engine()/flush() 呼び出しを rt.block_on 経由の async 呼び出しに統一

## 検証結果
- cargo check: 成功（警告ゼロ）
- 全テスト通過: 108 unit + 14 integration + 2 doc = 124 passing
