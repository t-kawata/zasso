# RFC-ROOT

> 対象 RFC: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT.md
> 生成グラフ: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json

# クイックスタート（SipClient 初期化と最初のステップ）

トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード

`SipClient::new(ClientConfig)` で SIP クライアントを初期化します。`ClientConfig` にトランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コードは以下のとおりです（RFC §41.1 / §10 / P15-2）。

```rust
use siprs::{ClientConfig, StunServerConfig, TransportConfig};

let config = ClientConfig {
    transports: vec![
        TransportConfig::udp(5060),
        TransportConfig::tcp(5060),
    ],
    stun_servers: vec![StunServerConfig {
        uri: "stun:stun.l.google.com:19302".into(),
    }],
    ..ClientConfig::default()
};

let (client, mut events) = SipClient::new(config).await?;
```

`SipClient::new` は `Result<(SipClient, broadcast::Receiver<SipEvent>), SipError>` を返します。初期化に成功すると、イベントバスへ `SipEventPayload::ClientInitialized(ClientCapabilities)` が publish されます。`events.recv()` で初期化完了を確認できます。

```rust
// 初期化完了イベントの受信
let event = events.recv().await?;
match event.payload {
    SipEventPayload::ClientInitialized(capabilities) => {
        println!("client ready: {:?}", capabilities);
    }
    other => println!("unexpected: {other:?}"),
}
```

**必要な feature**: 実 SIP 通信（トランスポート生成・STUN 反映・REGISTER 送出）には `pjsua-native` feature が必要です。

```bash
cargo run --example client_init --features pjsua-native -- --host sip.example.com
```

`pjsua-native` なしの**既定ビルドでは `SipClient::new` は fail-fast** します（`"SipClient requires the pjsua-native feature"`）。動作確認は `--features test-util`（TestBackend）で行えます。

```bash
cargo run --example client_init --features test-util
```

> **注意**: 上記コードは `make test`（`--features test-util` の TestBackend）上で検証可能です（`ClientInitialized` 受信まで）。実トランスポート生成・STUN 反映は `pjsua-native` feature（現在ビルド・リンク可能）で docker 上の coturn / Asterisk に対する統合テスト（`make test-integration`）で固定されます。

# ClientConfig の設定項目（transports・STUN/TURN・音声・タイムアウト）

ClientConfig の全フィールド（transports, stun_servers, turn_servers, ice, audio, timeouts, raw_sip_events）を既定値と併せて表形式で解説

`ClientConfig` は `SipClient::new` に渡す初期化設定です（RFC §10 / P15-2 で一本化された唯一の公開設定型）。全フィールドと既定値は以下のとおりです。

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `user_agent` | `String` | `"tauri-siprs/0.1"` | SIP `User-Agent` ヘッダ |
| `log_level` | `LogLevel` | `Info` | ログレベル |
| `max_calls` | `u32` | `32` | 同時通話数の上限 |
| `event_bus_capacity` | `usize` | `2048` | イベントバス（control）容量 |
| `raw_sip_event_capacity` | `usize` | `4096` | raw SIP イベント容量 |
| `audio` | `ClientAudioConfig` | 16kHz / I16 / ステレオ（StereoInOut）/ 20ms フレーム（pair 120ms・jitter 60ms・mixer 20ms・max_sources 16・resampler_quality `"High"`） | 音声フォーマットとバッファ設定 |
| `transports` | `Vec<TransportConfig>` | `[udp(5060), tcp(5060)]` | SIP トランスポート一覧 |
| `stun_servers` | `Vec<StunServerConfig>` | `[]` | STUN サーバ一覧 |
| `turn_servers` | `Vec<TurnServerConfig>` | `[]` | TURN サーバ一覧 |
| `ice` | `IceConfig` | enabled=true / aggressive_nomination=true / trickle_ice=false / renomination=false / max_host_candidates=16 | ICE 設定 |
| `raw_sip_events` | `RawSipEventConfig` | enabled=true / include_bodies=true / max_body_bytes=64KiB / redact_authorization=true | raw SIP イベント購読設定 |
| `timeouts` | `TimeoutConfig` | command 10s / shutdown 15s / register 15s / invite 90s | 各種タイムアウト |

各サブ設定は `ClientConfig` のフィールドに直接構築して代入します。

```rust
use siprs::{ClientConfig, StunServerConfig, TransportConfig};

let config = ClientConfig {
    transports: vec![TransportConfig::udp(5060), TransportConfig::tcp(5060)],
    stun_servers: vec![StunServerConfig {
        uri: "stun:stun.l.google.com:19302".into(),
    }],
    ..ClientConfig::default()
};
```

