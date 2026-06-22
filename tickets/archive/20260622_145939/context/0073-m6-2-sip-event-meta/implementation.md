# 実装成果: チケット #73 — M6-2 SipEvent / EventMeta / EventTimestamp

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/event.rs | 追記 | 5 型定義 + EventMetaBuilder + 7 tests |

## 実装内容

### EventDirection (enum)
- Inbound / Outbound — イベントの方向

### EventTimestamp (newtype)
- SystemTime のラッパー。Debug + Clone + Copy + PartialEq + Ord

### EventMeta (struct) — 9 fields
- event_id: u64 / timestamp: EventTimestamp
- account_id: Option<AccountId> / call_id: Option<CallId>
- direction: Option<EventDirection>
- headers: Option<Vec<(String, String)>>
- status_code: Option<u16> / reason_phrase: Option<String>
- logical_context: BTreeMap<String, String>

### SipEvent (struct)
- meta: EventMeta + payload: SipEventPayload
- SipEvent::new(payload) — AtomicU64 自動採番
- SipEvent::with_meta(payload) → EventMetaBuilder.build()

### EventMetaBuilder
- 8 メソッド: account_id, call_id, direction, header, status_code, reason, context, build

## テスト結果
- 216 tests PASS（既存 209 + 新規 7）
- 0 warnings
- Quality checks: 0 issues
