# RFC-ROOT

> 対象 RFC: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT.md
> 生成グラフ: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json

# クイックスタート（SipClient 初期化と最初のステップ）

トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- 確認済み内容は「トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード」。しかし `TransportConfig::udp(5060)` / `tcp(5060)` は存在するものの（`src/config/transport_ice_spec.rs:38-51`）、**`config.transports` は初期化時に一切処理されない**。`PjsuaBackend::initialize` は `_config` を無視して `ffi::backend_calls::initialize()` を呼ぶのみ（`src/runtime/backend.rs:576-587`）。クイックスタートの「トランスポートを設定した初期化」は実トランスポートを生成しない。
- `add_transport` も PJSIP に届かない。`PjsuaBackend::create_transport` は config を無視し、`pjsua_transport_create` に **null config** を渡す（`src/runtime/backend.rs:590-605`、`src/ffi/backend_calls.rs:55-62`）。ポート番号・UDP/TCP/TLS の選択が破棄される。
- **既定ビルドでは `SipClient::new` が実行時失敗**する。`CoreReactor::spawn` → `create_backend(...)?`（`src/runtime/reactor.rs:128`）が `pjsua-native`/`test-util` なしで `Err("SipClient requires the `pjsua-native` feature")` を返す（`src/runtime/backend_selection.rs:62-68, 77`）。
- **本番バックエンドがビルド不能**: `cargo build --features pjsua-native` は 39 エラー（bindgen 定数 `PJ_SUCCESS` 等の欠如、`pjsua_acc_config.registrar_uri` 欠如、`SecretString::expose_secret` 未実装、enum の constified モジュール未適用等）。

### 実装補強設計（完全記述への条件）

1. `Initialize` 時に `config.transports` を列挙し、`TransportConfig` の種別（UDP/TCP/TLS）とポートを `pjsua_transport_create` へ反映する配線を実装（新規チケット。現行の P3-2 / P11-10 は FFI 呼び出しの stub のみ）。
2. `pjsua-native` のビルド修復: bindgen の allowlist とコード期待の整合（`PJ_SUCCESS` 等の定数、`pjsua_acc_config.registrar_uri`、`SecretString::expose_secret`、`pjsip_inv_state` / `pjsua_call_media_status` の constified enum モジュール）。（P8-16 / P10-2 / P11-5 / P13-4）
3. STUN 設定を PJSIP へ反映（`pjsua_config.stun_srv`）。→ H15 の補強設計と共通。

# ClientConfig の設定項目（transports・STUN/TURN・音声・タイムアウト）

ClientConfig の全フィールド（transports, stun_servers, turn_servers, ice, audio, timeouts, raw_sip_events）を既定値と併せて表形式で解説

`ClientConfig` は `SipClient::new` に渡す初期化設定です（RFC §10 / P15-2 で一本化された唯一の公開設定型）。全フィールドと既定値は以下のとおりです。

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `user_agent` | `String` | `"tauri-siprs/0.1"` | SIP `User-Agent` ヘッダ |
| `log_level` | `LogLevel` | `Info` | ログレベル |
| `max_calls` | `usize` | `32` | 同時通話数の上限 |
| `event_bus_capacity` | `usize` | `2048` | イベントバス（control）容量 |
| `raw_sip_event_capacity` | `usize` | `4096` | raw SIP イベント容量 |
| `audio` | `ClientAudioConfig` | 16kHz / i16 / ステレオ / 20ms フレーム（pair_align 120ms・jitter 60ms・mixer 20ms・max_sources 16） | 音声フォーマットとバッファ設定 |
| `transports` | `Vec<TransportConfig>` | `[udp(5060), tcp(5060)]` | SIP トランスポート一覧 |
| `stun_servers` | `Vec<StunServerConfig>` | `[]` | STUN サーバ一覧 |
| `turn_servers` | `Vec<TurnServerConfig>` | `[]` | TURN サーバ一覧 |
| `ice` | `IceConfig` | enabled=true / aggressive_nomination=true / max_host_candidates=16 | ICE 設定 |
| `raw_sip_events` | `RawSipEventConfig` | enabled=true / max_body_bytes=64KiB / 機微ヘッダ redact | raw SIP イベント購読設定 |
| `timeouts` | `TimeoutConfig` | 登録 10s / 応答 15s / DTMF 15s / シャットダウン 90s | 各種タイムアウト |

> **注意（現在の実装状態）**: `transports` / `stun_servers` / `turn_servers` / `ice` は現時点では**設定サーフェスのみ**です（reactor の状態には記録されますが、実 PJSIP のトランスポート生成・STUN/TURN/ICE 適用には未接続。H15 参照）。また実 SIP 通信には `pjsua-native` feature が必要ですが、現在この feature はビルド不能です（`cargo build --features pjsua-native` が 39 エラー）。既定 feature ビルドでは `SipClient::new` が `"SipClient requires the pjsua-native feature"` で失敗します。設定の構築・既定値・バリデーションは `make test`（`--features test-util` の TestBackend）上で検証可能です。

# 初期化のバリデーション規則とエラー処理

§42 のバリデーション規則（event_bus_capacity>=16、sample rate 制限、raw_sip 容量制約等）と失敗時の SipError 処理をコード付きで解説

