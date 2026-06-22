# M12-5: SipClient::shutdown() — idempotent・cancel safety

## 変更ファイル

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 追記 | `shutdown()` + `is_shutdown()` + 2 tests |

## 実装内容

### `shutdown()` (client.rs:216-227)
- idempotent: is_shutdown() が true なら即座に Ok(()) を返す
- watch チャネルに shutdown 通知
- block_on + send_and_wait で reactor に Shutdown コマンド送信

### `is_shutdown()` (client.rs:230-232)
- watch::Sender::borrow() で現在の値を確認

### テスト
- `test_is_shutdown_default_false` (#528): SipClient 作成直後は false
- `test_shutdown_sets_flag` (#549): send(true) 後 is_shutdown() == true

## 検証結果
- `cargo check`: 0 errors, 0 warnings
- `cargo test`: 320 passed, 0 failed, 0 warnings
- `run-quality-checks.js`: 0 issues
