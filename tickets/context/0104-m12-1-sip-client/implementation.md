# 実装成果: チケット #104 — M12-1 SipClient

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/client.rs | 新規 | SipClient (Arc<ClientInner>) + Clone + Debug + 3 tests |
| crates/siprs/src/lib.rs | 修正 | pub mod client; 追加 |
| crates/siprs/src/event.rs | 修正 | EventBus に Debug を追加 |

## 実装内容

### SipClient (pub struct)
- inner: Arc<ClientInner>
- #[derive(Clone)] — Arc::clone に委譲
- impl Debug — 機密情報を含まない表示
- Send + Sync 自動成立 (Arc + RwLock)

### ClientInner (pub(crate))
- runtime: RuntimeHandle / events: EventBus
- state: RwLock<ClientState> / shutdown: watch::Sender<bool>

## テスト結果
- 308 tests PASS（既存 305 + 新規 3）
- 0 warnings
- Quality checks: 0 issues
