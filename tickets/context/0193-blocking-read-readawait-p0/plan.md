# 計画: blocking_read → read().await 全面修正（P0）— ID: 193

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/siprs/src/client.rs` | 修正 | 4関数の `blocking_read()` → `read().await` + `async fn` 化 + `drop()` 削除 |
| `crates/siprs/src/runtime/reactor.rs` | 修正 | 23箇所の `blocking_read()`/`blocking_write()` 排除 + リアクターのTokioタスク化 |
| `crates/siprs/src/client.rs` (tests) | 修正 | 8箇所の `#[test]` → `#[tokio::test] async fn` |

## リアクター設計判断

リアクターは現在 `std::thread::spawn` 上の同期的な while-let ループ。`blocking_read()`/`blocking_write()` を排除するため、`tokio::spawn` による非同期タスクに変更する：
- `std::thread::spawn` → `tokio::spawn`
- `rx.blocking_recv()` → `rx.recv().await`
- IIFE `(|| { ... })()` → async ブロックまたは抽出 async fn
- `thread::spawn` + `thread::sleep` → `tokio::spawn` + `tokio::time::sleep`

## 実装手順

### Phase 1: client.rs async 化（4関数）
- `SipClient::account()` L234
- `SipClient::accounts()` L246
- `SipClient::call_state()` L412
- `SipAccountHandle::registration_state()` L627

### Phase 2: reactor.rs Tokioタスク化
- `spawn()` → `tokio::spawn`
- `run_loop()` → `run_loop_async()`
- 全 match arm の blocking lock → read().await / write().await

### Phase 3: ヘルパー関数 async 化
- resolve_native_call_id, resolve_runtime_account_id
- handle_native_event, handle_call_state_changed
- handle_call_media_state_changed, handle_conf_connect/disconnect

### Phase 4: テストコード適応
- client.rs tests: 8箇所の `#[test]` → `#[tokio::test] async fn`
- reactor.rs tests: `.await` 追加

### Phase 5: 検証
- `make check-be` + `make test`
- `blocking_read/blocking_write` grep 0件確認

## 翻訳可能性改善
- `drop(state)` 明示呼び出し削除（async 版ではスコープ終了で自動解放）