`ClientConfig::validate()` は `SipClient::new` の冒頭で fail-fast 実行され、不正な設定はバックエンド起動前に `Err(InvalidConfig)` として拒否されます（RFC §42 / P15-2）。`add_account` も同様に `AccountConfig::validate()` を実行します。

主なバリデーション規則:

| 規則 | 内容 |
|---|---|
| `event_bus_capacity >= 16` | イベントバス容量は最小 16 |
| `raw_sip_event_capacity >= event_bus_capacity` | raw_sip 有効時はイベントバス容量以上 |
| `max_calls > 0` | 同時通話数は 1 以上 |
| トランスポートが 1 以上 | `transports` は空にできない |
| サンプルレート | `audio.default_delivery_format.sample_rate` は 8 / 16 / 24 / 48kHz のいずれか |

```rust
use siprs::{ClientConfig, SipClient, SipErrorKind};

let mut config = ClientConfig::default();
config.event_bus_capacity = 8; // 16 未満 → バリデーション失敗

let result = SipClient::new(config).await;
assert!(matches!(result, Err(e) if e.kind == SipErrorKind::InvalidConfig));
```

エラーは `SipError` で返されます。`SipError` は `kind: SipErrorKind` と `native_status: Option<i32>` を保持し、PJSIP 由来の失敗では `native_status` に PJ ステータス（`PJ_SUCCESS`=0 等）が入ります（§62.8 / P15-9）。

> **注意**: サンプルレート規則は `audio.default_delivery_format.sample_rate`（既定配信フォーマット）にのみ適用されます。バリデーションはバックエンド起動前に行われるため、既定ビルドでも検証できます。実 SIP の初期化には `pjsua-native` feature が必要ですが、現在ビルド不能です（H2 参照）。

# アカウントの追加と設定更新（add_account / update_config）

add_account の最小コードと、update_config(AccountConfigPatch) による設定更新および更新時に走る register/unregister の挙動を併せて解説

`SipClient::add_account` でアカウントを追加し、`SipAccountHandle` を取得します（RFC §11 / §17）。

```rust
use siprs::{AccountConfig, SipClient};

let config = AccountConfig::default();
let account = client.add_account(config).await?; // SipAccountHandle
assert_eq!(account.registration_state().await?, RegistrationState::Disabled);
```

追加直後の登録状態は `Disabled` です（§17 / P15-5）。`update_config` で設定を更新できます。

```rust
use siprs::config::account_config_spec::AccountConfigPatch;

let patch = AccountConfigPatch {
    register_on_start: Some(true), // 更新後に再登録を走らせる
    ..AccountConfigPatch::default()
};
account.update_config(patch).await?;
```

**更新時の register / unregister の挙動（C026）**: `update_config` は、パッチが `register_on_start: Some(enabled)` を明示的に運ぶ場合に限り、設定更新後に `set_registration(native_id, enabled)` を発行します。`Some(true)` は `Registering`、`Some(false)` は `Unregistering` へ遷移します。パッチが `register_on_start` を含まない（`None`）場合は**登録状態は変化しません**（テスト `update_config_preserves_registration_state` で固定）。

> **注意**: `register_on_start` は現時点では「update_config 時のデルタ」としてのみ消費されます。`add_account` 時・クライアント起動時の自動登録はまだ実装されていません（P15-5 の未完了項目）。実 SIP の登録には `pjsua-native` feature が必要ですが、現在ビルド不能です。上記コードは `make test`（TestBackend）上で検証可能です。

# 登録と登録解除（register / unregister / set_registration_enabled）

register() / unregister() / set_registration_enabled() の使い分けと、register_on_start による自動登録設定を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `register()` / `unregister()` / `set_registration_enabled()` は存在し、`RuntimeCommand::SetRegistration` を submit する（`src/api/public_api_design.rs:56-112`）。reactor の `SetRegistration` アームは `backend.set_registration` + 状態遷移（`Registering`/`Unregistering`）を実行する（`src/runtime/reactor.rs:678-731`）。
- しかし確認済み内容の**「register_on_start による自動登録設定」は現コードに存在しない**。`register_on_start` は `update_config` のパッチデルタとしてのみ消費され（`src/runtime/reactor.rs:610`）、`add_account` 時・`SipClient::new` 時・reactor 起動時には一切読まれない。`PjsuaBackend::add_account` も `pjsua_acc_add` に `register_on_acc_add` を設定しない（`src/ffi/backend_calls.rs:68-100`）。P15-5 も「AddAccount での自動登録は将来チケット」と明記（`specs/P15-5.md:91`）。
- **登録結果イベントが本番で publish されない**: 本番が publish するのは `RegistrationStateChanged` のみ（`src/runtime/reactor.rs:990-993`、`src/state/registr_wiring.rs:53-88`）。`RegistrationSucceeded` / `RegistrationFailed` は enum に定義されるが、`#[cfg(test)]` 内でしか構築されない（`src/api/event_model_payload_bus.rs:544-579`）。
- 参照例 `examples/account_register.rs:79-87` は `RegistrationSucceeded` / `RegistrationFailed` を待つため、**本番ではタイムアウトまで待機して失敗する**（壊れた例）。

### 実装補強設計（完全記述への条件）

