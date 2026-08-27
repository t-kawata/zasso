# RFC-ROOT

> 対象 RFC: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT.md
> 生成グラフ: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json

# クイックスタート（SipClient 初期化と最初のステップ）

トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **既定ビルドでは `SipClient::new` が実行時失敗**する。`CoreReactor::spawn` → `create_backend(...)?`（`src/runtime/reactor.rs`）が `pjsua-native` なしで `Err("SipClient requires the `pjsua-native` feature")` を返す（`src/runtime/backend_selection.rs:77-84`）。クイックスタートの「トランスポートと STUN を設定した初期化コード」は既定ビルドで起動できない（`cargo run --example client_init` が即失敗）。
- **本番バックエンドがビルド不能**: `cargo build --features pjsua-native` は 57 エラー。bindgen 出力に `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` / `PJMEDIA_*` 等の定数が欠如（E0432 / E0425）、`pjsua_config` に `turn_cfg` / `turn_cfg_use` フィールドがない（E0609）、`pjsua_codec_info` に `encoding_name` / `clock_rate` がない（E0609）。
- トランスポート / STUN の配線コード自体は存在する（`src/ffi/transport_wiring.rs` の種別・ポート反映、`src/config/stun_turn_ice_wiring.rs` の `stun_srv` 反映）が、すべて `#[cfg(feature = "pjsua-native")]` 配下にあり、当該 feature がビルド不能のため実行されない。
- 唯一動作するのは TestBackend（`--features test-util`）だが、実トランスポート生成・STUN 解決は行わない。

### 実装補強設計（完全記述への条件）

1. **bindgen allowlist の修正**（`src/build/build_script_bindgen.rs`）: `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` / `PJMEDIA_*` 定数と、`pjsua_config` 全フィールド（`turn_cfg` / `turn_cfg_use` 含む）、`pjsua_codec_info`（`encoding_name` / `clock_rate`）を emit する。→ `cargo build --features pjsua-native` が通ること。（P8-16 / P10-2 / P11-5 / P13-4）
2. ビルド修復後、`SipClient::new` + トランスポート生成 + STUN 反映を実 PJSIP に対して統合テストで固定（P16-2 / P16-8 の配線コードを実機検証）。

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

> **注意（現在の実装状態）**: トランスポート / STUN/TURN/ICE は §12/§13 の統合型（`transport_ice_spec`）に一本化され、PJSIP への反映コード（`transport_wiring` / `stun_turn_ice_wiring`）も実装済みです（P16-2 / P16-8）。ただし反映コードは `pjsua-native` feature 配下にあり、現在この feature はビルド不能（bindgen 定数・`pjsua_config.turn_cfg` 等の欠如）です。また `audio.resampler_quality` は現状 `String` 型（既定値 `"High"`）であり、RFC の `ResamplerQuality` enum は未実装です。設定の構築・既定値・バリデーションは `make test`（`--features test-util` の TestBackend）上で検証可能です。

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

> **注意**: サンプルレート規則は `audio.default_delivery_format.sample_rate`（既定配信フォーマット）にのみ適用されます。バリデーションはバックエンド起動前に行われるため、既定ビルドでも検証できます。実 SIP の初期化には `pjsua-native` feature が必要ですが、現在ビルド不能です。

# アカウントの追加と設定更新（add_account / update_config）

add_account の最小コードと、update_config(AccountConfigPatch) による設定更新および更新時に走る register/unregister の挙動を併せて解説

`SipClient::add_account` でアカウントを追加し、`SipAccountHandle` を取得します（RFC §11 / §17）。

```rust
use siprs::{AccountConfig, RegistrationState, SipClient};

let config = AccountConfig {
    register_on_start: false, // 追加直後は登録を走らせない
    ..AccountConfig::default()
};
let account = client.add_account(config).await?; // SipAccountHandle
assert_eq!(account.registration_state().await?, RegistrationState::Disabled);
```

追加直後の登録状態は、`register_on_start: false` なら `Disabled` です。`AccountConfig::default()` は `register_on_start: true` のため、既定設定のまま追加すると自動 REGISTER が走り `Registering` へ遷移します（P16-3 / §62.12）。`update_config` で設定を更新できます。

```rust
use siprs::config::account_config_spec::AccountConfigPatch;

let patch = AccountConfigPatch {
    register_on_start: Some(true), // 更新後に再登録を走らせる
    ..AccountConfigPatch::default()
};
account.update_config(patch).await?;
```

