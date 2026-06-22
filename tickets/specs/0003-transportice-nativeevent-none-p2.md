---
ticket_id: 3
title: Transport/ICE NativeEvent 変換 + 低優先度イベント none 変換（P2）
slug: transportice-nativeevent-none-p2
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0003-transportice-nativeevent-none-p2/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0003-transportice-nativeevent-none-p2/review.md
---
# Transport/ICE NativeEvent 変換 + 低優先度イベント none 変換（P2）

## Summary

P0（Registration/Call/DTMF 系）に続き、P1 優先度の Transport/ICE 系 NativeEvent → SipEventPayload 変換を実装する。P2 対象外イベントは明示的に `None` を返す変換を実装し、RawSIP バス経由の代替取得をコメントで案内する。合わせて、現在 raw `i32` で渡されているトランスポート ID を `TransportId` newtype に置き換え、型安全性を向上させる。

## Investigation

### 現状のソースコード調査結果

#### 1. `TransportId` newtype — 未定義

`crates/siprs/src/util/id.rs` には `AccountId` / `CallId` / `AudioSourceId` の 3 種の ID 型が `NonZeroU64` ベースで定義されている。`TransportId` は存在しない。

```rust
// util/id.rs の現状: AccountId, CallId, AudioSourceId のみ
pub struct AccountId(NonZeroU64);      // ✅ 定義済み
pub struct CallId(NonZeroU64);         // ✅ 定義済み
pub struct AudioSourceId(NonZeroU64);  // ✅ 定義済み
// TransportId 未定義 ← 追加対象
```

#### 2. `NativeEvent` enum — 全 variant 定義済み

`crates/siprs/src/ffi/callbacks.rs:84-132`:

- `TransportStateChanged { tp_id: i32, state: u32 }` — ✅ 定義済み（`tp_id` は `i32`）
- `IceTransportError { call_id: i32, status: i32 }` — ✅ 定義済み
- P2 対象外:
  - `CallTsxStateChanged { call_id: i32 }`
  - `CallRedirected { call_id: i32 }`
  - `CallTransferStatus { call_id: i32, status_code: i32 }`
  - `CallReplaced { old_call_id: i32, new_call_id: i32 }`
  - `NatDetected { info: String }`

#### 3. Info 構造体 — `tp_id: i32` を直接使用

`crates/siprs/src/event.rs:507-541`:

```rust
pub struct TransportConnectedInfo {
    pub tp_id: i32,         // ← TransportId に置き換え
    pub kind: TransportKind,
    pub local_addr: Option<SocketAddr>,
}

pub struct TransportDisconnectedInfo {
    pub tp_id: i32,         // ← TransportId に置き換え
    pub kind: TransportKind,
}

pub struct TransportErrorInfo {
    pub tp_id: i32,         // ← TransportId に置き換え
    pub kind: TransportKind,
    pub error: String,
}
```

#### 4. `handle_native_event()` — match 構造

`crates/siprs/src/runtime/reactor.rs:828-941`:

```rust
match event {
    // ... P0 events (Registration, Call, DTMF) ...
    
    // TransportStateChanged (line 915-923)
    NativeEvent::TransportStateChanged { tp_id, state: tp_state } => {
        let transport_event = convert_transport_state(tp_id, tp_state);
        if let Some(payload) = transport_event {
            router.dispatch(SipEvent::new(payload));
        }
    }
    
    // IceTransportError (line 924-931) — call_id が _ で無視されている
    NativeEvent::IceTransportError { call_id: _, status } => { /* ... */ }
    
    // P2 対象外イベント (line 932-940) — コメントのみ、明示的な None 変換なし
    NativeEvent::NatDetected { .. }
    | NativeEvent::CallTsxStateChanged { .. }
    | NativeEvent::CallRedirected { .. }
    | NativeEvent::CallTransferStatus { .. }
    | NativeEvent::CallReplaced { .. }
    | NativeEvent::IncomingCall { .. } => {
        // P2 対象外イベント: RawSIP バス経由での代替取得を推奨。
        // 現時点では発行なし（None）。
    }
}
```