1. `register_on_start` の自動登録を実装（`add_account` 時 / クライアント起動時のアカウント復元で消費。P15-5 の未完了項目、`specs/P15-5.md:91`）。
2. README / 例が待つイベントを `RegistrationStateChanged` に統一し、`examples/account_register.rs` を修正（`RegistrationSucceeded`/`Failed` は API 互換用に留保、`specs/P15-5.md:92`）。
3. 実 REGISTER の成否を状態機械（`Registered` / `Failed`）へ反映する経路を `pjsua-native` 上で配線（本番バックエンドのビルド修復が前提、H1 参照）。

# 登録状態の参照（registration_state と RegistrationState）

registration_state() の呼び出しと、RegistrationState（Disabled/Idle/Registering/Registered/Unregistering/Failed/Expired）の各状態の意味を表形式で解説

`SipAccountHandle::registration_state()` で現在の登録状態を取得します（RFC §17 / P15-5）。

```rust
use siprs::{RegistrationState, SipClient};

let state = account.registration_state().await?;
match state {
    RegistrationState::Registered => println!("registered"),
    RegistrationState::Registering => println!("registering..."),
    _ => println!("{state:?}"),
}
```

`RegistrationState` は以下の 7 状態を持つ enum です。

| 状態 | 意味 |
|---|---|
| `Disabled` | 登録が無効（アカウント追加直後の初期状態） |
| `Idle` | 登録は有効だが未試行 |
| `Registering` | REGISTER 送信中・応答待ち |
| `Registered` | レジストラへの登録成功 |
| `Unregistering` | UNREGISTER 送信中・応答待ち |
| `Failed` | 直前の登録試行が失敗 |
| `Expired` | 登録期間が期限切れ |

状態遷移は §17.1 の遷移表（`registr_state_machine.rs`）で検証されます。TestBackend 上では、`register()` → `Registering`、ネイティブ成功イベント → `Registered`、ネイティブ 4xx → `Failed` が観測できます。

> **注意**: `Expired` は enum 上は定義されていますが、現在**実イベント源が未配線**です（P15-5 の未完了項目）。実フローで `Expired` が発火することはまだありません。実 SIP の登録には `pjsua-native` feature が必要ですが、現在ビルド不能です。

# アカウントの取得・一覧・削除（account / accounts / remove_account）

remove_account(id) の呼び出しと、削除時に走る unregister の挙動・関連イベントを併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `account(id)` / `accounts()` / `remove_account(id)` は存在する（`src/client.rs:225-237, 269-329`）。`remove_account` は `AccountNotFound` で fail-fast し、reactor の `RemoveAccount` アームが `backend.remove_account` + `ClientState` からの除去を実行する（`src/runtime/reactor.rs:648-677`）。
- しかし確認済み内容の**「削除時に走る unregister の挙動・関連イベント」は存在しない**。reactor の `RemoveAccount` アームに `set_registration(false)` / unregister 手順はなく、`TestBackend::remove_account` はエントリ削除のみ（`src/runtime/backend.rs:288-291`）、`PjsuaBackend` は `pjsua_acc_del` へ委譲するだけ（`src/ffi/backend_calls.rs:104-107`）。ドメイン層で観測可能な `Unregistering` 遷移や unregister イベントは発生しない。
- **`AccountRemoved` イベントは本番で一切 publish されない**。enum に定義される（`src/api/event_model_payload_bus.rs:377`）が、非テストコードでの構築箇所はゼロ。

### 実装補強設計（完全記述への条件）

1. `remove_account` 時に unregister を先行実行し、その成否を反映する手順を reactor に実装（新規チケット。既存チケットなし — ギャップ）。
2. `AccountRemoved` イベントを実バックエンド経由で publish（§15.1 の account 系イベント配線）。
3. または README を検証可能な挙動に限定（「remove_account は一覧から除去する。イベントは emit しない」）とする選択肢も、実装補強ではなく記述範囲の縮小として併記する。

# イベントの購読と受信（subscribe / subscribe_account / subscribe_raw_sip）

subscribe() / subscribe_account(id) / subscribe_raw_sip() の 3 つの購読方法の違いと、購読解除（unsubscribe）の方法、SipEventPayload の主要バリアントの受信コードを解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `SipClient` は単一 `EventBus` を所有し（`src/client.rs:61, 112-115`）、reactor は別バスを持たない（P15-4）。`subscribe()`（`client.rs:192-194`）と `subscribe_account(id)`（`client.rs:201-209`、`meta.account_id` フィルタは `src/api/eventbus_receiver.rs:140`）は単一バス上で動作する。
- しかし確認済み内容の**「subscribe_raw_sip() の受信コード」は dead code**。`subscribe_raw_sip()` はチャネルを返す（有効時 `Some`、`src/client.rs:213-217`）が、**`publish_raw_sip` の呼び出し箇所はコードベース全体でゼロ**。raw SIP メッセージは一切 publish されない（P0-5 が raw SIP 解析を先送り、`specs/P0-5.md:118`）。
- **`unsubscribe` API は存在しない**。購読解除は broadcast `Receiver` の drop のみ（明示 API なし）。
- **P1/P2 系のイベントバリアントは一切発火しない**。`TransportStateChanged` / `IceTransportError` / `CallTsxStateChanged` / `CallRedirected` / `CallTransferStatus` / `CallReplaced` / `NatDetected` はすべて `None` を返す（`src/state/m20_native_event_conv.rs:184-201`）。「主要バリアントの受信コード」と謳えるのは P0 系 + ライフサイクル/エラーに限られる。
- **本番 FFI イベント経路が未接続**: PJSIP コールバックは lock-free キューへ push する（`src/ffi/callback.rs:36, 63-74`）が、**このキューをドレインするコードが存在しない**（P12-7 が「ブリッジ↔reactor 接続は P8-21 のスコープ」と明記、`specs/P12-7.md:127`）。