**更新時の register / unregister の挙動（C026）**: `update_config` は、パッチが `register_on_start: Some(enabled)` を明示的に運ぶ場合に限り、設定更新後に `set_registration(native_id, enabled)` を発行します。`Some(true)` は `Registering`、`Some(false)` は `Unregistering` へ遷移します。パッチが `register_on_start` を含まない（`None`）場合は**登録状態は変化しません**（reactor の `UpdateAccount` アームで `apply_registration_command_state` により固定）。

> **注意**: 上記コードは `make test`（TestBackend）上で検証可能です（登録状態機械のテストがグリーン）。実 SIP の REGISTER 送出には `pjsua-native` feature が必要ですが、現在ビルド不能です。

# 登録と登録解除（register / unregister / set_registration_enabled）

register() / unregister() / set_registration_enabled() の使い分けと、register_on_start による自動登録設定を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `register()` / `unregister()` / `set_registration_enabled()` は存在し、`RuntimeCommand::SetRegistration` を submit する（`src/api/public_api_design.rs`）。reactor の `SetRegistration` アームは `backend.set_registration` + 状態遷移（`Registering` / `Unregistering`）を実行する（`src/runtime/reactor.rs`）。
- `register_on_start` による自動登録は **P16-3（§62.12）で実装済み**。`add_account` 時に `register_on_start: true` を消費して自動 REGISTER を発行する（`src/state/reg_account_lifecycle.rs::should_auto_register` / `add_account_and_apply_auto_register`、`src/runtime/reactor.rs` AddAccount アーム）。
- 登録結果イベントは **`RegistrationStateChanged` に統一済み（P16-3）**。`RegistrationSucceeded` / `RegistrationFailed` は `SipEventPayload` から完全削除された（`src/api/event_model_payload_bus.rs`）。reactor は `RegistrationStateChanged(next)` を publish する（`src/runtime/reactor.rs`）。
- **しかし、どのビルド構成でも登録フローが完走しない**:
  - 既定ビルド: `SipClient::new` が `"SipClient requires the pjsua-native feature"` で即失敗。
  - `pjsua-native`: 57 エラーでビルド不能（bindgen 定数欠如、H1 参照）。
  - TestBackend: `account.register()` は `Registering` まで進むが、`TestBackend::set_registration` は内部マップの更新のみで `NativeEvent` を発火しない（`src/runtime/backend.rs`）。`examples/account_register.rs` は `RegistrationStateChanged` を待つが 30 秒でタイムアウトする。
- **`examples/account_register.rs` はどの構成でも完了しない**: P16-3 で `RegistrationStateChanged(Registered / Failed)` 待ちに修正済みだが、TestBackend ではネイティブ登録イベントが発火せず、pjsua-native はビルド不能。example 自身のタイムアウトメッセージが「reactor NativeEvent dispatch pending P12-7」と記す。

### 実装補強設計（完全記述への条件）

1. ✅ **実装済み（P16-3）**: `register_on_start` の自動登録を `add_account` 時に消費。
2. ✅ **実装済み（P16-3）**: 登録結果イベントを `RegistrationStateChanged` に統一し、`RegistrationSucceeded`/`Failed` を enum から完全削除。`examples/account_register.rs` を修正。
3. **pjsua-native のビルド修復**（bindgen 定数 `PJ_SUCCESS` / `PJ_ENOMEM` / `PJ_EINVALIDOP` / `PJ_EBUSY`、`PJSUA_CALL_NULL`、`PJ_CRED_DATA_PLAIN_PASSWD` 等、H1 参照）後、実 REGISTER の成否を状態機械（`Registered` / `Failed`）へ反映する経路を統合テストで固定。
4. または、TestBackend が `set_registration` 時に `NativeEvent::RegistrationStateChanged` を発火するようにし、example が TestBackend 上で完走するようにする。

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
| `Disabled` | 登録が無効（`register_on_start: false` で追加した直後の初期状態） |
| `Idle` | 登録は有効だが未試行 |
| `Registering` | REGISTER 送信中・応答待ち |
| `Registered` | レジストラへの登録成功 |
| `Unregistering` | UNREGISTER 送信中・応答待ち |
| `Failed` | 直前の登録試行が失敗 |
| `Expired` | 登録期間が期限切れ |

状態遷移は §17.1 の遷移表（`registr_state_machine.rs`）で検証されます。TestBackend 上では、`register()` → `Registering`、ネイティブ成功イベント注入 → `Registered`、ネイティブ 4xx 注入 → `Failed` が観測できます（イベント注入はテスト専用ヘルパー経由）。