> **注意（現在の実装状態）**: トランスポート / STUN/TURN/ICE は §12/§13 の統合型（`transport_ice_spec`）に一本化され、PJSIP への反映コード（`transport_wiring` / `stun_turn_ice_wiring`）も実装済みです（P16-2 / P16-8 / P18-1）。`pjsua-native` feature は現在ビルド・リンク可能で、実 PJSIP への反映は docker 上の coturn に対する統合テスト（`make test-integration`）で検証できます。一方 `audio.resampler_quality` は現状 `String` 型（既定値 `"High"`）であり、RFC の `ResamplerQuality` enum は未実装です。既定ビルド（feature なし）では `SipClient::new` が fail-fast するため、設定の構築・既定値・バリデーションの動作確認は `make test`（`--features test-util` の TestBackend）上で行います。

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

`SipClient::new` は `Result<(SipClient, broadcast::Receiver<SipEvent>), SipError>` を返します。エラーは `SipError` で返され、`kind: SipErrorKind` と `native_status: Option<i32>` を保持します。PJSIP 由来の失敗では `native_status` に PJ ステータス（`PJ_SUCCESS`=0 等）が入ります（§62.8 / P15-9）。

> **注意**: サンプルレート規則は `audio.default_delivery_format.sample_rate`（既定配信フォーマット）にのみ適用されます。バリデーションはバックエンド起動前に行われるため、既定ビルドでも検証できます（P15-2 / P18-1 により `pjsua-native` feature は現在ビルド可能です）。

# アカウントの追加と設定更新（add_account / update_config）

add_account の最小コードと、update_config(AccountConfigPatch) による設定更新および更新時に走る register/unregister の挙動を併せて解説

`SipClient::add_account` でアカウントを追加し、`SipAccountHandle` を取得します（RFC §11 / §17）。

```rust
use siprs::{AccountConfig, RegistrationState, SipClient};

let (client, _events) = SipClient::new(config).await?;

let account_config = AccountConfig {
    register_on_start: false, // 追加直後は登録を走らせない
    ..AccountConfig::default()
};
let account = client.add_account(account_config).await?; // SipAccountHandle
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

> **注意**: 上記コードは `make test`（TestBackend）上で検証可能です。TestBackend では `add_account` の状態遷移（`Disabled` / `Registering`）と `update_config` の命令発行・状態遷移までを検証できます。`register_on_start` による自動登録の `RegistrationStateChanged` は、TestBackend の `AddAccount` / `UpdateAccount` アームがネイティブイベントを drain しないため即時 publish されません（P17-4 / §62.24 は `SetRegistration` アームのみ）。実 SIP の REGISTER 送出には `pjsua-native` feature（現在ビルド可能）が必要です。

# 登録と登録解除（register / unregister / set_registration_enabled）

register() / unregister() / set_registration_enabled() の使い分けと、register_on_start による自動登録設定を併せて解説

`SipAccountHandle` の `register()` / `unregister()` / `set_registration_enabled()` で登録を明示的に制御します（RFC §17 / P16-3 §62.12）。

```rust
use siprs::{RegistrationState, SipClient};

// 明示的な REGISTER
account.register().await?;
assert_eq!(account.registration_state().await?, RegistrationState::Registering);

// 明示的な UNREGISTER
account.unregister().await?;

// 登録の有効 / 無効を切り替え
account.set_registration_enabled(true).await?;
account.set_registration_enabled(false).await?;
```

- `register()` — REGISTER を送信し、状態を `Registering` へ遷移させます。TestBackend（P17-4 / §62.24）ではネイティブ登録イベントが発火・drain され、`RegistrationStateChanged(Registered)` を受信できます。
- `unregister()` — UNREGISTER を送信し、`Unregistering` → `Idle` へ遷移させます。
- `set_registration_enabled(enabled)` — 引数に応じて `register()` / `unregister()` と同等の `SetRegistration` 命令を発行します。

**register_on_start による自動登録**: `AccountConfig::register_on_start: true`（既定値）で `add_account` すると、追加時に自動 REGISTER が発行され `Registering` へ遷移します（P16-3 / §62.12）。`false` なら `Disabled` のままです。

> **注意**: 明示的な `register()` 後の `RegistrationStateChanged(Registered)` は `make test`（TestBackend）上で検証できます（reactor テスト `set_registration_arm_drains_and_publishes_registered` で固定）。一方、`register_on_start` による自動登録では、TestBackend の `AddAccount` / `UpdateAccount` アームはネイティブイベントを drain しないため、追加直後の `RegistrationStateChanged` は publish されません（状態は `Registering` へ遷移します）。実 SIP の REGISTER / UNREGISTER 送出には `pjsua-native` feature（現在ビルド可能）が必要です。

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

状態遷移は §17.1 の遷移表（`registr_state_machine.rs`）で検証されます。TestBackend 上では、`register()` → `Registering`、`RegistrationStateChanged(Registered)` の受信 → `Registered`（P17-4 / §62.24 でネイティブ登録イベントの発火・drain が実装済み）、ネイティブ 4xx 注入 → `Failed` が観測できます（イベント注入はテスト専用ヘルパー経由）。

> **注意**: `Expired` は enum 上は定義されていますが、現在**実イベント源が未配線**です（`registration_state_from_status` は `Registered` / `Idle` / `Failed` のみを生成）。実フローで `Expired` が発火することはまだありません。また `Registered` / `Failed` の観測にはネイティブ登録イベントが必要で、実 SIP には `pjsua-native` feature（現在ビルド可能）が必要です。

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

> **注意**: 実 SIP の UNREGISTER 送出には `pjsua-native` feature（現在ビルド可能）が必要です。TestBackend では unregister の命令発行と `AccountRemoved` イベントの発行までを検証できます。

# イベントの購読と受信（subscribe / subscribe_account / subscribe_raw_sip）

subscribe() / subscribe_account(id) / subscribe_raw_sip() の 3 つの購読方法の違いと、購読解除（unsubscribe）の方法、SipEventPayload の主要バリアントの受信コードを解説

`SipEventPayload` は制御系イベントのペイロードです。`SipClient` は 3 種類の購読方法を提供します（RFC §15 / P17-9 §62.29）。

| メソッド | 戻り値 | 受信対象 |
|---|---|---|
| `subscribe()` | `Subscription<SipEvent>` | 全アカウントの制御系イベント（broadcast） |
| `subscribe_account(id)` | `Subscription<SipEvent>` | 指定アカウントにフィルタしたイベント |
| `subscribe_raw_sip()` | `Option<Subscription<RawSipMessage>>` | raw SIP メッセージ（`raw_sip_events.enabled == false` なら `None`） |

**主要バリアントの受信コード**: `Subscription::recv()` でイベントを待ち受け、`event.payload` を match します。

```rust
use siprs::{SipClient, SipEventPayload};

