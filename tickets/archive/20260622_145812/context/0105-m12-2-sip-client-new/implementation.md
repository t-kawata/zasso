# 実装成果: チケット #105 — M12-2 SipClient::new()

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/client.rs | 追記 | SipClient::new(config, backend) + 3 tests |

## 実装内容

### SipClient::new(config, backend) — テスト用コンストラクタ (#[cfg(test)])
1. validate_client_config(&config)?
2. EventBus::new(...)
3. ClientState::new() + Arc<RwLock>
4. watch channel for shutdown
5. CoreReactor::spawn(backend, events, state, shutdown_rx)
6. block_on(handle.send_and_wait(Initialize))
7. SipClient { inner: Arc::new(ClientInner { ... }) }

### ClientInner 拡張
- state: RwLock<ClientState> → Arc<RwLock<ClientState>>

### block_on ヘルパー
- 既存ランタイム内 → Handle::try_current() + block_on
- ランタイム外 → 新規 Runtime::new()

## テスト結果
- 311 tests PASS（既存 308 + 新規 3）
- 0 warnings
- Quality checks: 0 issues
