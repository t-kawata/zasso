# M20-5: SubscribeAudio Reactor ハンドラ — conf_connect 統合（P1） — 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `runtime/state.rs` | 変更 | `MediaRuntime` に `tap_txs: Vec<mpsc::Sender<AudioChunkPair>>` フィールド追加 |
| `runtime/command.rs` | 変更 | `RuntimeCommand::SubscribeAudio` に `format`/`capacity`/`mode` 追加、戻り値型を `Result<AudioTapHandle, SipError>` に変更、`reply` → `reply_tx` リネーム |
| `runtime/reactor.rs` | 変更 | SubscribeAudio ハンドラ実装（RFC02 §5.3 準拠: call_id解決→ConfConnect→チャネル生成→MediaRuntime保存→AudioTapHandle返却）、`reject_command` 更新、`AudioChunkPair`/`AudioTapHandle` インポート追加 |
| `client.rs` | 変更 | `subscribe_audio()` を reactor 経由の `send_and_wait` に変更（スタブからの完全置き換え） |
| `runtime/reactor.rs` (tests) | 追加 | SubscribeAudio テスト4件（Realtime正常系、Lossless正常系、CallNotFound異常系、Shutdown後InvalidState異常系） |

## 実装内容

### RuntimeCommand::SubscribeAudio (command.rs)
- シグネチャ拡張: `call_id` + `format` + `capacity` + `mode` + `reply_tx`
- 戻り値型: `Result<AudioTapHandle, SipError>`
- `reply` → `reply_tx` リネーム（ConfConnect/ConfDisconnect との命名統一）

### MediaRuntime (state.rs)
- `tap_txs: Vec<tokio::sync::mpsc::Sender<AudioChunkPair>>` 追加
- SubscribeAudio の tx を保存し、AudioWorkerTask 統合時に使用可能に

### SubscribeAudio ハンドラ (reactor.rs)
RFC02 §5.3 の処理フロー実装:
1. `resolve_native_call_id()` で CallId → native_call_id 解決
2. `handle_conf_connect(backend, state, call_id, MediaDirection::Both)` で双方向接続
3. 指定 `capacity` で `mpsc::channel::<AudioChunkPair>` 生成
4. tx を `MediaRuntime.tap_txs` に保存（AudioWorker 連携は別チケット）
5. `AudioTapHandle::new(rx)` で handle 構築 → reply_tx で返却

### SipClient::subscribe_audio (client.rs)
- スタブからの完全置き換え
- `block_on(send_and_wait(|reply_tx| RuntimeCommand::SubscribeAudio{...}))` で reactor 経由に

## テスト結果
- 新規追加テスト: 4件（全パス）
- 全テスト: 436件（432既存 + 4新規）全パス

## 依存関係
- M20-2 (ConfConnect/ConfDisconnect) — 完了確認済み
- M16-1 (AudioTapHandle) — 完了確認済み
- 犯罪: 0件