let mut events = client.subscribe();

loop {
    let event = events.recv().await?;
    match event.payload {
        SipEventPayload::RegistrationStateChanged(info) => {
            println!("registration: {:?}", info.state);
        }
        SipEventPayload::IncomingCall(info) => {
            println!("incoming call: {}", info.call_id);
        }
        SipEventPayload::CallConnected(_) => println!("call connected"),
        SipEventPayload::CallDisconnected(_) => println!("call disconnected"),
        SipEventPayload::DtmfReceived(info) => {
            println!("DTMF received: {}", info.digit);
        }
        _ => {}
    }
}
```

**購読解除（P17-9）**: `Subscription<T>` には明示的な `unsubscribe()` があります。呼び出し後は `recv()` / `try_recv()` が `Closed` を返します（べき等）。ハンドルを drop しても購読解除されます。

```rust
let mut events = client.subscribe_account(account_id);
// ... イベント受信 ...
events.unsubscribe();
assert!(!events.is_subscribed());
```

**raw SIP の受信**: `RawSipMessage` は `start_line` / `headers` / `body` を持ちます。`redact_authorization` が有効なら `Authorization` ヘッダは redact されます（RFC §16）。

```rust
use siprs::SipClient;

if let Some(mut raw_rx) = client.subscribe_raw_sip() {
    tokio::spawn(async move {
        while let Ok(msg) = raw_rx.recv().await {
            tracing::debug!("RAW SIP: {} ({})", msg.start_line(), msg.headers().len());
        }
    });
}
```

> **注意（実装状態）**: raw SIP の生産経路は `pjsip_module` フック（`raw_sip_module.rs`、P17-2 / §62.22）で、`pjsua-native` feature 配下の `backend_calls::initialize` でのみ登録されます。実 SIP メッセージ受信は docker 上の Asterisk に対する統合テスト（`make test-integration` → `raw_sip_rx_reaches_subscriber`）で固定されます。**TestBackend（`--features test-util`）では `subscribe_raw_sip()` は無音のチャネルを返します**（仕様どおり。P19-1 / §62.38）。また `on_ice_transport_error` は FFI コールバックとして登録済み（P19-2 / §62.39）で `NativeEvent::IceTransportError` を生成しますが、これはトランスポートレベルで消費され、`SipEventPayload` の受信バリアントには現れません。イベント購読・`unsubscribe()`・主要バリアントの受信は `make test`（TestBackend）上で検証可能です。

# 発信（make_call と OutgoingCallRequest）

make_call の最小コード（target_uri のみ指定）と、発信後のキャンセル（hangup）方法を併せて解説

`SipAccountHandle::make_call` で発信します。`OutgoingCallRequest` は RFC §8.5 の全フィールドを明示的に指定します。

```rust
use siprs::model::CallId;
use siprs::{CallMediaPreferences, HangupReason, OutgoingCallRequest, SipClient};

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

`make_call` は `SipAccountHandle` 上のメソッドで、戻り値は `u64`（`CallId` ではありません）。`CallId` は `siprs::model::CallId` で、`CallId::from_u64` により `0` 以外の値から生成できます。`hangup` は reactor 経由でバックエンドへ dispatch され、`CallDisconnected` イベントを publish します（P15-6）。

**発信のイベント系列（実 SIP）**: 発信側の標準系列は `OutgoingCallStarted → OutgoingCallTrying → CallConnected` です。`OutgoingCallRinging` は**着信側**の CONNECTING 遷移で発行されるため、発信通話では観測されません（`m20_callstate_mapping.rs`）。