### 実装補強設計（完全記述への条件）

1. raw SIP パブリッシャを実装し、`RawSipMessage` を `publish_raw_sip` へ供給（P0-5 / P9-4 のスコープ）。
2. FFI コールバックキューのドレインを `RuntimeHandle::enqueue_native_event` 経由で reactor へ接続（P8-21、`specs/P12-7.md:127`）。
3. 購読解除は drop ベースである旨を README に明記（RFC §8.3 / P15-6 の設計判断）。明示 unsubscribe API は追加しない。
4. P1/P2 イベントの M20 変換器を `Some()` 化（本番コールバックからの発火に必要）。

# 発信（make_call と OutgoingCallRequest）

make_call の最小コード（target_uri のみ指定）と、発信後のキャンセル（hangup）方法を併せて解説

`SipAccountHandle::make_call` で発信します。`OutgoingCallRequest` は RFC §8.5 の全フィールドを明示的に指定します（`Default` 実装はなく、全フィールド必須です）。

```rust
use siprs::{CallId, OutgoingCallRequest, CallMediaPreferences, HangupReason, SipClient};

let request = OutgoingCallRequest {
    target_uri: "sip:bob@example.com".to_string(),
    headers: vec![],                              // 追加 SIP ヘッダ
    auth_override: None,                          // 認証上書きなし
    preferred_transport: None,                    // トランスポート指定なし
    media: CallMediaPreferences::default(),       // メディア設定
    auto_answer_refer: true,                      // REFER 自動応答
};
let call_id_u64 = account.make_call(request).await?; // u64 を返す

// u64 → CallId 変換（CallId::from_u64 は 0 を拒否）
let call_id = CallId::from_u64(call_id_u64)?;

// 発信後のキャンセル（終話）
client.hangup(call_id, HangupReason::LocalUser).await?;
```

`hangup` は reactor 経由でバックエンドへ dispatch され、`CallDisconnected` イベントを publish します（P15-6）。

> **注意**: `make_call` は `SipAccountHandle` 上のメソッドで、戻り値は `u64`（`CallId` ではありません）。実 SIP の発信（INVITE 送信・`OutgoingCallStarted → Ringing → Connected` のイベント系列）には `pjsua-native` feature と実 PJSIP コールバックが必要ですが、現在ビルド不能です。上記コードは `make test`（TestBackend）上で検証可能です。

# 着信と応答（IncomingCall と answer）

IncomingCall イベントの受信から answer(code) による応答、reject（486/603）による切断までの一連のコードを解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `SipClient::answer(call_id, code)` は存在し、`validate_answer_code` が `[180, 183, 200, 486, 603]` を受理する（`src/client.rs:378`、`src/api/call_api_semantics.rs:42-50`）。reject（486/603）は `CallDisconnected` を publish する（`src/runtime/reactor.rs:1144`）。**ただし `IncomingCall` イベントは `pjsua-native` の `on_incoming_call` コールバックでのみ生成される**（`src/ffi/callback.rs:120-125`）。TestBackend（`make test`）では `IncomingCall` は一切発火せず、確認済み内容の一連のコード（受信 → 応答 → 拒否）を実演できない。
- **着信 call は `ClientState.calls` に登録されない**: 非テストの `calls.insert` は `handle_make_call` のみ（`src/runtime/reactor.rs:1108`）。`NativeEvent::IncomingCall` は `CallDirection::Incoming` を記録するだけ（`src/runtime/reactor.rs:998-1003`）。→ `calls()` に着信が現れず、`call_state(call_id)` は `Err(CallNotFound)`。さらに `answer(call_id, 200)` は `handle_answer` で `CallEntry` を解決できず `account_id = None` となり、**`CallConnected` が publish されない**（`src/runtime/reactor.rs:1139` の `(200, Some(_))` アームに不一致）。
- `SipCall` のドキュメントは「`SipClient::make_call()` または `SipClient::answer_call()` で生成」と述べるが、`make_call` は `SipAccountHandle` 上、`answer_call` は不在（ドキュメント偽り）。

### 実装補強設計（完全記述への条件）

1. 着信 INVITE に対する `CallEntry` の登録（`IncomingCallInfo` から `ClientState.calls` へ追加）を実装（P15-6 / P12-8 を拡張する新規チケット）。
2. `handle_answer` が `IncomingCallInfo` から account を解決し、200 応答で `CallConnected` を publish するよう修正。
3. `pjsua-native` のビルド修復後、`on_incoming_call` → `IncomingCall` イベント → reactor 処理の経路を統合テストで固定。

# 通話イベントと状態遷移（CallState の購読と判定）