> **注意**: `Expired` は enum 上は定義されていますが、現在**実イベント源が未配線**です（`registration_state_from_status` は `Registered` / `Idle` / `Failed` のみを生成）。実フローで `Expired` が発火することはまだありません。また `Registered` / `Failed` の観測にはネイティブ登録イベントが必要で、実 SIP には `pjsua-native` feature（現在ビルド不能）が必要です。

# アカウントの取得・一覧・削除（account / accounts / remove_account）

account(id) / accounts() / remove_account(id) の呼び出しと、削除時に走る unregister の挙動・関連イベントを併せて解説

`SipClient::account(id)` / `accounts()` でアカウントを取得・一覧し、`remove_account(id)` で削除します（RFC §17 / P16-3 §62.12）。

```rust
use siprs::SipClient;

// 一覧（ClientState が唯一のソースオブ真理）
for snapshot in client.accounts().await {
    println!("account {}: {}", snapshot.id, snapshot.uri);
}

// 個別取得（未知の id は fail-fast で AccountNotFound）
let handle = client.account(account_id).await?;

// 削除
client.remove_account(account_id).await?;
```

**削除時の挙動（P16-3 / §62.12）**: `remove_account` は以下の順で実行されます。

1. **unregister 先行** — `set_registration(native_id, false)` を発行し、UNREGISTER を試行
2. **backend 除去** — `backend.remove_account(native_id)`
3. **ClientState からの除去** — アカウント情報を `ClientState` から削除
4. **`AccountRemoved(AccountSnapshot)` を publish**

`remove_account` は未知の `account_id` に対して `SipErrorKind::AccountNotFound` を fail-fast で返します。この一連の挙動は `--features test-util` の TestBackend 上で検証可能です（`reg_account_lifecycle.rs` の remove 系列、reactor の AccountRemoved テストで固定）。

> **注意**: 実 SIP の UNREGISTER 送出には `pjsua-native` feature が必要ですが、現在ビルド不能です。TestBackend では unregister の命令発行と `AccountRemoved` イベントの発行までを検証できます。

# イベントの購読と受信（subscribe / subscribe_account / subscribe_raw_sip）

subscribe() / subscribe_account(id) / subscribe_raw_sip() の 3 つの購読方法の違いと、購読解除（unsubscribe）の方法、SipEventPayload の主要バリアントの受信コードを解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `SipClient` は単一 `EventBus` を所有し（`src/client.rs`）、`subscribe()`（`client.rs`）と `subscribe_account(id)`（`client.rs`、`meta.account_id` フィルタは `src/api/eventbus_receiver.rs`）は単一バス上で動作する。
- **P16-4 で FFI ネイティブイベントの drain は実装済み**: `spawn_native_event_drain` が lock-free キューを 5ms ポーリングし reactor へ転送する（`src/runtime/event_path_wiring.rs:42-82`）。P0 系（Registration / Call / DTMF）は実 PJSIP から流れる前提。
- しかし確認済み内容の **「subscribe_raw_sip() の受信コード」は依然として成立しない**。`subscribe_raw_sip()` は `RawSipEventConfig::enabled` に応じて `Some`/`None` を返す（`client.rs`）が、**生産コードで `enqueue_raw_sip_bytes` を呼ぶ FFI コールバックが存在しない**。`register_callbacks` は 8 コールバックを登録するが `on_rx_msg` を含まず、vendored PJSIP の `pjsua_callback` に `on_rx_msg` フィールドがない（PJSIP &lt; 2.13、`src/ffi/callback.rs:143-144`）。`enqueue_raw_sip_bytes` の呼び出し元はユニットテストのみ。
- **`unsubscribe` API は存在しない**。購読解除は broadcast `Receiver` の drop のみ（明示 API なし。RFC §8.3 にも明示 API なし）。
- **P1/P2 系イベントは部分的にしか発火しない**: `CallRedirected` / `CallTransferStatus` は FFI コールバック登録あり。`TransportStateChanged` / `IceTransportError` / `CallTsxStateChanged` / `CallReplaced` / `NatDetected` はコールバック未登録で発火しない。`src/state/m20_native_event_conv.rs` の「P1/P2 returns None」という doc comment はコード（`Some()` 化済み）と矛盾する stale comment。
- 本番 FFI 経路は pjsua-native ビルド修復が前提（H1 参照）。

### 実装補強設計（完全記述への条件）