> **注意**: TestBackend では `make_call` は call id の採番と登録のみを行い、イベントは publish しません（ネイティブイベントの注入はテスト専用）。実 SIP のイベント系列には `pjsua-native` feature（現在ビルド可能）と実 PJSIP コールバックが必要です。上記コードは `make test`（TestBackend）上で検証可能です。

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

着信 call は `ClientState.calls` に `CallDirection::Incoming` として登録されるため、`calls()` / `call_state()` で参照できます（P16-5）。reject（486 / 603）は `CallDisconnected` として観測される仕様です（§62.14 の設計判断）。`IncomingCall` イベントの `call_id` は `CallId` 型です。

> **注意**: `IncomingCall` は `pjsua-native` の `on_incoming_call` コールバックでのみ生成されます。TestBackend では `NativeEvent::IncomingCall` の注入により一連のフロー（着信登録 → answer(200) → `CallConnected` / answer(486) → `CallDisconnected`）を検証できます（reactor のテストで固定）。実 SIP には `pjsua-native` feature（現在ビルド可能）が必要です。また FFI 経路では `caller_uri` が空文字になるため、着信 URI の表示は別途の解決が必要です。

# 通話イベントと状態遷移（CallState の購読と判定）

OutgoingCallRinging / CallConnected / CallDisconnected 等の通話イベント受信と、CallState（§18）との対応を解説（CallRejected は設計判断で CallDisconnected へ統一済み）

通話イベントは `SipEventPayload` として購読し、`CallState`（§18 の 13 状態）と対応づけて判定します（RFC §18 / P16-5 §62.14 / P17-5 §62.25 / P17-6 §62.26）。

```rust
use siprs::{SipEventPayload, SipClient};

let mut events = client.subscribe();

while let Ok(event) = events.recv().await {
    match event.payload {
        SipEventPayload::OutgoingCallStarted(_) => println!("call started"),
        SipEventPayload::OutgoingCallTrying(_) => println!("trying"),
        SipEventPayload::CallConnected(_) => println!("connected"),
        SipEventPayload::CallDisconnected(_) => println!("disconnected"),
        SipEventPayload::CallHeld(_) => println!("held"),
        SipEventPayload::CallResumed(_) => println!("resumed"),
        _ => {}
    }
}
```

**イベントと CallState の対応**: ネイティブ `CallStateChanged` は `map_inv_state_to_call_state` で §18 の `CallState` へ変換され、`CallEntry.state` の更新とイベント publish が単一の変換結果から行われます（P17-5 / §62.25 / C128）。

| イベント | CallState | 方向 |
|---|---|---|
| `OutgoingCallStarted` | `Calling` | 発信 |
| `OutgoingCallTrying` | `Trying` | 発信 |
| `OutgoingCallRinging` | `Ringing` | 着信 |
| `CallConnected` | `Active` | 双方向 |
| `CallDisconnected` | `Disconnected` | 双方向 |
| `CallHeld` | `Held` | 双方向 |
| `CallResumed` | `Active` | 双方向（P17-6 / §62.26） |

**reject（486 / 603）は `CallDisconnected` として観測**されます。`CallRejected` は設計判断（P16-5 / §62.14）で `SipEventPayload` から削除済みです。`CallResumed` は `LOCAL_HOLD / REMOTE_HOLD → ACTIVE` 遷移（`on_call_media_state` 由来のメディア状態）で publish されます（P17-6 / §62.26）。

`call_state(call_id)` は `ClientState.calls` の `CallEntry.state` を返し、ネイティブ遷移で更新されます（P17-5 / §62.25 で stale 問題は解消）。TestBackend では `NativeEvent::CallStateChanged` の注入により `Incoming → Ringing → Active → Disconnected` の一連の遷移を `call_state()` で追跡できます（reactor テスト `process_native_event_full_lifecycle_reflects_each_transition` で固定）。

> **注意**: 発信通話では `OutgoingCallRinging` は発火しません（着信方向の CONNECTING 遷移専用）。実 SIP のイベント系列には `pjsua-native` feature（現在ビルド可能）が必要です。

# DTMF 送受信（send_dtmf と DtmfSent / DtmfReceived）

send_dtmf(digits, method) の呼び出しと、DtmfMethod（Inband / Info / Rfc4733）の使い分け、DtmfSent / DtmfReceived イベントの受信を解説

`SipClient::send_dtmf(call_id, digits, method)` で DTMF 信号を送信します（RFC §20 / P16-6 §62.15 / P17-7 §62.27）。

```rust
use siprs::model::CallId;
use siprs::{DtmfMethod, SipClient};

let call_id = CallId::from_u64(call_id_u64)?;
// SIP INFO 方式で "123" を送信
client.send_dtmf(call_id, "123", DtmfMethod::Info).await?;
```

`DtmfMethod` は単一定義の 3 値 enum です（旧 `SipInfo` 表記は SIP INFO の正名 `Info` へ改名済み）。