OutgoingCallRinging / CallConnected / CallRejected / CallDisconnected 等の通話イベント受信と、CallState（§18）との対応を解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **`CallRejected` は一切生成されない**。enum には存在する（`src/api/event_model_payload_bus.rs:345`）が、reject 経路（486/603）は `CallDisconnected` を publish する（`src/runtime/reactor.rs:1144`）。確認済み内容の「`CallRejected` の受信」は事実と異なる。
- `OutgoingCallStarted` / `Trying` / `Ringing` / リモート `CallConnected` / `CallDisconnected` は `NativeEvent::CallStateChanged` 経由でのみ生成される（`src/state/m20_callstate_mapping.rs:109-122`、`src/ffi/callback.rs:167`）— すなわち **`pjsua-native` 専用**。TestBackend では `make_call` はイベントを一切 publish しない（`handle_make_call` は登録のみ）。
- `convert_call_state` は PJSIP inv_state の 5 状態（NULL/CALLING/CONNECTING/CONFIRMED/DISCONNECTED）のみをマップする（`src/state/m20_callstate_mapping.rs:76-98`）。`CallState` 13 状態の全遷移（Trying / Ringing / EarlyMedia / Active / Held / Disconnecting 等）には対応しない。
- `CallHeld` / `CallResumed` は `CallMediaStateChanged` 経由（`src/state/m20_callstate_mapping.rs:125-139`）で、13 状態マッピングとは別系統。

### 実装補強設計（完全記述への条件）

1. `CallRejected` を生成するか、記述を「reject は `CallDisconnected` で観測される」へ修正する設計判断を確定（P15-6）。
2. M20 変換器で `CallState` 全遷移を `Some()` 化し、`meta.call_id` 付与で publish（P12-8）。
3. `pjsua-native` のビルド修復後、実 PJSIP コールバックからのイベント系列を統合テスト（TestBackend + 注入）で固定。

# DTMF 送受信（send_dtmf と DtmfSent / DtmfReceived）

send_dtmf(digits, method) の呼び出しと、DtmfMethod（Inband / SipInfo / Rfc4733）の使い分け、DtmfSent / DtmfReceived イベントの受信を解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **`SipInfo` という `DtmfMethod` バリアントは存在しない**。実装は `Info`（`src/config/account_config_spec.rs:35-40`）。確認済み内容の「Inband / SipInfo / Rfc4733」は名称誤り。
- **`DtmfMethod` が 3 箇所に重複定義**され、バリアント集合も不一致: `account_config_spec.rs:35`（Rfc2833/Rfc4733/Info/Inband）、`observability_metrics.rs:250`（Rfc2833/Info/Inband）、`m20_dtmfsent_twophase.rs:57`（Rfc4733/Info/Inband）。
- **`method` は PJSIP 送信に一切影響しない**: `backend_calls::send_dtmf(native_call_id, digits)` は digits のみを受け取る（`src/ffi/backend_calls.rs:194`）。「DtmfMethod の使い分け」の記述は実装と矛盾する（method はタイムアウトイベントのメタデータ装飾のみ）。
- **`DtmfSent { Ok }` は一度も publish されない**: publish されるのは桁ごとの `Err(Timeout)` のみ（`src/api/m20_dtmfsent_twophase.rs:99-114`）。送信完了コールバックが存在しない。
- `DtmfReceived` は `pjsua-native` の `on_dtmf_digit` コールバック専用（`src/ffi/callback.rs:213`）で、TestBackend では発火しない。

### 実装補強設計（完全記述への条件）

1. `DtmfMethod` の定義を一元化し、名称を RFC 準拠（Inband / Info / Rfc4733）に統一（P11-6 / P7-2）。
2. `method` を実 PJSIP 送信（`pjsua_call_send_dtmf` / `pjsua_call_dial_dtmf`）へ反映し、「使い分け」を実装として成立させる。
3. `DtmfSent { Ok }` の publish 経路を実装するか、「観測可能なのは Timeout のみ」と明記する設計判断を確定（P11-6）。

# 音声ストリームの取得（subscribe_audio と AudioChunkPair）

AudioFormat（ビット深度・サンプルレート・チャンネル）とストリームデータの対応を解説し、指定 bit/hz のステレオ WAV ファイルへ書き出す方法まで示す

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `subscribe_audio(call_id, format, capacity, mode)` は存在し、`AudioTapHandle::recv()` は `Option<AudioChunkPair>` を返す（`src/client.rs:483-489`、`src/api/audio_subscribe_bp.rs:113-123`）。`AudioChunkPair` / `ChannelLayout::StereoInOut`（L=IN / R=OUT）/ `AudioFormat` は公開型として一致する（`src/model/audio_format_chunkpair.rs`）。
- しかし **`push_media_frame` を呼ぶ生産コードが存在しない**。`SipBackend::push_media_frame` は trait に定義され（`src/runtime/backend.rs:143-147`）、TestBackend は記録のみ（`backend.rs:455-462`）、PjsuaBackend は tap への push を実装するが（`backend.rs:940-960`）、**どのランタイム経路も呼ばない**。conf port のメディアコールバック（`pjsua_conf_set_callback` / `put_frame`）は P15-7 で明示的に先送り（`specs/P15-7.md:111-114`）。→ `AudioTapHandle::recv()` は実運用で**永久待機**する。
- **WAV 書き出しユーティリティは存在しない**: `src/` / `examples/` / `tests/` に WAV / RIFF ヘッダ関連のコードはゼロ。確認済み内容の「指定 bit/hz のステレオ WAV ファイルへ書き出す方法」は実装根拠なし（未検証の手書きライタを README に記載せざるを得ない）。
- 参照例 `examples/audio_tap.rs:41` は `while let Some(pair) = tap.recv().await` で**ブロックし続ける**。