1. **raw SIP publisher の生産経路**: vendored PJSIP が `on_rx_msg`（または `on_rx_request` / `on_rx_response`）フィールドを公開する場合、それを `register_callbacks` に登録し `enqueue_raw_sip_bytes` へ接続する（P16-4 の未完項目）。フィールドが存在しない場合は PJSIP 2.13+ への更新か、README に「raw SIP 受信は未配線」と明記する。
2. 購読解除は drop ベースである旨を README に明記（RFC §8.3 / P15-6 の設計判断）。明示 unsubscribe API は追加しない。
3. 未発火の P1/P2 イベント（`TransportStateChanged` 等）の FFI コールバック登録を追加し、stale doc comment を修正。
4. pjsua-native のビルド修復（H1 参照）。

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

**発信のイベント系列（実 SIP）**: 発信側の標準系列は `OutgoingCallStarted → OutgoingCallTrying → CallConnected` です。`OutgoingCallRinging` は**着信側**の CONNECTING 遷移で発行されるため、発信通話では観測されません（`m20_callstate_mapping.rs`）。

> **注意**: `make_call` は `SipAccountHandle` 上のメソッドで、戻り値は `u64`（`CallId` ではありません）。TestBackend では `make_call` は call id の採番と登録のみを行い、イベントは publish しません（ネイティブイベントの注入はテスト専用）。実 SIP のイベント系列には `pjsua-native` feature（現在ビルド不能）と実 PJSIP コールバックが必要です。上記コードは `make test`（TestBackend）上で検証可能です。

# 着信と応答（IncomingCall と answer）

IncomingCall イベントの受信から answer(code) による応答、reject（486/603）による切断までの一連のコードを解説

着信は `IncomingCall` イベントで通知され、`SipClient::answer(call_id, code)` で応答します（RFC §19 / P16-5 §62.14）。

```rust
use siprs::{SipClient, SipEventPayload};

let mut events = client.subscribe();

loop {
    let event = events.recv().await?;
    match event.payload {
        SipEventPayload::IncomingCall(info) => {
            // 着信を 200 で受諾
            client.answer(info.call_id, 200).await?;
            // 拒否する場合は 486（Busy Here）または 603（Decline）で応答
            // client.answer(info.call_id, 486).await?;
        }
        SipEventPayload::CallConnected(_) => println!("call connected"),
        SipEventPayload::CallDisconnected(_) => println!("call disconnected"),
        _ => {}
    }
}
```

`answer(code)` の受理コードは `[180, 183, 200, 486, 603]` です（`validate_answer_code`）。

| code | 意味 |
|---|---|
| `180` | 着信呼び出し継続（provisional） |
| `183` | SDP 付き provisional answer |
| `200` | 通話受諾 → `CallConnected` を publish |
| `486` | Busy Here → `CallDisconnected` を publish（reject 経路） |
| `603` | Decline → `CallDisconnected` を publish（reject 経路） |

着信 call は `ClientState.calls` に `CallDirection::Incoming` として登録されるため、`calls()` / `call_state()` で参照できます（P16-5）。reject（486 / 603）は `CallDisconnected` として観測される仕様です（§62.14 の設計判断）。

> **注意**: `IncomingCall` は `pjsua-native` の `on_incoming_call` コールバックでのみ生成されます。TestBackend では `NativeEvent::IncomingCall` の注入により一連のフロー（着信登録 → answer(200) → `CallConnected` / answer(486) → `CallDisconnected`）を検証できます（reactor のテストで固定）。実 SIP には `pjsua-native` feature（現在ビルド不能）が必要です。また FFI 経路では `caller_uri` が空文字になるため、着信 URI の表示は別途の解決が必要です。

# 通話イベントと状態遷移（CallState の購読と判定）

OutgoingCallRinging / CallConnected / CallRejected / CallDisconnected 等の通話イベント受信と、CallState（§18）との対応を解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **`CallRejected` は存在しない**（確認済み内容に反する）。`SipEventPayload` enum から **設計判断（P16-5 / §62.14）で削除済み**。reject（486 / 603）は `CallDisconnected` として観測される（`src/runtime/reactor.rs`）。「`CallRejected` の受信」を README に記述することは不可能。
- **`CallResumed` は一度も発火しない**: enum に定義される（`src/api/event_model_payload_bus.rs`）が、構築箇所はゼロ。resume 時は `MediaActive` が publish される。
- **`OutgoingCallRinging` は発信通話では発火しない**: `m20_callstate_mapping.rs` の CONNECTING 変換は、着信方向（`CallDirection::Incoming`）の遷移のみ `OutgoingCallRinging` を publish する。発信側は `OutgoingCallTrying`。
- **`convert_call_state` は `CallState` 13 状態をマップしない**: PJSIP `pjsip_inv_state` の 7 値（NULL/CALLING/INCOMING/EARLY/CONNECTING/CONFIRMED/DISCONNECTED）→ `SipEventPayload` の変換のみ（`src/state/m20_callstate_mapping.rs:79-115`）。`CallState` 13 状態（§18）は遷移モデルとしてのみ存在する。
- **`CallEntry.state` はネイティブ遷移で更新されない**: `process_native_event` はイベントを publish するが `entry.state` を変更しない（`src/runtime/reactor.rs`）。リモート切断（DISCONNECTED → `CallDisconnected`）後も `call_state(call_id)` は stale な状態を返す。→ 「CallState（§18）との対応」は部分的。
- `CallConnected` / `CallDisconnected` は TestBackend ではネイティブイベント注入時のみ発火する（実 SIP は pjsua-native 前提、H1 参照）。