| 値 | PJSIP 送信 API | 意味 |
|---|---|---|
| `Inband` | `pjsua_call_dial_dtmf` | Inband（RTP ペイロード内 / RFC 2833） |
| `Info` | `pjsua_call_send_dtmf` | SIP INFO（RFC 2976） |
| `Rfc4733` | `pjsua_call_send_dtmf` | RTP イベント（RFC 4733） |

**送出完了契約（§62.27）**: PJSIP には送信完了コールバックが存在しないため、**backend が `send_dtmf` を同期受理し、桁ごとに 500ms タイマーが経過した時点**で `DtmfSent(DtmfSentInfo { status: Ok(()), pjsip_status: None })` が publish されます。`DtmfSentInfo` は `method` / `digit` / `status: Result<(), SentDtmfError>` / `pjsip_status: Option<u32>` を持ちます。

```rust
use siprs::{DtmfMethod, SipEventPayload, SipClient};

let mut events = client.subscribe_account(account_id);
client.send_dtmf(call_id, "5", DtmfMethod::Rfc4733).await?;

while let Ok(event) = events.recv().await {
    if let SipEventPayload::DtmfSent(info) = event.payload {
        println!("DTMF {} sent: {:?}", info.digit, info.status);
        break;
    }
}
```

受信側の `DtmfReceived(DtmfReceivedInfo { method, digit, duration_ms, volume_dbm0 })` は、`pjsua-native` の `on_dtmf_digit` コールバック経由でのみ生成されます（P17-7 で FFI 配線済み）。

> **注意**: `send_dtmf` → `DtmfSent { Ok }` は `make test`（TestBackend）上で検証可能です（reactor テスト `send_dtmf_dispatch_spawns_timeout_after_backend_ok` で固定）。`DtmfReceived` は `pjsua-native` feature（現在ビルド可能）のコールバックが必要です。TestBackend では `NativeEvent::DtmfDigit` の注入により検証できます。

# 音声ストリームの取得（subscribe_audio と AudioChunkPair）

AudioFormat（ビット深度・サンプルレート・チャンネル）とストリームデータの対応を解説し、指定 bit/hz のステレオ WAV ファイルへ書き出す方法まで示す

`SipClient::subscribe_audio(call_id, format, capacity, mode)` で通話の音声ストリームを購読し、`AudioTapHandle::recv()` で `AudioChunkPair` を取得します（RFC §21 / §22 / P16-7 §62.16 / P17-8 §62.28 / P19-3 §62.40）。

```rust
use siprs::model::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
use siprs::{AudioTapMode, SipClient};

let mut tap = client
    .subscribe_audio(
        call_id,
        AudioFormat {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::StereoInOut,
            frame_ms: 20,
        },
        512,
        AudioTapMode::Lossless, // 録音用途のため Lossless モード
    )
    .await?;

while let Some(pair) = tap.recv().await {
    // AudioChunkPair: 同一時刻で揃えられた IN/OUT ペア（StereoInOut では L=IN / R=OUT）
    // 交渉済み AudioFormat（bit depth / sample rate / channels）に一致する 20ms フレーム
}
```

**AudioFormat とストリームデータの対応**: `AudioChunkPair` は交渉済み `AudioFormat`（ビット深度・サンプルレート・チャンネル）に一致する左右ペアです。`ChannelLayout::StereoInOut` では L=IN（受話）/ R=OUT（送話）を表します（RFC §21.1 / §25）。

**WAV 書き出し（P16-7）**: `WavWriter` は `AudioChunkPair` → 指定 bit/hz のステレオ WAV 変換を提供します（PCM16 出力、F32 入力はクリップ/スケール）。StereoInOut は L=IN / R=OUT をインターリーブします。ストリーミングで書き出す場合は `WavWriter::create` + `write_stereo_pair` を、一括変換には `write_stereo_wav(path, &[AudioChunkPair], format)` を使います。

```rust
use siprs::audio::media_path_wiring::WavWriter;

let mut writer = WavWriter::create("recording.wav".as_ref(), &format)?;
while let Some(pair) = tap.recv().await {
    writer.write_stereo_pair(&pair)?;
}
```

**backpressure 2 モード（§22.1）**: `AudioTapMode::Realtime` は最古破棄（consumer が遅れても tap を塞がない）、`Lossless` は producer ブロック（欠損なく全フレームを保証）です。

> **注意（実装状態）**: tap へのフレーム供給は conf bridge の `RustMediaPort` port ops（`get_frame` / `put_frame`）経由で行われます（P17-8 / P19-3 で `push_media_frame` → `push_frame_to_tap` の生産経路が配線済み）。TestBackend では `push_media_frame` 相当の供給関数を明示的に呼ぶことで検証できますが、自動ポンプはありません。実通話の連続生産には `pjsua-native` feature（現在ビルド可能）の conf bridge が必要です。

# 音声の注入（AsyncAudioSource と add_audio_source）

2 者通話における IN / OUT / BOTH チャネルへの音声ファイル・ストリーム注入方法と、マイク入力 source の取得（open_default_microphone_source）を併せて解説