### 実装補強設計（完全記述への条件）

1. conf port の FFI メディアコールバック（`pjsua_conf_set_callback` / `put_frame`）を実装し、`SipBackend::push_media_frame` へ接続（P15-7 Layer 3+。現行のスコープ外明記を解消）。
2. `pjsua-native` のビルド修復（H1 参照）後、実メディアコールバックで tap を駆動し、`AudioChunkPair` が連続生産されることを統合テストで固定。
3. `AudioChunkPair` → WAV 変換（bit depth / sample rate / channel 対応）のユーティリティを実装（新規チケット。`specs/P8-8.md` / `P8-23.md` は存在しない — 欠落）。

# 音声の注入（AsyncAudioSource と add_audio_source）

2 者通話における IN / OUT / BOTH チャネルへの音声ファイル・ストリーム注入方法と、マイク入力 source の取得（open_default_microphone_source）を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `add_audio_source(call_id, source, channels)` は存在し、`call_id` と `ChannelSelector`（In/Out/Both）を受け取り、per-call `AudioMixer` へ登録する（`src/client.rs:515-520`、`src/runtime/reactor.rs:268-308`）。`AudioWorkerTask::spawn` も reactor の生産経路で呼ばれる（`src/runtime/reactor.rs:284-289`）。
- しかし **mix 結果を消費する経路が存在しない**: `AudioWorkerInner::process_frame` は `out_queue` / `in_queue` へ push する（`src/runtime/audio_worker.rs:506-514`）が、**これらのキューを pop するコードはゼロ**。RT 消費側（RustMediaPort → ネットワーク送信 / ローカル再生）が存在しない。`make_call` / `answer` は `conf_connect` を呼ばない（`src/runtime/reactor.rs:1099-1124`）。`conf_connect` は公開 API からも露出していない。
- **「音声ファイル」source の実装がない**: ファイルベースの `AsyncAudioSource` は存在せず、唯一の例は mpsc チャネルの `TtsStreamSource`（`examples/tts_source.rs:34-51`）。
- **`open_default_microphone_source` は「通話のマイク入力」ではない**: cpal による OS 既定入力デバイスの独立キャプチャであり（`src/api/asyncaudiosrc_adapter.rs:312-338`）、`add_audio_source` で注入する source の一種。2 者通話のマイク入力として記述すると事実と矛盾する。

### 実装補強設計（完全記述への条件）

1. `out_queue` / `in_queue` を消費する実 conf port コンシューマ（RustMediaPort）を実装し、メディアをネットワーク送信 / ローカル再生へ接続（P15-7 Layer 3+ / RustMediaPort）。
2. `make_call` / `answer` の call connect 時に `conf_connect` を実行し、メディア経路を確立。
3. ファイル / WAV ベースの `AsyncAudioSource` を実装（新規チケット）。
4. `open_default_microphone_source` を「注入可能なキャプチャ source」として README に明記し、通話マイクとの混同を排除。

# STUN/TURN/ICE とトランスポート設定

ClientConfig への stun_servers / turn_servers / ice の設定方法と、TransportConfig（UDP/TCP/TLS）の選択を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- 型の一本化は実現している: 単一の `StunServerConfig`（`src/config/transport_ice_spec.rs:151-154`）、`TurnServerConfig`（`:170-179`）、`IceConfig`（`:117-144`）。P15-2 が旧重複を除去し `stun_servers` / `turn_servers` を Vec 化した（`specs/P15-2.md:53, 68`）。
- しかし **`ClientConfig` の STUN/TURN/ICE 値は PJSUA 設定へ一切反映されない**。`ffi::backend_calls.rs:32` の `pjsua_config` はゼロ初期化され `cb`（コールバック）のみ設定される。`src/ffi/` / `src/runtime/backend.rs` / `src/build/` 全体で `stun_srv` / `turn_cfg` / `media_ice` への参照はゼロ。`PjsuaBackend::initialize` は `_config` を無視（`src/runtime/backend.rs:576-587`）。
- **トランスポート選択も PJSIP に届かない**: `pjsua_transport_create` は null config で呼ばれ（`src/ffi/backend_calls.rs:55-62`）、UDP/TCP/TLS の種別とポートは破棄される。TestBackend では `ClientState` の状態記録のみ（`src/runtime/reactor.rs:752-759`）。
- 本番（`pjsua-native`）はビルド不能（39 エラー）。

### 実装補強設計（完全記述への条件）

1. `ClientConfig.stun_servers` → `pjsua_config.stun_srv`、`turn_servers` → `pjsua_config.turn_cfg`、`ice` → media ICE 設定へ反映する配線を実装（新規チケット）。
2. `TransportConfig` を `pjsua_transport_create` へ反映（種別 + ポート、H1 と共通）。
3. `pjsua-native` のビルド修復（H1 参照）。