### 実装補強設計（完全記述への条件）

1. **確認済み内容の改訂（必須）**: `CallRejected` を列挙から除去し、「reject は `CallDisconnected` で観測される」へ修正（P16-5 の設計判断で確定済み）。
2. `process_native_event` がネイティブ `CallStateChanged` / `DISCONNECTED` から `CallEntry.state` を更新するようにし、`call_state()` の一貫性を確保（新規チケット。ギャップ）。
3. `CallResumed` を publish する経路を実装するか、「resume は `MediaActive` で観測」と明記する設計判断を確定。
4. 発信通話のイベント系列（`OutgoingCallStarted → OutgoingCallTrying → CallConnected`）で example を修正。
5. pjsua-native のビルド修復後、実 PJSIP コールバックからのイベント系列を統合テストで固定。

# DTMF 送受信（send_dtmf と DtmfSent / DtmfReceived）

send_dtmf(digits, method) の呼び出しと、DtmfMethod（Inband / SipInfo / Rfc4733）の使い分け、DtmfSent / DtmfReceived イベントの受信を解説

<::README-RESIDUE::>
## DTMF 送出の完了契約（§62.27）

- **`DtmfMethod` は単一定義 `Inband` / `Info` / `Rfc4733`**: P16-6（§62.15）で一元化され、旧 `SipInfo` は SIP INFO method の正名 `Info` へ改名された（`src/model/dtmf_spec.rs`）。
- **`method` は実 PJSIP 送信へ反映**: `Info` / `Rfc4733` → `pjsua_call_send_dtmf`、`Inband` → `pjsua_call_dial_dtmf`（`src/ffi/backend_calls.rs:256-289`）。「使い分け」は実装として成立。
- **`DtmfSent { Ok }` の送出完了契約（§62.27）**: PJSIP に DTMF 送信完了コールバックは存在しない（`pjsua_call_send_dtmf` / `pjsua_call_dial_dtmf` は同期 `pj_status_t` を返すのみ、`on_dtmf_digit` は受信専用）。そのため reactor の `handle_send_dtmf` が backend 受理（`send_dtmf` の同期 Ok）後に桁ごとに 500ms タイマーを起動し、`DtmfSent { status: Ok(()), pjsip_status: None }` を publish する。**500ms タイムアウト経過が唯一の送出完了シグナル**である（H12 解消）。
- `DtmfReceived` は `pjsua-native` の `on_dtmf_digit` コールバック専用（`src/ffi/callback.rs:312-319`）で、TestBackend / 既定ビルドでは発火しない（pjsua-native はビルド不能、H1 参照）。

### 残存 RESIDUE（完全記述への条件）

1. `DtmfReceived` の受信記述は pjsua-native ビルド修復後（H1 参照）に実コールバックで固定する。TestBackend では `NativeEvent::DtmfDigit` 注入で検証可能。

# 音声ストリームの取得（subscribe_audio と AudioChunkPair）

AudioFormat（ビット深度・サンプルレート・チャンネル）とストリームデータの対応を解説し、指定 bit/hz のステレオ WAV ファイルへ書き出す方法まで示す

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `subscribe_audio(call_id, format, capacity, mode)` は存在し、`AudioTapHandle::recv()` は `Option<AudioChunkPair>` を返す（`src/client.rs:477-497`、`src/api/audio_subscribe_bp.rs:113-123`）。`AudioChunkPair` / `ChannelLayout::StereoInOut`（L=IN / R=OUT）/ `AudioFormat` は公開型として一致する（`src/model/audio_format_chunkpair.rs`）。
- ✅ **P16-7 で WAV ライタは実装済み**: `WavWriter` / `write_stereo_wav` が存在し（`src/audio/media_path_wiring.rs:139-216`）、StereoInOut は L=IN / R=OUT をインターリーブ、Mono は IN のみ、出力は PCM16（F32 入力はクリップ/スケール）。
- **しかし `push_media_frame` を呼ぶ生産コードが依然として存在しない**。`SipBackend::push_media_frame` は trait に定義され（`src/runtime/backend.rs:1212`）、`AudioTapSender::try_push` はその内部でのみ呼ばれるが、**生産コードからの呼び出し元はゼロ**。conf port アダプタの `media_port_put_frame` は `mixer.in_queue` へ push する（`src/ffi/media_port_adapter.rs:177-184`）が tap へは供給しない。→ `AudioTapHandle::recv()` は実運用で**永久待機**する（`examples/audio_tap.rs` はブロックし続ける）。
- 既定ビルドでは `SipClient::new` 自体が失敗する（H1 参照）。