`SipClient::add_audio_source(call_id, source, channels)` で、2 者通話の指定チャネルへ音声を注入します（RFC §23 / §24 / P16-7 / P17-9 / P19-4 §62.41）。

```rust
use siprs::runtime::audio_worker::AsyncAudioSource;
use siprs::{ChannelSelector, SipClient};

struct TtsStreamSource {
    rx: tokio::sync::mpsc::Receiver<Vec<i16>>,
}

impl AsyncAudioSource for TtsStreamSource {
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize {
        match self.rx.recv().await {
            Some(chunk) => {
                let n = chunk.len().min(buf.len());
                buf[..n].copy_from_slice(&chunk[..n]);
                n
            }
            None => 0,
        }
    }
}

let source_id = client
    .add_audio_source(call_id, Box::new(TtsStreamSource { rx }), ChannelSelector::Out)
    .await?;
```

**`ChannelSelector`（RFC §24.4）** は `In` / `Out` / `Both` の 3 値です。`In` は受話（received-audio）経路へ注入し、ローカル再生側に重ねます。`Out` は送話（send-mix）経路へ注入し、相手へ送信する音声に重ねます（TTS を相手に届ける等）。`Both` は両方の独立した経路へ登録します。source は 20ms フレームを返す `AsyncAudioSource` として実装し、`add_audio_source` に `Box<dyn AsyncAudioSource>` で渡します。source が閉じたら自動除去されます（§24.4）。戻り値は `source_id`（`u64`）で、`handle().submit_set_audio_source_gain(source_id, gain)` でゲインを調整できます。

**マイク入力 source の取得（P17-9 / §62.29）**: `open_default_microphone_source(format)` は OS 既定入力デバイス（cpal）の独立キャプチャを `AsyncAudioSource` として返します。これは**通話マイクではない独立キャプチャ source** であり、`add_audio_source` の注入 source として利用できますが、通話の送話入力（call microphone）とは無関係です。`cpal-input` feature（default に含まれる）が必要です。

```rust
use siprs::model::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
use siprs::SipClient;

let mic = client
    .open_default_microphone_source(AudioFormat {
        sample_rate: SampleRate::Hz16000,
        bit_depth: BitDepth::I16,
        channel_layout: ChannelLayout::StereoInOut,
        frame_ms: 20,
    })
    .await?;
let source_id = client
    .add_audio_source(call_id, mic, ChannelSelector::Out)
    .await?;
```

> **注意（実装状態）**: P19-4 / §62.41 で、`AddAudioSource` 時に per-call の `AudioMixer` と `RustMediaPort` の conf bridge 登録（`ensure_conf_port_for_call` → `pjsua_conf_add_port` / `conf_connect`）が再実行されます（旧 RESIDUE の「Initialize 時のみ登録で注入音声が破棄される」問題は解消済み）。実通話で注入音声がネットワーク / ローカル再生に届くことの確認には `pjsua-native` feature（現在ビルド可能）が必要です。TestBackend では source 登録・conf port 再登録・`audio_mixer_for` による source 数の検証が可能です。

# STUN/TURN/ICE とトランスポート設定

ClientConfig への stun_servers / turn_servers / ice の設定方法と、TransportConfig（UDP/TCP/TLS）の選択を併せて解説

`ClientConfig` の `transports` / `stun_servers` / `turn_servers` / `ice` でネットワーク設定を構成します（RFC §12 / §13 / P15-2 / P16-2 / P16-8 / P18-1）。

```rust
use siprs::{
    ClientConfig, IceConfig, SecretString, StunServerConfig, TlsConfig,
    TransportConfig, TurnServerConfig,
};
use siprs::config::transport_ice_spec::TlsTransportConfig;

let config = ClientConfig {
    transports: vec![
        TransportConfig::udp(5060),
        TransportConfig::tcp(5060),
        // TLS トランスポート（tls feature）
        TransportConfig::Tls(TlsTransportConfig {
            bind_addr: "0.0.0.0:5061".parse().unwrap(),
            tls: TlsConfig {
                verify_server: false,
                ca_cert_path: None,
                client_cert_path: None,
                client_key_path: None,
                server_name: None,
                allow_insecure_cipher_legacy: false,
            },
        }),
    ],
    stun_servers: vec![StunServerConfig {
        uri: "stun:stun.l.google.com:19302".into(),
    }],
    turn_servers: vec![TurnServerConfig {
        uri: "turn:turn.example.com:3478".into(),
        username: Some("user".into()),
        password: Some(SecretString::new("pass")),
        transport: Default::default(),
    }],
    ice: IceConfig {
        enabled: true,
        ..IceConfig::default()
    },
    ..ClientConfig::default()
};
let (client, _events) = SipClient::new(config).await?;
```

