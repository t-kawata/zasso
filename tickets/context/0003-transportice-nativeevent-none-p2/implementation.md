# Transport/ICE NativeEvent 変換 + 低優先度イベント none 変換（P2）

## Summary

Transport/ICE NativeEvent → SipEventPayload 変換の完全化と TransportId newtype の導入。

## Changed Files

| File | Change |
|------|--------|
| `crates/siprs/src/util/id.rs` | `TransportId` newtype 追加（`NonZeroU64` / `from_raw` / `into_raw` / `Display` / serde / tests） |
| `crates/siprs/src/event.rs` | `TransportConnectedInfo.tp_id`: `i32` → `TransportId`、`TransportDisconnectedInfo.tp_id`: `i32` → `TransportId`、`TransportErrorInfo.tp_id`: `i32` → `TransportId` |
| `crates/siprs/src/runtime/reactor.rs` | `convert_transport_state()` 改善（state 完全対応 + 未知/connecting は None）、`IceTransportError` の call_id 解決、P2 対象外 5 種を個別 match arm 化 + 日本語ガイダンスコメント、`IncomingCall` 分離、テスト 14 ケース追加 |
| `crates/siprs/src/util/mod.rs` | コメントに `TransportId` 追加 |

## Tests Added

### convert_transport_state unit tests (5)
- CONNECTED (state=2) → TransportConnected
- DISCONNECTED (state=0) → TransportDisconnected
- ERROR (state=3) → TransportError
- CONNECTING (state=1) → None
- 未知 state (99) → None

### handle_native_event integration tests (5)
- TransportDisconnected publish
- TransportError publish
- CONNECTING → no publish
- 未知 state → no publish
- 既存 3 テスト維持 + P2 events ignored 維持

### TransportId unit tests (4)
- from_raw 正常値 → Some
- from_raw 負数 → None
- from_raw ゼロ → None
- ラウンドトリップ

## Verification

- `make check-be`: ✅
- `cargo test --lib` (siprs): 458/458 passed ✅
- `run-quality-checks.js`: 65 issues (all pre-existing, none from new code)
- Crimes/stubs: 0