### 実装補強設計（完全記述への条件）

1. **`push_media_frame` の生産経路を配線**（P15-7 Layer 3+ / P16-7 の未完項目）: conf port の `put_frame` / `get_frame` 経路（または明示的なメディアパイプラインステップ）から `push_media_frame` を呼び、tap へ `AudioChunkPair` を連続供給する。
2. pjsua-native のビルド修復（H1 参照）後、実メディアコールバックで tap を駆動し、`AudioChunkPair` が連続生産されることを統合テストで固定。
3. WAV 変換は P16-7 で実装済みのため、生産経路確立後に「`AudioChunkPair` → 指定 bit/hz のステレオ WAV 書き出し」の記述が成立する。

# 音声の注入（AsyncAudioSource と add_audio_source）

2 者通話における IN / OUT / BOTH チャネルへの音声ファイル・ストリーム注入方法と、マイク入力 source の取得（open_default_microphone_source）を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `add_audio_source(call_id, source, channels)` は存在し、`call_id` と `ChannelSelector`（In/Out/Both）を受け取り per-call `AudioMixer` へ登録する（`src/client.rs:509-521`、`src/runtime/reactor.rs:306-346`）。`AudioWorkerTask::spawn` も reactor の生産経路で呼ばれる。
- ✅ **P16-7 で解消**: `RustMediaPort` が `out_queue` / `in_queue` を消費する conf port コンシューマとして実装された（`src/runtime/audio_worker.rs:381-414`）。`make_call` / `answer` の call connect 時（`CallConnected` 発行）に `conf_connect(call_id, call_id)` が自動発行される（`src/runtime/reactor.rs:1213-1218`）。
- ✅ **P16-7 で解消**: `WavFileSource`（PCM16 WAV のみ、リサンプルなし）と `open_default_microphone_source`（cpal、OS 既定入力デバイスの独立キャプチャ）が実装された。
- **しかし `RustMediaPort` が実通話の conf bridge に登録されない**: `register_conf_callback`（`pjsua_conf_add_port` で `RustMediaPort` を登録する唯一の箇所）は **`Initialize` 時に一度だけ**呼ばれ、その時点で `audio_mixers` は空である（`src/runtime/command.rs:464`、`src/runtime/backend.rs:762-796`）。`AddAudioSource` 後には再実行されないため、実通話で `RustMediaPort` は登録されず、注入音声は `out_queue`（64 フレーム ≈ 1.28 秒）に溜まり**破棄される**。
- 実装は `#[async_trait]` ベースであり、RFC §23 の RPITIT とは異なる（`ErasedAudioSource` が object-safe ラッパー、`src/api/asyncaudiosrc_adapter.rs`）。

### 実装補強設計（完全記述への条件）

1. **`AddAudioSource` で mixer 生成時に conf bridge への `RustMediaPort` 登録を再実行**する（`register_media_ports_for_calls` 相当を mixer 作成経路で呼ぶ。新規チケット。ギャップ）。
2. pjsua-native のビルド修復（H1 参照）後、実通話で注入音声がネットワーク送信 / ローカル再生に届くことを統合テストで固定。
3. `open_default_microphone_source` は「注入可能なキャプチャ source」であり通話マイクではない旨を README に明記。

# STUN/TURN/ICE とトランスポート設定