- **`TransportConfig`** — UDP / TCP / TLS を選択します。`TransportConfig::udp(port)` / `tcp(port)` の便利コンストラクタ、TLS は `TransportConfig::Tls(TlsTransportConfig { bind_addr, tls })` で構築します。TLS は `tls` feature が必要です。
- **`stun_servers`** — `StunServerConfig { uri: "stun:<host>:<port>" }` の一覧。PJSIP の `pjsua_config.stun_srv[]` へ反映されます。
- **`turn_servers`** — `TurnServerConfig` の一覧。TURN はアカウントレベル（`pjsua_acc_config`）で反映され、`apply_turn` は先頭要素を使用します。
- **`ice`** — `IceConfig { enabled, aggressive_nomination, trickle_ice, renomination, max_host_candidates }`。media ICE 設定を反映します。

**実装状態（P16-2 / P16-8 / P18-1）**: `PjsuaBackend::initialize` が `config.transports` を列挙し種別 + ポートを `pjsua_transport_create` へ反映します（`transport_wiring.rs`）。UDP/TCP/TLS → PJSIP 種別マッピングはユニットテスト済みです。STUN / TURN / ICE は `stun_turn_ice_wiring.rs` の `apply_stun` / `apply_turn` / `apply_ice` で `pjsua_config` / `pjsua_acc_config` へ反映され、P18-1 の bindgen enum/const 生成修復により `pjsua-native` でビルド・リンク可能です。coturn に対するプロトコルレベル検証は docker 統合テスト（`make test-integration` → `tests/sip_integration.rs::coturn_stun_turn_ice`）で固定されます。

> **注意**: 既定ビルド（feature なし）では `SipClient::new` が fail-fast するため、実トランスポート生成・STUN/TURN/ICE 反映の動作確認には `--features pjsua-native`（実 PJSIP）または `--features test-util`（TestBackend、実生成はしない）が必要です。

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

> **注意**: 手順 1〜4 は TestBackend 上で検証可能です。手順 5 の実 `pjsua_destroy` は `pjsua-native` feature（現在ビルド可能）配下にあります。

# REST/WebSocket API（siprs-server クレートとの境界）

クライアントライブラリの README には含めず、siprs-server の README に委ねる旨を記載

本 README は **siprs クライアントライブラリ** の利用方法を解説します。REST / WebSocket API による SIP 制御・イベント配信・音声ストリーミングの**サーバランタイム**は、**別クレート `siprs-server`** の責務です。

境界は以下のとおりです（RFC §52 / P2-2）。

- siprs は Axum 等の HTTP 依存を**既定では**持ちません。`server` feature（`axum` / `tower-http`、default off）配下にサーバ側設定型（`ServerConfig` 等）を定義します。
- WebSocket / HTTP のフレームプロトコル型（`WsTextFrame` / `WsBinaryFrame` / `AudioFrameHeader` 等）は siprs に定義され、siprs-server が利用します。
- HTTP/WebSocket API の**サーバ実装・運用方法**は `crates/siprs-server` クレートのドキュメントを参照してください。

# Examples (implementation samples) spec and design

本節は、README の各セクション（H1–H17）で解説した機能を**単一の実装例セット**として統合する examples の設計を示します。siprs は 5 つの例バイナリ（`examples/*.rs`）と共通ヘルパー（`examples/common/`）を提供します（RFC §41 / §62.18 / P8-6 / P19-5）。

## 前提: feature 選択

- **TestBackend 検証**（`make test`）: `--features test-util` で例バイナリのイベント・状態遷移を deterministic に検証できます。
- **実 SIP 検証**（`make test-integration`）: `--features pjsua-native` + docker（Asterisk 20.6.0 / coturn 4.6）で実 PJSIP に対する統合テストを実行します。`pjsua-native` は P18-1 でビルド修復済みです。
- 既定ビルド（feature なし）では `SipClient::new` が fail-fast するため、例バイナリは `pjsua-native` または `test-util` を付けて実行します。

## E1. client_init（RFC §41.1 / H1–H3）

`examples/client_init.rs` — CLI（`--host` / `--port` / `--stun`）から `ClientConfig` を構築し `SipClient::new` を実行、`ClientInitialized(ClientCapabilities)` を受信して終了します。

- **契約（Precondition）**: `ClientConfig` が §42 のバリデーション規則（`event_bus_capacity >= 16`、sample rate 8/16/24/48kHz、raw_sip 容量制約）を通過する。
- **契約（Postcondition）**: `SipClient::new` が `Ok((SipClient, Receiver<SipEvent>))` を返し、イベントバスへ `ClientInitialized` が publish される。
- **契約（Invariant）**: 初期化失敗は fail-fast `Err(InvalidConfig)` で返り、バックエンドは起動しない。
- **テスト**: `make test` で `SipClient::new` 成功・`ClientInitialized` 受信・不正 config で `InvalidConfig`。実 SIP は `tests/sip_integration.rs::client_against_asterisk` / `register_against_asterisk`。

## E2. account_register（RFC §41.2 / H4–H6）

`examples/account_register.rs` — CLI（`--username` / `--domain` / `--password`）から `AccountConfig` を構築し `add_account` → `register()`、`RegistrationStateChanged(Registered | Failed)` を待ち受けます。