# シャットダウン

shutdown() の呼び出しコードと、その際のイベント（ClientShutdown）の受信、べき等性の説明を解説

`SipClient::shutdown()` でクライアントを安全に終了します（RFC §32 / P15-8）。

```rust
client.shutdown().await?;
```

`shutdown()` はべき等です（`is_terminated()` ガードにより二重実行しても安全。テスト `sip_client_shutdown_is_idempotent` で固定）。reactor は §32 の完全手順を `ShutdownSpec.execute_sequence` として実行します。

1. コマンド受付停止（StopCommands）
2. 全通話の終了（CancelCalls）
3. 全アカウントの登録解除（UnregisterAccounts）
4. 音声バッファの破棄（DrainAudio）
5. PJSIP スタック破棄（InvokeDestroy）

シャットダウン完了時に `SipEventPayload::ClientShutdown` がイベントバスへ publish されます。

```rust
// ClientShutdown の受信
let mut events = client.subscribe();
client.shutdown().await?;
while let Ok(event) = events.recv().await {
    if matches!(event.payload, SipEventPayload::ClientShutdown) {
        println!("shutdown complete");
        break;
    }
}
```

> **注意**: 手順 1〜4 は TestBackend 上で検証可能です。手順 5 の実 `pjsua_destroy` は `pjsua-native` feature 配下にあり、現在ビルド不能なため実機では未検証です。

# REST/WebSocket API（siprs-server クレートとの境界）

クライアントライブラリの README には含めず、siprs-server の README に委ねる旨を記載

本 README は **siprs クライアントライブラリ** の利用方法を解説します。REST / WebSocket API による SIP 制御・イベント配信・音声ストリーミングは、**別クレート `siprs-server`** の責務です。

RFC §52.1 の設計判断により、siprs 自体には Axum 等の HTTP 依存は一切追加されず、`server` feature も定義されません。HTTP/WebSocket API を利用する場合は、`crates/siprs-server` クレートのドキュメントを参照してください。

# Examples (implementation samples) spec and design

<::EXAMPLES-RESIDUE::>
## EXAMPLES-RESIDUE — 完全な examples 設計の作成不可

### 証拠（欠落・危険・矛盾）

READ ME の 17 セクション中 10 セクション（H1 / H5 / H7 / H8 / H10 / H11 / H12 / H13 / H14 / H15）が RESIDUE であり、Examples が「単一実装例に全セクションを統合し、確実に動作する」ことは、その前提たる機能実装が未完了のため成立しない。

- **本番バックエンドがビルド不能**: `cargo build --features pjsua-native` は 39 エラー（bindgen 定数 `PJ_SUCCESS` 等の欠如、`pjsua_acc_config.registrar_uri` 欠如、`SecretString::expose_secret` 未実装、`pjsip_inv_state` / `pjsua_call_media_status` の constified enum 未適用等）。→ 実 SIP 通信を伴う example は成立しない。
- **既定ビルドでは `SipClient::new` が実行時失敗**: `cargo run --example client_init` は `"failed to spawn reactor: backend error: SipClient requires the `pjsua-native` feature"` で即失敗（`src/runtime/backend_selection.rs:62-68`）。examples はコンパイル可能だが、既定ビルドではどの example も起動できない。
- **TestBackend（`--features test-util`）では `client_init` のみ完走**: `cargo run --example client_init --features test-util` は `ClientInitialized` 受信まで成功する。しかし他の example は以下で失敗する。
- **account_register は確実に失敗する**: `examples/account_register.rs:79-87` は `RegistrationSucceeded` / `RegistrationFailed` を待つが、本番が publish するのは `RegistrationStateChanged` のみ（`src/runtime/reactor.rs:990-993`、`src/state/registr_wiring.rs:53-88`）。`RegistrationSucceeded` / `Failed` は `#[cfg(test)]` 内でのみ構築される（`src/api/event_model_payload_bus.rs:544-579`）。30 秒の `REGISTRATION_TIMEOUT` 後にタイムアウト失敗する（H5 参照）。
- **make_call もイベント待ちで失敗する**: `examples/make_call.rs` は `OutgoingCallRinging` / `CallConnected` / `CallRejected` を待つが、`CallRejected` は一切生成されず（H11 参照）、`OutgoingCallRinging` / `CallConnected` は `pjsua-native` のコールバック専用（`src/state/m20_callstate_mapping.rs:109-122`、`src/ffi/callback.rs:167`）。TestBackend では発火しない。
- **audio_tap は永久待機する**: `subscribe_audio` は `AudioTapSender` を tap レジストリへ登録するが、`push_media_frame` を呼ぶ生産コードが存在しない（`src/runtime/backend.rs:143-147`、P15-7 が conf-port コールバックを先送り）。`AudioTapHandle::recv()` はブロックし続ける（H13 参照）。
- **tts_source は音声が流れない**: `AudioWorkerInner::process_frame` は `out_queue` / `in_queue` へ push するが、pop する消費経路が存在しない（`src/runtime/audio_worker.rs:506-514`）。メディアは `conf_connect` されない（H14 参照）。