ClientConfig への stun_servers / turn_servers / ice の設定方法と、TransportConfig（UDP/TCP/TLS）の選択を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- 型の一本化は実現: 単一の `TransportConfig` / `StunServerConfig` / `TurnServerConfig` / `IceConfig`（`src/config/transport_ice_spec.rs`）。P15-2 が旧重複を除去した。
- ✅ **P16-2 / P16-8 で配線コードは実装済み**: `PjsuaBackend::initialize` が `config.transports` を列挙し種別 + ポートを `pjsua_transport_create` へ反映（`src/ffi/transport_wiring.rs:184-188`、`src/runtime/backend.rs:813-855`）。`apply_stun_turn` が `pjsua_config.stun_srv[]` / `turn_cfg` / `turn_cfg_use` を反映し（`src/config/stun_turn_ice_wiring.rs:128-180`）、`apply_ice` が media ICE 設定を反映する（`:198`）。UDP/TCP/TLS → PJSIP 種別マッピングはユニットテスト済み。
- **しかし本番（`pjsua-native`）は依然としてビルド不能（57 エラー）**。特に `pjsua_config` に `turn_cfg` / `turn_cfg_use` フィールドがないため（E0609）、TURN 反映コード（`stun_turn_ice_wiring.rs:167-180`）がコンパイルできない。`PJ_SUCCESS` / `PJ_EBUSY` / `PJ_EINVALIDOP` 等の定数も bindgen 出力に欠如。
- 既定ビルドでは `SipClient::new` が `"SipClient requires the pjsua-native feature"` で失敗し、設定を実演できない（H1 参照）。

### 実装補強設計（完全記述への条件）

1. **bindgen / vendored PJSIP の整合**（P16-2 / P16-8 の前提）: `pjsua_config.turn_cfg` / `turn_cfg_use`、`PJ_*` 定数、`pjsua_codec_info` フィールドを bindgen allowlist に追加するか、vendored PJSIP を必要なフィールドを持つバージョンへ更新する。→ `cargo build --features pjsua-native` が通ること。
2. ビルド修復後、`stun_servers` / `turn_servers` / `ice` と `TransportConfig` が実 PJSIP に反映されることを統合テスト（coturn プロトコルレベル検証、P16-8 / P16-10）で固定。

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

本 README は **siprs クライアントライブラリ** の利用方法を解説します。REST / WebSocket API による SIP 制御・イベント配信・音声ストリーミングの**サーバランタイム**は、**別クレート `siprs-server`** の責務です。

境界は以下のとおりです（RFC §52 / P2-2）。

- siprs は Axum 等の HTTP 依存を**既定では**持ちません。`server` feature（`axum` / `tower-http`、default off）配下にサーバ側設定型（`ServerConfig` 等）を定義します。
- WebSocket / HTTP のフレームプロトコル型（`WsTextFrame` / `WsBinaryFrame` / `AudioFrameHeader` 等）は siprs に定義され、siprs-server が利用します。
- HTTP/WebSocket API の**サーバ実装・運用方法**は `crates/siprs-server` クレートのドキュメントを参照してください。

# Examples (implementation samples) spec and design

<::EXAMPLES-RESIDUE::>
## EXAMPLES-RESIDUE — 完全な examples 設計の作成不可

### 証拠（欠落・危険・矛盾）

README の 17 セクション中 8 セクション（H1 / H5 / H8 / H11 / H12 / H13 / H14 / H15）が RESIDUE であり、Examples が「単一実装例に全セクションを統合し、確実に動作する」ことは、その前提たる機能実装が未完了のため成立しない。

- **本番バックエンドがビルド不能**: `cargo build --features pjsua-native` は 57 エラー（bindgen 定数 `PJ_SUCCESS` 等の欠如、`pjsua_config.turn_cfg` / `turn_cfg_use` 欠如、`pjsua_codec_info` の `encoding_name` / `clock_rate` 欠如）。→ 実 SIP 通信を伴う example は成立しない（H1）。
- **既定ビルドでは `SipClient::new` が実行時失敗**: `cargo run --example client_init` は `"SipClient requires the `pjsua-native` feature"` で即失敗（`src/runtime/backend_selection.rs:77-84`）。examples はコンパイル可能だが、既定ビルドではどの example も起動できない。
- **TestBackend（`--features test-util`）では `client_init` のみ完走**: `cargo run --example client_init --features test-util` は `ClientInitialized` 受信まで成功する。しかし他の example は以下で失敗する。
- **account_register は TestBackend では完了しない**: `examples/account_register.rs` は P16-3（§62.12）で `RegistrationStateChanged(Registered / Failed)` 待ちに修正済み。しかし TestBackend は `set_registration` 時にネイティブ登録イベント（`NativeEvent::RegistrationStateChanged`）を発火しないため（`src/runtime/backend.rs`）、30 秒の `REGISTRATION_TIMEOUT` 後にタイムアウトする（H5 参照）。
- **make_call もイベント待ちで失敗する**: `examples/make_call.rs` は発信イベントを待つが、TestBackend では `make_call` はイベントを一切 publish しない（`src/runtime/reactor.rs` の `handle_make_call` は登録のみ）。`OutgoingCallRinging` は着信方向専用であり、発信側の正規イベントは `OutgoingCallTrying`（H9 / H11 参照）。
- **audio_tap は永久待機する**: `subscribe_audio` は `AudioTapSender` を tap レジストリへ登録するが、`push_media_frame` を呼ぶ生産コードが存在しない（`src/runtime/backend.rs:1212`）。`AudioTapHandle::recv()` はブロックし続ける（H13 参照）。
- **tts_source は音声が流れない**: `AudioWorkerInner::process_frame` は `out_queue` / `in_queue` へ push するが、`RustMediaPort` が conf bridge に登録されるのは `Initialize` 時（`audio_mixers` が空）の一度だけであり、`AddAudioSource` 後には登録されない（`src/runtime/command.rs:464`、`src/runtime/backend.rs:762-796`）。注入音声は out_queue に溜まり破棄される（H14 参照）。
- **raw SIP は配信されない**: `on_rx_msg` コールバックが未登録のため、`subscribe_raw_sip()` は無音のチャネルを返す（H8 参照）。