- **契約（Precondition）**: `AccountConfig::validate()` 通過（username / domain / password 非空、codec policy 1 以上、DTMF policy 1 以上）。
- **契約（Postcondition）**: `register()` 後 `RegistrationState` が `Registered`（または `Failed`）へ遷移し、`RegistrationStateChanged` が受信できる。
- **契約（Invariant）**: `register_on_start: false` で追加した直後は `Disabled`。`unregister()` で `Unregistering → Idle`。
- **テスト**: TestBackend で完走（P17-4 / §62.24 で `SetRegistration` アームがネイティブ登録イベントを drain するため）。実 SIP は `register_against_asterisk`。

## E3. make_call（RFC §41.3 / H9–H11）

`examples/make_call.rs` — CLI（`--target`）から `OutgoingCallRequest`（全 6 フィールド）を構築し `make_call` → `CallConnected` / `CallDisconnected` を待ち受けます。

- **契約（Precondition）**: `OutgoingCallRequest` の `target_uri` が指定され、`media.preferred_codecs` が `PCMU` / `Opus` のみ。
- **契約（Postcondition）**: `make_call` が実 `CallId`（u64）を返し、`CallConnected`（または `CallDisconnected`）が `meta.call_id` 付きで受信できる。
- **契約（Invariant）**: reject（486/603）は `CallDisconnected` として観測（`CallRejected` は §62.14 で削除済み）。発信側で `OutgoingCallRinging` は発火しない（着信方向専用）。
- **テスト**: TestBackend では `NativeEvent` 注入による `CallEntry.state` 遷移検証。実 SIP は `outgoing_call_to_asterisk` / `register_invite_bye_rtp_flow`（INVITE → 200 → RTP → BYE）。

## E4. audio_tap（RFC §22 / §21 / H13）

`examples/audio_tap.rs` — 通話の `subscribe_audio(call_id, format, capacity, mode)` で tap を購読し、`AudioTapHandle::recv()` で `AudioChunkPair`（L=IN / R=OUT）をストリーム出力します。

- **契約（Precondition）**: 有効な `call_id` と交渉済み `AudioFormat`（bit depth / sample rate / channels）。`validate_tap_capacity` 通過。
- **契約（Postcondition）**: `AudioChunkPair` が指定 `AudioFormat` で連続生産され、`recv()` が返す。
- **契約（Invariant）**: `Realtime` は最古破棄、`Lossless` は producer ブロック（§22.1）。WAV 書き出しは `WavWriter::create` + `write_stereo_pair`（P16-7）。
- **テスト**: `push_media_frame` → `push_frame_to_tap` の供給を明示的に呼ぶユニットテスト。実 SIP は `conf_bridge_drives_audio_tap`（P19-3 / §62.40 で conf bridge port ops → tap の生産経路が配線済み）。TestBackend では自動ポンプはない点に注意。

## E5. tts_source（RFC §23–24 / §41.5 / H14）

`examples/tts_source.rs` — `AsyncAudioSource`（mpsc から 20ms PCM フレームを返す `TtsStreamSource`）を実装し、`add_audio_source(call_id, source, ChannelSelector::Out)` で注入、`submit_set_audio_source_gain` でゲイン調整します。

- **契約（Precondition）**: `AsyncAudioSource::next_chunk` が 20ms フレームを返す。有効な `call_id` と `ChannelSelector`（In / Out / Both）。
- **契約（Postcondition）**: `add_audio_source` が source を per-call `AudioMixer` へ登録し、指定チャネルへ mix される。戻り値は `source_id`（u64）。
- **契約（Invariant）**: source が閉じたら自動除去（§24.4）。`open_default_microphone_source(format)` は**通話マイクではない独立キャプチャ source**（cpal、`cpal-input` feature）。
- **テスト**: source 登録・conf port 再登録・`audio_mixer_for` の source 数検証。実 SIP は `add_audio_source_reaches_conf_bridge`（P19-4 / §62.41 で `AddAudioSource` 時に `ensure_conf_port_for_call` → conf bridge 再登録が配線済み）。

## 検証方法

```bash
# 全テスト（TestBackend）
make test

# 実 SIP 統合テスト（docker Asterisk / coturn、pjsua-native）
make test-integration
```

`make test-integration` は `docker compose up` → `cargo test --features pjsua-native --test sip_integration` → `docker compose down`（trap で常に teardown）を実行します。

## 実装チケットの依存関係

- 例バイナリ本体: `P8-6` / `P9-1` / `P13-3` / `P14-3`。
- audio subscribe: `P8-8` / `P9-2`（E4 の前提）。
- メディア配線: `P15-7` Layer 3+、`P17-8`（tap 供給構造）、`P19-3`（push_media_frame 生産経路）、`P19-4`（AddAudioSource 時 conf bridge 再登録）。
- 実 SIP 統合テスト基盤: `P16-10` / `P19-5`（docker Asterisk / coturn、`register_invite_bye_rtp_flow` 等）。
- bindgen enum/const 生成修復: `P18-1`（pjsua-native ビルド修復の前提）。
