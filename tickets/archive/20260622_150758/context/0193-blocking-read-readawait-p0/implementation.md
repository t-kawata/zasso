# 実装サマリー: blocking_read → read().await 全面修正（P0）— ID: 193

## Phase 1: client.rs async 化
- `SipClient::account()` L234 → `async fn` + `read().await` + `drop(state)` 削除
- `SipClient::accounts()` L246 → `async fn` + `read().await`
- `SipClient::call_state()` L412 → `async fn` + `read().await`
- `SipAccountHandle::registration_state()` L627 → `async fn` + `read().await`

## Phase 2: reactor.rs Tokio タスク化
- `std::thread::spawn` → `tokio::spawn`（戻り値も `tokio::task::JoinHandle<()>` に変更）
- `rx.blocking_recv()` → `rx.recv().await`
- 全 IIFE closure `(|| { ... })()` → `async { ... }.await`（7箇所）
- 全 `blocking_read()` (14) → `read().await`
- 全 `blocking_write()` (9) → `write().await`
- `thread::spawn` + `thread::sleep` (DtmfSent) → `tokio::spawn` + `tokio::time::sleep`

## Phase 3: ヘルパー関数 async 化
- `resolve_native_call_id()`, `resolve_runtime_account_id()`: async + read().await
- `handle_conf_connect()`, `handle_conf_disconnect()`: async
- `handle_native_event()`, `handle_registration_state_changed()`: async
- `handle_call_state_changed()`: async + write().await
- `handle_call_media_state_changed()`: async + read().await

## Phase 4: テストコード適応
- 8 テスト関数を `#[tokio::test]` async fn に変更（うち 3 つは multi_thread）
- 全 `.account()`, `.accounts()`, `.call_state()`, `.registration_state()` 呼び出しに `.await` 追加

## 検証結果
- `cargo check` 警告ゼロ
- `cargo test --lib`: 436 passed, 0 failed
- `cargo test`: 436 lib + 2 doc-tests passed
- `grep -rn 'blocking_read\|blocking_write'`: 0 件を確認
- Malfeasance: 0 件
