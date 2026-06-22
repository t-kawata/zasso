# 実装サマリ: チケット #1 — EventBus 分割 + account_id routing

## 変更ファイル一覧

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `src/event.rs` | 変更（小） | `EventBus::control_sender()` getter 追加（Reactor 登録用） |
| `src/runtime/reactor.rs` | 変更（大） | `ClientId` newtype + `ReactorEventRouter` struct + `dispatch_event()` + `register()`/`map_account()`/`unmap_account()`/`sender_for()` + RegisterEventBus ハンドラ + AddAccount/RemoveAccount account→client 紐付け + 全 events.publish() → router.dispatch() 置き換え + 6 ユニットテスト追加 |
| `src/runtime/command.rs` | 変更（中） | `RegisterEventBus` バリアント追加 + `AddAccount.client_id: Option<ClientId>` 追加 |
| `src/runtime/handle.rs` | 変更（小） | `RuntimeHandle::register_event_bus()` helper 追加 |
| `src/client.rs` | 変更（中） | `ClientInner.client_id: Option<ClientId>` 追加 + `SipClient::new_attached()` 追加 |
| `src/audio/worker.rs` | Boy Scout | TODO → `[::STUB::]` マーカー追加 |
| `src/ffi/callbacks.rs` | Boy Scout | TODO → `[::STUB::]` マーカー追加 |

## コア設計

- `ReactorEventRouter`: Reactor 内部で EventBus を管理するルーター構造体
  - `default_bus`: 1st Client の EventBus (broadcast::Sender)
  - `account_to_client: HashMap<AccountId, ClientId>`: アカウント→Client 対応
  - `client_buses: HashMap<ClientId, Sender>`: Client→EventBus 対応
  - `dispatch()`: account_id ベース振り分け（Some→該当 client / None→broadcast）
- `SipClient::new_attached()`: Dual Client 用コンストラクタ（既存 Reactor に EventBus 登録、Initialize スキップ）

## テスト結果

- 442 tests passed (436 existing + 6 new)
- 0 failed
- Clippy warnings: 0 new (pre-existing issues only)
- Quality checks: no new issues in changed code