### 実装補強設計（Examples が完全記述になるための条件）

#### 前提: 各 README セクションの RESIDUE 解消

Examples が「確実に動作する」には、以下が先に実装される必要がある（チケット化の素材。各セクション RESIDUE を参照）。

1. **本番バックエンドのビルド修復**: `pjsua-native` の 39 エラー解消（bindgen allowlist とコード期待の整合、`pjsua_acc_config.registrar_uri`、`SecretString::expose_secret`、constified enum モジュール）。チケット: `P8-16` / `P10-2` / `P11-5` / `P13-4`。
2. **トランスポート / STUN/TURN/ICE の実配線**: `config.transports` の自動生成と `pjsua_transport_create` への反映、`stun_servers` / `turn_servers` / `ice` の `pjsua_config` への反映（H1 / H15）。
3. **イベント経路の完成**: FFI コールバックキューのドレイン（P8-21）、raw SIP パブリッシャ（P0-5 / P9-4）、`RegistrationStateChanged` への統一（P15-5）。
4. **着信 / 通話イベントの完成**: 着信 `CallEntry` 登録と `answer(200)` → `CallConnected` の publish（P15-6 / P12-8）、`CallRejected` の生成か記述修正（P15-6）。
5. **DTMF の完成**: `DtmfMethod` 一元化と実 PJSIP 送信への反映、`DtmfSent { Ok }` 経路（P11-6）。
6. **メディア経路の完成**: conf-port メディアコールバック → `push_media_frame`、`out_queue` / `in_queue` の消費（P15-7 Layer 3+）、WAV / ファイル source の実装。

#### Examples 設計（実装後に完全記述化する目標）

5 つの例バイナリ（`examples/common/cli.rs` の CLI パースと `examples/common/client.rs` の add_account ヘルパーを共通利用）を、各 README セクションの契約に沿って再定義する。

**E1. client_init（RFC §41.1 / H1-H3）**
- 契約: 前 `ClientConfig` がバリデーション通過（§42）／後 `SipClient::new` が `Ok` を返し `ClientInitialized(ClientCapabilities)` が publish される／不変: 初期化失敗は fail-fast `Err(InvalidConfig)`。※ TestBackend 上では現に完走（検証済み）。
- テスト: `SipClient::new` 成功・`ClientInitialized` 受信・不正 config で `InvalidConfig`。

**E2. account_register（RFC §41.2 / §17 / H4-H6）**
- 契約: 前 `register_on_start` または明示 `register()` が submit される／後 `RegistrationState` が `Registered` へ遷移し、`RegistrationStateChanged` が受信できる／不変: 未登録時は `Disabled`。
- テスト: 登録成功・失敗（4xx）、`unregister()` で `Unregistering → Idle`、タイムアウト時の `Failed`。

**E3. make_call（RFC §41.3 / §18-19 / H9-H11）**
- 契約: 前 `OutgoingCallRequest` の全 6 フィールドが検証通過／後 `make_call` が実 `CallId`（u64）を返し、`CallConnected`（または `CallDisconnected`）が `meta.call_id` 付きで受信できる／不変: reject（486/603）は `CallDisconnected` で観測。
- テスト: 発信成功・拒否（486/603）・`hangup` での切断、イベント順序。

**E4. audio_tap（RFC §22 / §21 / H13）**
- 契約: 前 `subscribe_audio(call_id, format, capacity, mode)` が有効な tap を返す／後 `AudioChunkPair`（L=IN / R=OUT）が交渉済み `AudioFormat` で連続生産される／不変: `Realtime` は最古破棄、`Lossless` は producer ブロック（§22.1）。
- テスト: フレーム連続生産・フォーマット一致・backpressure 両モード・`AudioChunkPair` → 指定 bit/hz のステレオ WAV 変換。

**E5. tts_source（RFC §23-24 / §41.5 / H14）**
- 契約: 前 `AsyncAudioSource::next_chunk` が 20ms フレームを返す／後 `add_audio_source(call_id, source, channels)` が source を登録し、IN/OUT/BOTH の指定チャネルへ mix される／不変: source が閉じたら自動除去。
- テスト: ストリーム source の注入、BOTH/IN/OUT 各チャネルへのルーティング、`open_default_microphone_source` の注入（通話マイクではなく独立キャプチャである点を明記）。

#### 検証方法

- `make test`（`--features test-util`、TestBackend）で全 integration test をグリーンに保つ。
- `cargo build --features pjsua-native` がビルド・実行できること（本番バックエンド修復の条件）。
- 各 example は `cargo run --example <name> --features pjsua-native -- --host ...` で実 PBX / ローカル SIP サーバに対して完走すること。
- 実機 SIP 相互接続試験（§43.4 Layer 4）を CI の Docker job（§44 M20）で実行。

#### 実装チケットの依存関係

- 例バイナリ本体の実装（`P8-6` / `P9-1` / `P13-3` / `P14-3`）は、上記 Phase 1-6 の機能実装が先に完了していることが前提。
- `P8-8` / `P9-2`（audio subscribe）、`P15-7` Layer 3+（メディア配線）は E4/E5 の前提。
- `P12-7` / `P8-21`（NativeEvent dispatch / FFI キュー drain）、`P12-8`（CallDirection）は E2/E3 の前提。