**問題点**:
- `IceTransportError` の `call_id: _` が無視されている（`IceFailureInfo.call_id` が常に `None`）
- P2 イベントが単一の catch-all match arm にまとめられており、variant 個別のガイダンスコメントがない
- `IncomingCall` が P2 対象外に混入している（本来は P0）

#### 5. `convert_transport_state()` — 実装済みだが改善余地あり

`crates/siprs/src/runtime/reactor.rs:1119-1142`:

```rust
fn convert_transport_state(tp_id: i32, _tp_state: u32) -> Option<SipEventPayload> {
    match _tp_state {
        2 => Some(SipEventPayload::TransportConnected(TransportConnectedInfo { tp_id, kind: TransportKind::Udp, local_addr: None })),
        0 => Some(SipEventPayload::TransportDisconnected(TransportDisconnectedInfo { tp_id, kind: TransportKind::Udp })),
        _ => Some(SipEventPayload::TransportError(TransportErrorInfo {
            tp_id, kind: TransportKind::Udp,
            error: format!("transport state changed: {_tp_state}"),
        })),
    }
}
```

**問題点**:
- 3（ERROR）とその他未定義値をまとめて `TransportError` にしている
- `_tp_state` にアンダースコアプリフィックスがついているが使用している（warning が発生しないのは使用されているため）

#### 6. 既存テスト — 一部カバレッジあり

- `test_p2_events_ignored` — 5種の P2 イベント送信 → 出力なしを確認 ✅
- `test_transport_state_connected` — state=2 → TransportConnected ✅
- `test_ice_transport_error` — IceTransportError → IceNegotiationFailed ✅
- `test_multiple_native_events_sequential` — 複数 TransportStateChanged 連続処理 ✅

#### 7. 犯罪・スタブ点検

- Malfeasance scan: 0 crimes ✅
- Stubs scan: 該当なし ✅

## Background

P0 優先度の NativeEvent → SipEventPayload 変換（Registration/Call/DTMF 系）は M20-4 で完了済み。次の優先度として、運用観測・障害検知に必要な Transport/ICE 系イベント（P1）の変換を実装する。

現在の `convert_transport_state` は最低限動作するが、型安全でない（`tp_id: i32`）状態であり、TransportId newtype の導入が急務である。また、P2 対象外イベントの変換はコメントのみで実装されていないため、将来の拡張時にどこに何を追加すべきかが不明瞭である。

### TransportId newtype の設計判断

`AccountId` / `CallId` と同様の `NonZeroU64` ベース newtype とする。ただし、`TransportId` は PJSUA の `pjsua_transport_id`（`i32`）からの変換を伴うため、`from_raw(i32) -> Option<TransportId>` および `into_raw(self) -> u64` の両方向変換を提供する。`AccountId` 等と異なり `generate()` は提供しない。

## Scope

### 実装範囲（P1）

1. **`TransportId` newtype 定義** (`util/id.rs`):
   - `NonZeroU64` ベース
   - `from_raw(i32) -> Option<TransportId>`（負数・ゼロは `None`）
   - `into_raw(self) -> u64`
   - `Display` impl

2. **Info 構造体の `tp_id` フィールド変更** (`event.rs`):
   - `TransportConnectedInfo.tp_id: i32` → `TransportId`
   - `TransportDisconnectedInfo.tp_id: i32` → `TransportId`
   - `TransportErrorInfo.tp_id: i32` → `TransportId`
   - `event.rs` の use 宣言に `TransportId` 追加

3. **`convert_transport_state()` 改善** (`reactor.rs:1119-1142`):
   - 引数 `tp_id: i32` → `TransportId`
   - state 0=DISCONNECTED → `TransportDisconnected`
   - state 2=CONNECTED → `TransportConnected`
   - state 3=ERROR → `TransportError`
   - state 1=CONNECTING → `None`
   - 未知の state → `None`（安全側フォールバック）

4. **`IceTransportError` 変換改善** (`reactor.rs:924-931`):
   - `call_id: _` → `call_id` を解決し `IceFailureInfo` に設定
   - `resolve_runtime_account_id` 相当の解決ではなく、`state` から `get_call_by_native_id` で `CallId` を解決