### 実装補強設計（Examples が完全記述になるための条件）

#### 前提: 各 README セクションの RESIDUE 解消

Examples が「確実に動作する」には、以下が先に実装される必要がある（チケット化の素材。各セクション RESIDUE を参照）。

1. **本番バックエンドのビルド修復**: `pjsua-native` の 57 エラー解消（bindgen allowlist とコード期待の整合、`pjsua_config.turn_cfg` / `turn_cfg_use`、`PJ_*` 定数、`pjsua_codec_info` フィールド）。チケット: `P8-16` / `P10-2` / `P11-5` / `P13-4`（H1）。
2. **登録フローの完走**: TestBackend が `set_registration` 時に `NativeEvent::RegistrationStateChanged` を発火するか、pjsua-native 修復後（H5）。
3. **イベント経路の完成**: raw SIP publisher（`on_rx_msg` 登録、P16-4 未完）、未発火 P1/P2 コールバック登録、`CallEntry.state` のネイティブ遷移更新（新規、H8 / H11）。
4. **メディア経路の完成**: `push_media_frame` の生産経路配線（H13）、`AddAudioSource` 時の `RustMediaPort` conf bridge 登録再実行（H14）。
5. **DTMF の名称修正**: `DtmfMethod` の `Info` 表記への統一と実送信反映（H12）。

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
- テスト: 発信成功・拒否（486/603）・`hangup` での切断、イベント順序（`OutgoingCallStarted → OutgoingCallTrying → CallConnected`）。

**E4. audio_tap（RFC §22 / §21 / H13）**
- 契約: 前 `subscribe_audio(call_id, format, capacity, mode)` が有効な tap を返す／後 `AudioChunkPair`（L=IN / R=OUT）が交渉済み `AudioFormat` で連続生産される／不変: `Realtime` は最古破棄、`Lossless` は producer ブロック（§22.1）。
- テスト: フレーム連続生産・フォーマット一致・backpressure 両モード・`AudioChunkPair` → 指定 bit/hz のステレオ WAV 変換（`write_stereo_wav` / `WavWriter` は P16-7 で実装済み）。

**E5. tts_source（RFC §23-24 / §41.5 / H14）**
- 契約: 前 `AsyncAudioSource::next_chunk` が 20ms フレームを返す／後 `add_audio_source(call_id, source, channels)` が source を登録し、IN/OUT/BOTH の指定チャネルへ mix される／不変: source が閉じたら自動除去。
- テスト: ストリーム source の注入、BOTH/IN/OUT 各チャネルへのルーティング、`open_default_microphone_source` の注入（通話マイクではなく独立キャプチャである点を明記）。

#### 検証方法

- `make test`（`--features test-util`、TestBackend）で全 integration test をグリーンに保つ。
- `cargo build --features pjsua-native` がビルド・実行できること（本番バックエンド修復の条件）。
- 各 example は `cargo run --example <name> --features pjsua-native -- --host ...` で実 PBX / ローカル SIP サーバに対して完走すること。
- 実機 SIP 相互接続試験（§43.4 Layer 4）を CI の Docker job（§44 / P16-10）で実行。

#### 実装チケットの依存関係

- 例バイナリ本体の実装（`P8-6` / `P9-1` / `P13-3` / `P14-3`）は、上記 Phase 1-5 の機能実装が先に完了していることが前提。
- `P8-8` / `P9-2`（audio subscribe）、`P15-7` Layer 3+（メディア配線）は E4/E5 の前提。
- `P12-7` / `P8-21`（NativeEvent dispatch / FFI キュー drain）、`P12-8`（CallDirection）は E2/E3 の前提。