5. **P2 対象外イベントの明示的ハンドリング** (`reactor.rs:932-940`):
   - 各 variant を個別の match arm に分割
   - 各 arm にコメントで代替取得手段を明記（日本語）

6. **`IncomingCall` の分離**: P2 対象外 catch-all から分離（M20-4 で未実装のため、コメント付きスタブとする）

### 実装範囲外

- PJSIP callback 側の `tp_id` 型変更（`NativeEvent` は `i32` のまま。変換は Reactor 層で行う）
- `TransportKind` の動的解決（現状は `TransportKind::Udp` ハードコードを維持）
- metrics カウンター配線（M19-3 で別途対応）

### ユニットテスト計画

#### convert_transport_state unit test（reactor.rs 内）

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| 1 | CONNECTED | tp_id=1, state=2 | `TransportConnected` |
| 2 | DISCONNECTED | tp_id=1, state=0 | `TransportDisconnected` |
| 3 | ERROR | tp_id=1, state=3 | `TransportError` |
| 4 | CONNECTING → None | tp_id=1, state=1 | `None` |
| 5 | 未知の state → None | tp_id=1, state=99 | `None` |

#### handle_native_event integration test（MockBackend）

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| 6 | TransportConnected publish | TransportStateChanged state=2 | SipEvent with TransportConnected |
| 7 | TransportDisconnected publish | TransportStateChanged state=0 | SipEvent with TransportDisconnected |
| 8 | TransportError publish | TransportStateChanged state=3 | SipEvent with TransportError |
| 9 | IceTransportError publish | IceTransportError call_id=1, status=500 | SipEvent with IceNegotiationFailed（call_id 解決済み） |
| 10 | P2 全 5 種 → 発行なし | 既存 `test_p2_events_ignored` 拡張 | いずれも publish されない |
| 11 | 未知の state → 発行なし | TransportStateChanged state=99 | publish されない |

#### TransportId unit test（util/id.rs）

| # | ケース | 入力 | 期待結果 |
|---|--------|------|----------|
| 12 | from_raw 正常値 | 42 | `Some(TransportId)` |
| 13 | from_raw 負数 | -1 | `None` |
| 14 | from_raw ゼロ | 0 | `None` |
| 15 | ラウンドトリップ | 42 → into_raw | 42 |

#### テスト不可能な項目（例外）

- PJSIP 実結合時の `pjsua_transport_id` が負数になるケース（PJSUA 内部仕様依存）

### 依存・関連チケットID

| チケット | 関係 | 内容 |
|----------|------|------|
| M17-3 | 依存（完了済み） | Callback bridge — NativeEvent 定義 |
| M20-4 | 依存（完了済み） | P0 変換実装（Registration/Call/DTMF） |
| M20-1.8 | 関連（完了済み） | PjsuaBackend シングルトン化 |
| M19-3 | 関連（未完了） | metrics カウンター配線（本チケットでは未対応） |

### Boy Scout Rule — 翻訳可能性計画

本チケットの実装範囲内で、以下を改善する：

1. **`convert_transport_state` の引数名修正**: `_tp_state` → `tp_state`（使用している変数にアンダースコアプリフィックスは不適切）
2. **P2 対象外イベントの match arm 分割**: 単一 catch-all を variant ごとに分割し、日本語コメントを付与
3. **`IceTransportError` の `call_id: _` 廃止**: 明示的な解決処理を実装

### 検証手順

```bash
make check-be   # コンパイル確認
make test       # テスト実行（既存 + 新規）
```

### Acceptance Criteria

- [ ] `TransportId` newtype が `util/id.rs` に定義され `util/mod.rs` から参照可能
- [ ] Info 構造体の `tp_id` が `TransportId` に変更済み
- [ ] `convert_transport_state()` が全 state を正しく変換
- [ ] `IceTransportError` の `call_id` が適切に解決される
- [ ] P2 対象外 5 種が個別 match arm + 日本語ガイダンスコメント付き
- [ ] `IncomingCall` が P2 catch-all から分離済み
- [ ] 既存テスト全件通過
- [ ] 新規テスト全ケース通過
- [ ] `cargo clippy -- -D warnings` 通過
