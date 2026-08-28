# RFC-ROOT

> 対象 RFC: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT.md
> 生成グラフ: /Users/sh01/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json

# クイックスタート（SipClient 初期化と最初のステップ）

トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **既定ビルドでは `SipClient::new` が実行時失敗**する。`CoreReactor::spawn` → `create_backend(...)?`（`src/runtime/reactor.rs`）が `pjsua-native` なしで `Err("SipClient requires the `pjsua-native` feature")` を返す（`src/runtime/backend_selection.rs`）。クイックスタートの「トランスポートと STUN を設定した初期化コード」は既定ビルドで起動できない。
- **本番バックエンドがビルド不能**: `cargo check --features pjsua-native` は **69 エラー**。vendored ヘッダ（`vendor/prebuilt/aarch64-apple-darwin/include`）を実測検証した結果、エラーは **allowlist 修正だけでは解消不能なカテゴリを含む**:

  1. **`PJ_*` 定数が `bindings` に存在しない（E0432 / E0425、計 19 件）**: `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJ_ENOMEM` / `PJ_EBUSY`（`src/error/error_design_siperror.rs`、`src/ffi/callback.rs`、`src/ffi/backend_calls.rs` 他）。`PJ_SUCCESS` は `pj/types.h:93` の **enum 列挙子**（`typedef enum { PJ_SUCCESS=0, ... }` の一部）であり、型 allowlist では emit されない。→ **const allowlist / enum 生成の bindgen 設定変更**が必要。
  2. **vendored ヘッダに存在しない定数（`PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD`）**: vendored ツリー全体を grep しても**未定義**。allowlist に追加しても emit できない。→ **vendored PJSIP の更新 or コードの代替定数への修正**が必要。
  3. **`pjsua_config.turn_cfg` / `turn_cfg_use`（E0609、`src/config/stun_turn_ice_wiring.rs`）**: フィールドは vendored ヘッダ（`pjsua.h:4751,4757`）に**実在**する。→ allowlist で `pjsua_config` 構造体全体を emit すれば解消可能。
  4. **`pjsua_codec_info.encoding_name` / `clock_rate`（E0609、`src/config/observability_metrics.rs`）**: vendored ヘッダの `pjsua_codec_info`（`pjsua.h:8155`）には `codec_id` / `priority` しかなく、**これらのフィールドは存在しない**。→ allowlist では解消不能。vendored PJSIP の更新 or コードを `codec_id` パースへ修正が必要。
  5. **`pjsip_inv_state::CALLING` 等（E0599、計 28 件、`src/state/m20_callstate_mapping.rs`）**: bindgen が `pjsip_inv_state` を `u32` の型エイリアスとして生成しており、enum 列挙子アクセスが成立しない。C ヘッダの enum（`sip_inv.h:87-96`）は実在するため、bindgen 設定（`prepend_enum_name(false)` 等）で enum として生成するか、コードを定数参照へ修正する必要がある。
  6. **`AccountId` がスコープにない（E0433、計 2 件、`src/runtime/backend.rs:1029,1213`）**: pjsua-native cfg 内のコードが `AccountId` を import していない。→ **純コード修正**（`use crate::model::AccountId` の追加）で解消。
  7. **FFI シグネチャ不整合（E0308、計 3 件、`src/ffi/backend_calls.rs:366,428,447`）**: `pjsua_codec_set_priority` / `pjsua_conf_add_port` / `pjsua_call_get_conf_port` の引数・戻り値の型が bindgen 生成シグネチャと不一致。→ コードを生成シグネチャへ合わせる修正が必要。

- トランスポート / STUN の配線コード自体は存在する（`src/ffi/transport_wiring.rs` の種別・ポート反映、`src/config/stun_turn_ice_wiring.rs` の `stun_srv` 反映）が、すべて `#[cfg(feature = "pjsua-native")]` 配下にあり、当該 feature がビルド不能のため実行されない。
- 唯一動作するのは TestBackend（`--features test-util`）だが、実トランスポート生成・STUN 解決は行わない。

### 実装補強設計（完全記述への条件）

1. **bindgen 設定の修正**（`src/build/build_script_bindgen.rs` + 必要なら `build.rs`）:
   - 型 allowlist に `pjsua_config` を追加し**構造体全体**（`turn_cfg` / `turn_cfg_use` 含む）を emit する（上記 3）。
   - `PJ_SUCCESS` 等の enum 列挙子を const として emit する設定（上記 1）。
   - `pjsip_inv_state` を enum（または列挙子 const）として生成する設定（上記 5）。
2. **vendored PJSIP の更新 or コード修正**（上記 2 / 4）:
   - `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` を持たない現 vendored ヘッダを、それらを持つ PJSIP バージョンへ更新する。
   - または、`pjsua_codec_info.encoding_name` / `clock_rate` を使うコード（`src/config/observability_metrics.rs`）を `codec_id` パースへ修正する。
3. **コード修正**（上記 6 / 7）: `src/runtime/backend.rs` に `AccountId` の import を追加、`src/ffi/backend_calls.rs` の FFI 呼び出しを bindgen 生成シグネチャへ合わせる。
4. 上記完了後、`cargo build --features pjsua-native` が通ること。ビルド修復後、`SipClient::new` + トランスポート生成 + STUN 反映を実 PJSIP に対して統合テストで固定。

---

**設計方針参照**: プレビルド生成（プロデューサー）・build.rs 消費パイプライン（コンシューマー）・2 チケット構成（bindgen 整合 / プレビルド生成+CI+コミット）・Docker 実 PJSIP テスト要件の詳細は **`docs/PJSUA-NATIVE-PREBUILT-DESIGN-BRIEF.md`** を参照。

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **既定ビルドでは `SipClient::new` が実行時失敗**する。`CoreReactor::spawn` → `create_backend(...)?`（`src/runtime/reactor.rs`）が `pjsua-native` なしで `Err("SipClient requires the `pjsua-native` feature")` を返す（`src/runtime/backend_selection.rs`）。クイックスタートの「トランスポートと STUN を設定した初期化コード」は既定ビルドで起動できない。
- **本番バックエンドがビルド不能**: `cargo check --features pjsua-native` は **69 エラー**。vendored ヘッダ（`vendor/prebuilt/aarch64-apple-darwin/include`）を実測検証した結果、エラーは **allowlist 修正だけでは解消不能なカテゴリを含む**:

  1. **`PJ_*` 定数が `bindings` に存在しない（E0432 / E0425、計 19 件）**: `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJ_ENOMEM` / `PJ_EBUSY`（`src/error/error_design_siperror.rs`、`src/ffi/callback.rs`、`src/ffi/backend_calls.rs` 他）。`PJ_SUCCESS` は `pj/types.h:93` の **enum 列挙子**（`typedef enum { PJ_SUCCESS=0, ... }` の一部）であり、型 allowlist では emit されない。→ **const allowlist / enum 生成の bindgen 設定変更**が必要。
  2. **vendored ヘッダに存在しない定数（`PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD`）**: vendored ツリー全体を grep しても**未定義**。allowlist に追加しても emit できない。→ **vendored PJSIP の更新 or コードの代替定数への修正**が必要。
  3. **`pjsua_config.turn_cfg` / `turn_cfg_use`（E0609、`src/config/stun_turn_ice_wiring.rs`）**: フィールドは vendored ヘッダ（`pjsua.h:4751,4757`）に**実在**する。→ allowlist で `pjsua_config` 構造体全体を emit すれば解消可能。
  4. **`pjsua_codec_info.encoding_name` / `clock_rate`（E0609、`src/config/observability_metrics.rs`）**: vendored ヘッダの `pjsua_codec_info`（`pjsua.h:8155`）には `codec_id` / `priority` しかなく、**これらのフィールドは存在しない**。→ allowlist では解消不能。vendored PJSIP の更新 or コードを `codec_id` パースへ修正が必要。
  5. **`pjsip_inv_state::CALLING` 等（E0599、計 28 件、`src/state/m20_callstate_mapping.rs`）**: bindgen が `pjsip_inv_state` を `u32` の型エイリアスとして生成しており、enum 列挙子アクセスが成立しない。C ヘッダの enum（`sip_inv.h:87-96`）は実在するため、bindgen 設定（`prepend_enum_name(false)` 等）で enum として生成するか、コードを定数参照へ修正する必要がある。
  6. **`AccountId` がスコープにない（E0433、計 2 件、`src/runtime/backend.rs:1029,1213`）**: pjsua-native cfg 内のコードが `AccountId` を import していない。→ **純コード修正**（`use crate::model::AccountId` の追加）で解消。
  7. **FFI シグネチャ不整合（E0308、計 3 件、`src/ffi/backend_calls.rs:366,428,447`）**: `pjsua_codec_set_priority` / `pjsua_conf_add_port` / `pjsua_call_get_conf_port` の引数・戻り値の型が bindgen 生成シグネチャと不一致。→ コードを生成シグネチャへ合わせる修正が必要。

- トランスポート / STUN の配線コード自体は存在する（`src/ffi/transport_wiring.rs` の種別・ポート反映、`src/config/stun_turn_ice_wiring.rs` の `stun_srv` 反映）が、すべて `#[cfg(feature = "pjsua-native")]` 配下にあり、当該 feature がビルド不能のため実行されない。
- 唯一動作するのは TestBackend（`--features test-util`）だが、実トランスポート生成・STUN 解決は行わない。

### 実装補強設計（完全記述への条件）

1. **bindgen 設定の修正**（`src/build/build_script_bindgen.rs` + 必要なら `build.rs`）:
   - 型 allowlist に `pjsua_config` を追加し**構造体全体**（`turn_cfg` / `turn_cfg_use` 含む）を emit する（上記 3）。
   - `PJ_SUCCESS` 等の enum 列挙子を const として emit する設定（上記 1）。
   - `pjsip_inv_state` を enum（または列挙子 const）として生成する設定（上記 5）。
2. **vendored PJSIP の更新 or コード修正**（上記 2 / 4）:
   - `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` を持たない現 vendored ヘッダを、それらを持つ PJSIP バージョンへ更新する。
   - または、`pjsua_codec_info.encoding_name` / `clock_rate` を使うコード（`src/config/observability_metrics.rs`）を `codec_id` パースへ修正する。
3. **コード修正**（上記 6 / 7）: `src/runtime/backend.rs` に `AccountId` の import を追加、`src/ffi/backend_calls.rs` の FFI 呼び出しを bindgen 生成シグネチャへ合わせる。
4. 上記完了後、`cargo build --features pjsua-native` が通ること。ビルド修復後、`SipClient::new` + トランスポート生成 + STUN 反映を実 PJSIP に対して統合テストで固定。

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- **既定ビルドでは `SipClient::new` が実行時失敗**する。`CoreReactor::spawn` → `create_backend(...)?`（`src/runtime/reactor.rs`）が `pjsua-native` なしで `Err("SipClient requires the `pjsua-native` feature")` を返す（`src/runtime/backend_selection.rs`）。クイックスタートの「トランスポートと STUN を設定した初期化コード」は既定ビルドで起動できない。
- **本番バックエンドがビルド不能**: `cargo check --features pjsua-native` は **69 エラー**。bindgen 出力に `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJ_ENOMEM` / `PJ_EBUSY` / `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` / `PJMEDIA_*` 等の定数が欠如（E0432 / E0425）、`pjsua_config` に `turn_cfg` / `turn_cfg_use` フィールドがない（E0609）、`pjsua_codec_info` に `encoding_name` / `clock_rate` がない（E0609）、`pjsip_inv_state` の列挙値（NULL/CALLING/INCOMING/EARLY/CONNECTING/CONFIRMED/DISCONNECTED）が `u32` に対して解決されない（E0599）。
- トランスポート / STUN の配線コード自体は存在する（`src/ffi/transport_wiring.rs` の種別・ポート反映、`src/config/stun_turn_ice_wiring.rs` の `stun_srv` 反映）が、すべて `#[cfg(feature = "pjsua-native")]` 配下にあり、当該 feature がビルド不能のため実行されない。
- 唯一動作するのは TestBackend（`--features test-util`）だが、実トランスポート生成・STUN 解決は行わない。

### 実装補強設計（完全記述への条件）

1. **bindgen allowlist の修正**（`src/build/build_script_bindgen.rs`）: `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJ_ENOMEM` / `PJ_EBUSY` / `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` / `PJMEDIA_*` 定数、`pjsua_config` 全フィールド（`turn_cfg` / `turn_cfg_use` 含む）、`pjsua_codec_info`（`encoding_name` / `clock_rate`）、`pjsip_inv_state` の列挙値を emit する。→ `cargo build --features pjsua-native` が通ること。
2. ビルド修復後、`SipClient::new` + トランスポート生成 + STUN 反映を実 PJSIP に対して統合テストで固定。

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

> **注意（現在の実装状態）**: トランスポート / STUN/TURN/ICE は §12/§13 の統合型（`transport_ice_spec`）に一本化され、PJSIP への反映コード（`transport_wiring` / `stun_turn_ice_wiring`）も実装済みです（P16-2 / P16-8）。ただし反映コードは `pjsua-native` feature 配下にあり、現在この feature はビルド不能です（bindgen 定数・`pjsua_config.turn_cfg` 等の欠如）。また `audio.resampler_quality` は現状 `String` 型（既定値 `"High"`）であり、RFC の `ResamplerQuality` enum は未実装です。設定の構築・既定値・バリデーションは `make test`（`--features test-util` の TestBackend）上で検証可能です。

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

> **注意**: サンプルレート規則は `audio.default_delivery_format.sample_rate`（既定配信フォーマット）にのみ適用されます。バリデーションはバックエンド起動前に行われるため、既定ビルドでも検証できます。実 SIP の初期化には `pjsua-native` feature が必要ですが、現在ビルド不能です。

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

> **注意**: 上記コードは `make test`（TestBackend）上で検証可能です。TestBackend では `add_account` の状態遷移（`Disabled` / `Registering`）と `update_config` の命令発行・状態遷移までを検証できます。`register_on_start` による自動登録の `RegistrationStateChanged` は、TestBackend の `AddAccount` / `UpdateAccount` アームがネイティブイベントを drain しないため即時 publish されません（P17-4 / §62.24 は `SetRegistration` アームのみ）。実 SIP の REGISTER 送出には `pjsua-native` feature が必要ですが、現在ビルド不能です。

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

> **注意**: 明示的な `register()` 後の `RegistrationStateChanged(Registered)` は `make test`（TestBackend）上で検証できます（reactor テスト `set_registration_arm_drains_and_publishes_registered` で固定）。一方、`register_on_start` による自動登録では、TestBackend の `AddAccount` / `UpdateAccount` アームはネイティブイベントを drain しないため、追加直後の `RegistrationStateChanged` は publish されません（状態は `Registering` へ遷移します）。実 SIP の REGISTER / UNREGISTER 送出には `pjsua-native` feature（現在ビルド不能）が必要です。

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

- `subscribe()` / `subscribe_account(id)` / `subscribe_raw_sip()` は `Subscription<T>` を返し、明示 `unsubscribe()` で購読解除できる（P17-9 / §62.29）。`recv()` は主要イベント（Registration / Call / DTMF）を TestBackend 上で受信できます。
- **しかし「subscribe_raw_sip() の受信コード」は依然として成立しない**。raw SIP の生産経路は `pjsip_module` フック（`src/ffi/raw_sip_module.rs`、P17-2 / §62.22 で実装済み）であり、`pjsua-native` feature 配下の `backend_calls::initialize` でのみ登録される。TestBackend / 既定ビルドでは `enqueue_raw_sip_bytes` を呼ぶ経路が存在せず、`subscribe_raw_sip()` は無音のチャネルを返す（`--features test-util` で `recv()` は永久待機）。
- **`IceTransportError` は未配線のまま**（P17-3 / §62.23 のスコープ外として残置）。`on_ice_transport_error` は `pjsua_callback` ミラー（`src/ffi/bindings.rs`）にフィールドがなく、`NativeEvent::IceTransportError` を生成する生産コードはゼロ。`TransportStateChanged` / `CallTsxStateChanged` / `CallReplaced` / `NatDetected` は登録済み（`src/ffi/callback.rs`）。
- 本番 FFI 経路は pjsua-native ビルド修復が前提（H1 参照）。

### 実装補強設計（完全記述への条件）

1. **raw SIP publisher の検証経路**: pjsua-native ビルド修復後、`subscribe_raw_sip()` が実 SIP メッセージを受信できることを統合テストで固定。TestBackend で検証する場合は、TestBackend が `enqueue_raw_sip_bytes` を呼ぶテスト専用フックを用意する。
2. **`on_ice_transport_error` の登録**: `pjsua_callback` にフィールドを追加し、`NativeEvent::IceTransportError` を生成する経路を実装する（新規チケット。P17-3 の残項目）。
3. pjsua-native のビルド修復（H1 参照）。

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

> **注意**: TestBackend では `make_call` は call id の採番と登録のみを行い、イベントは publish しません（ネイティブイベントの注入はテスト専用）。実 SIP のイベント系列には `pjsua-native` feature（現在ビルド不能）と実 PJSIP コールバックが必要です。上記コードは `make test`（TestBackend）上で検証可能です。

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

> **注意**: `IncomingCall` は `pjsua-native` の `on_incoming_call` コールバックでのみ生成されます。TestBackend では `NativeEvent::IncomingCall` の注入により一連のフロー（着信登録 → answer(200) → `CallConnected` / answer(486) → `CallDisconnected`）を検証できます（reactor のテストで固定）。実 SIP には `pjsua-native` feature（現在ビルド不能）が必要です。また FFI 経路では `caller_uri` が空文字になるため、着信 URI の表示は別途の解決が必要です。

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

> **注意**: 発信通話では `OutgoingCallRinging` は発火しません（着信方向の CONNECTING 遷移専用）。実 SIP のイベント系列には `pjsua-native` feature（現在ビルド不能）が必要です。

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

> **注意**: `send_dtmf` → `DtmfSent { Ok }` は `make test`（TestBackend）上で検証可能です（reactor テスト `send_dtmf_dispatch_spawns_timeout_after_backend_ok` で固定）。`DtmfReceived` は `pjsua-native` feature（現在ビルド不能）のコールバックが必要です。TestBackend では `NativeEvent::DtmfDigit` の注入により検証できます。

# 音声ストリームの取得（subscribe_audio と AudioChunkPair）

AudioFormat（ビット深度・サンプルレート・チャンネル）とストリームデータの対応を解説し、指定 bit/hz のステレオ WAV ファイルへ書き出す方法まで示す

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `subscribe_audio(call_id, format, capacity, mode)` は存在し、`AudioTapHandle::recv()` は `Option<AudioChunkPair>` を返す（`src/client.rs`、`src/api/audio_subscribe_bp.rs`）。`AudioChunkPair` / `ChannelLayout::StereoInOut`（L=IN / R=OUT）/ `AudioFormat` は公開型として一致する（`src/model/audio_format_chunkpair.rs`）。
- ✅ **P16-7 で WAV ライタは実装済み**: `WavWriter` / `write_stereo_wav` が存在し（`src/audio/media_path_wiring.rs`）、StereoInOut は L=IN / R=OUT をインターリーブ、出力は PCM16（F32 入力はクリップ/スケール）。
- ✅ **P17-8 で tap 供給の構造は実装済み**: `push_frame_to_tap`（`src/runtime/backend.rs`）が `RustMediaPort` の port ops（`get_frame` / `put_frame`、`src/runtime/audio_worker.rs`）から呼ばれ、`AudioTapSender::try_push` へ `AudioChunkPair` を供給する。
- **しかし TestBackend では tap が永久待機する**。tap への供給点は (1) `PjsuaBackend::push_media_frame` と (2) `RustMediaPort` の port ops の 2 箇所のみ。`TestBackend::push_media_frame` は呼び出し記録のみで `push_frame_to_tap` を呼ばず、`RustMediaPort` は pjsua-native の conf bridge（`pjsua_conf_add_port`）でのみ駆動される。**`push_media_frame` の生産コードからの呼び出し元はゼロ**（`#[cfg(test)]` 内のみ）。→ `AudioTapHandle::recv()` は TestBackend / 既定ビルドで実運用上ブロックし続ける。
- 既定ビルドでは `SipClient::new` 自体が失敗する（H1 参照）。

### 実装補強設計（完全記述への条件）

1. **`push_media_frame` の生産経路を配線**: conf port の `put_frame` / `get_frame` 経路（または明示的なメディアパイプラインステップ）から `push_media_frame` を呼び、tap へ `AudioChunkPair` を連続供給する。P17-8 の構造（`push_frame_to_tap` 共有ヘルパー）は完成しているため、実 PJSIP（pjsua-native）の conf bridge が `RustMediaPort` を駆動することをビルド修復後に統合テストで固定する。
2. pjsua-native のビルド修復（H1 参照）後、`AudioChunkPair` → 指定 bit/hz のステレオ WAV 書き出し（`write_stereo_wav`）が連続生産されたフレームに対して成立することを統合テストで固定。

# 音声の注入（AsyncAudioSource と add_audio_source）

2 者通話における IN / OUT / BOTH チャネルへの音声ファイル・ストリーム注入方法と、マイク入力 source の取得（open_default_microphone_source）を併せて解説

<::README-RESIDUE::>
`open_default_microphone_source` は **通話マイクではない独立キャプチャ source** です（§62.29）。OS 既定入力デバイス（cpal）の独立キャプチャを `AsyncAudioSource` として返し、`add_audio_source` の注入 source として利用できますが、通話の送話入力（call microphone）とは無関係です。

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `add_audio_source(call_id, source, channels)` は存在し、`call_id` と `ChannelSelector`（In/Out/Both）を受け取り per-call `AudioMixer` へ登録する（`src/client.rs`、`src/runtime/reactor.rs`）。`AudioWorkerTask::spawn` も reactor の生産経路で呼ばれる。
- ✅ **P16-7 で解消**: `RustMediaPort` が `out_queue` / `in_queue` を消費する conf port コンシューマとして実装された。`make_call` / `answer` の call connect 時（`CallConnected` 発行）に `conf_connect(call_id, call_id)` が自動発行される。
- ✅ **P16-7 で解消**: `WavFileSource`（PCM16 WAV のみ、リサンプルなし）と `open_default_microphone_source`（cpal、OS 既定入力デバイスの独立キャプチャ）が実装された。
- ✅ **P17-9 で解消**: `open_default_microphone_source` は「注入可能なキャプチャ source」であり通話マイクではない独立キャプチャである旨を本節に明記（上記段落）。
- **しかし `RustMediaPort` が実通話の conf bridge に登録されない**: `register_media_ports_for_calls`（`pjsua_conf_add_port` で `RustMediaPort` を登録する唯一の箇所）は **`Initialize` 時に一度だけ**呼ばれ、その時点で `audio_mixers` は空である（`src/runtime/command.rs`、`src/runtime/backend.rs`）。`AddAudioSource` 後には再実行されないため、実通話で `RustMediaPort` は登録されず、注入音声は `out_queue`（64 フレーム ≈ 1.28 秒）に溜まり**破棄される**（P17-8 / §62.28 では未解消）。
- TestBackend では mixer は worker ループに給餌されるが、`out_queue` / `in_queue` のコンシューマ（`RustMediaPort`）が存在しないため、注入音声はどこからも観測できない。

### 実装補強設計（完全記述への条件）

1. **`AddAudioSource` で mixer 生成時に conf bridge への `RustMediaPort` 登録を再実行**する（`register_media_ports_for_calls` 相当を mixer 作成経路で呼ぶ。新規チケット。ギャップ）。
2. pjsua-native のビルド修復（H1 参照）後、実通話で注入音声がネットワーク送信 / ローカル再生に届くことを統合テストで固定。
3. ✅ **P17-9 で解消**: `open_default_microphone_source` は「注入可能なキャプチャ source」であり通話マイクではない旨を README に明記（上記段落で解消）。

# STUN/TURN/ICE とトランスポート設定

ClientConfig への stun_servers / turn_servers / ice の設定方法と、TransportConfig（UDP/TCP/TLS）の選択を併せて解説

<::README-RESIDUE::>
## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- 型の一本化は実現: 単一の `TransportConfig` / `StunServerConfig` / `TurnServerConfig` / `IceConfig`（`src/config/transport_ice_spec.rs`）。P15-2 が旧重複を除去した。
- ✅ **P16-2 / P16-8 で配線コードは実装済み**: `PjsuaBackend::initialize` が `config.transports` を列挙し種別 + ポートを `pjsua_transport_create` へ反映（`src/ffi/transport_wiring.rs`、`src/runtime/backend.rs`）。`apply_stun_turn` が `pjsua_config.stun_srv[]` / `turn_cfg` / `turn_cfg_use` を反映し（`src/config/stun_turn_ice_wiring.rs`）、`apply_ice` が media ICE 設定を反映する。UDP/TCP/TLS → PJSIP 種別マッピングはユニットテスト済み。
- **しかし本番（`pjsua-native`）は依然としてビルド不能（69 エラー）**。本節に直接関わるのは以下の 2 点:
  - `src/config/stun_turn_ice_wiring.rs` の `apply_stun_turn` が参照する **`pjsua_config.turn_cfg` / `turn_cfg_use` が bindgen 生成物に存在しない（E0609）**。フィールド自体は vendored ヘッダ（`pjsua.h:4751,4757`）に**実在**するため、**bindgen の型 allowlist で `pjsua_config` 構造体全体を emit すれば解消可能**（H1 の補強 1 に該当）。
  - `PJ_SUCCESS` / `PJ_EBUSY` / `PJ_EINVALIDOP` 等の定数が bindings に存在しない（E0425）。`PJ_SUCCESS` は `pj/types.h:93` の enum 列挙子であり、const/enum 生成の bindgen 設定が必要（H1 の補強 1 に該当）。
- 既定ビルドでは `SipClient::new` が `"SipClient requires the pjsua-native feature"` で失敗し、設定を実演できない（H1 参照）。

### 実装補強設計（完全記述への条件）

1. **bindgen 設定の修正**（H1 の補強 1 と同一）: `pjsua_config` 構造体全体（`turn_cfg` / `turn_cfg_use` 含む）と `PJ_*` 定数を emit する。→ `cargo build --features pjsua-native` が通ること。
2. ビルド修復後、`stun_servers` / `turn_servers` / `ice` と `TransportConfig` が実 PJSIP に反映されることを統合テスト（coturn プロトコルレベル検証、P16-8 / P16-10）で固定。

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- 型の一本化は実現: 単一の `TransportConfig` / `StunServerConfig` / `TurnServerConfig` / `IceConfig`（`src/config/transport_ice_spec.rs`）。P15-2 が旧重複を除去した。
- ✅ **P16-2 / P16-8 で配線コードは実装済み**: `PjsuaBackend::initialize` が `config.transports` を列挙し種別 + ポートを `pjsua_transport_create` へ反映（`src/ffi/transport_wiring.rs`、`src/runtime/backend.rs`）。`apply_stun_turn` が `pjsua_config.stun_srv[]` / `turn_cfg` / `turn_cfg_use` を反映し（`src/config/stun_turn_ice_wiring.rs`）、`apply_ice` が media ICE 設定を反映する。UDP/TCP/TLS → PJSIP 種別マッピングはユニットテスト済み。
- **しかし本番（`pjsua-native`）は依然としてビルド不能（69 エラー）**。特に `pjsua_config` に `turn_cfg` / `turn_cfg_use` フィールドがないため（E0609）、TURN 反映コード（`stun_turn_ice_wiring.rs`）がコンパイルできない。`PJ_SUCCESS` / `PJ_EBUSY` / `PJ_EINVALIDOP` 等の定数も bindgen 出力に欠如。
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

README の 17 セクション中 5 セクション（H1 / H8 / H13 / H14 / H15）が RESIDUE であり、Examples が「単一実装例に全セクションを統合し、確実に動作する」ことは、その前提たる機能実装が未完了のため成立しない。

- **本番バックエンドがビルド不能**: `cargo check --features pjsua-native` は **69 エラー**（bindgen 定数 `PJ_SUCCESS` / `PJ_EINVALIDOP` / `PJ_ENOMEM` / `PJ_EBUSY` / `PJSUA_CALL_NULL` / `PJ_CRED_DATA_PLAIN_PASSWD` / `PJMEDIA_*` の欠如、`pjsua_config.turn_cfg` / `turn_cfg_use` 欠如、`pjsua_codec_info` の `encoding_name` / `clock_rate` 欠如、`pjsip_inv_state` 列挙値の解決不能）。→ 実 SIP 通信を伴う example は成立しない（H1）。
- **既定ビルドでは `SipClient::new` が実行時失敗**: `cargo run --example client_init` は `"SipClient requires the pjsua-native feature"` で即失敗（`src/runtime/backend_selection.rs`）。examples はコンパイル可能だが、既定ビルドではどの example も起動できない。
- **TestBackend（`--features test-util`）では `client_init` のみ完走**: `cargo run --example client_init --features test-util` は `ClientInitialized` 受信まで成功する。しかし他の example は以下で失敗する。
- **account_register は TestBackend で完走可能に修正済み（P17-4 / §62.24）**: `examples/account_register.rs` は subscribe-before-register で `RegistrationStateChanged(Registered / Failed)` を受信する（reactor の `SetRegistration` アームが `TestBackend::take_native_events()` を drain するため）。→ 前回 RESIDUE から改善。
- **make_call はイベント待ちで失敗する**: `examples/make_call.rs` は発信イベントを待つが、TestBackend では `make_call` はイベントを一切 publish しない（`src/runtime/reactor.rs` の `handle_make_call` は登録のみ）。`OutgoingCallRinging` は着信方向専用であり、発信側の正規イベントは `OutgoingCallTrying`（H9 / H11 参照）。
- **audio_tap は永久待機する**: `subscribe_audio` は `AudioTapSender` を tap レジストリへ登録するが、`push_frame_to_tap` を呼ぶ生産経路は pjsua-native の conf bridge（`RustMediaPort` port ops）のみ。P17-8 / §62.28 で構造（共有ヘルパー + port ops 供給）は実装済みだが、TestBackend では `AudioTapHandle::recv()` はブロックし続ける（H13 参照）。
- **tts_source は音声が流れない**: `AudioWorkerInner::process_frame` は `out_queue` / `in_queue` へ push するが、`RustMediaPort` が conf bridge に登録されるのは `Initialize` 時（`audio_mixers` が空）の一度だけであり、`AddAudioSource` 後には登録されない（`src/runtime/command.rs`、`src/runtime/backend.rs`）。注入音声は out_queue に溜まり破棄される（H14 参照）。
- **raw SIP は配信されない**: raw SIP の生産経路は `pjsip_module` フック（`src/ffi/raw_sip_module.rs`、P17-2 / §62.22）だが pjsua-native 配下でのみ登録され、TestBackend では `subscribe_raw_sip()` は無音のチャネルを返す（H8 参照）。

### 実装補強設計（Examples が完全記述になるための条件）

#### 前提: 各 README セクションの RESIDUE 解消

Examples が「確実に動作する」には、以下が先に実装される必要がある（チケット化の素材。各セクション RESIDUE を参照）。

1. **本番バックエンドのビルド修復**: `pjsua-native` の 69 エラー解消（bindgen allowlist とコード期待の整合、`pjsua_config.turn_cfg` / `turn_cfg_use`、`PJ_*` 定数、`pjsua_codec_info` フィールド、`pjsip_inv_state` 列挙値）。チケット: `P8-16` / `P10-2` / `P11-5` / `P13-4`（H1）。
2. **イベント経路の完成**: raw SIP publisher の TestBackend 検証経路（H8）、`on_ice_transport_error` の登録（H8、P17-3 の残項目）。
3. **メディア経路の完成**: `push_media_frame` の生産経路配線（H13）、`AddAudioSource` 時の `RustMediaPort` conf bridge 登録再実行（H14）。

#### Examples 設計（実装後に完全記述化する目標）

5 つの例バイナリ（`examples/common/cli.rs` の CLI パースと `examples/common/client.rs` の add_account ヘルパーを共通利用）を、各 README セクションの契約に沿って再定義する。

**E1. client_init（RFC §41.1 / H1-H3）**
- 契約: 前 `ClientConfig` がバリデーション通過（§42）／後 `SipClient::new` が `Ok` を返し `ClientInitialized(ClientCapabilities)` が publish される／不変: 初期化失敗は fail-fast `Err(InvalidConfig)`。※ TestBackend 上では現に完走（検証済み）。
- テスト: `SipClient::new` 成功・`ClientInitialized` 受信・不正 config で `InvalidConfig`。

**E2. account_register（RFC §41.2 / §17 / H4-H6）**
- 契約: 前 `register_on_start` または明示 `register()` が submit される／後 `RegistrationState` が `Registered` へ遷移し、`RegistrationStateChanged` が受信できる／不変: 未登録時は `Disabled`。
- テスト: 登録成功・失敗（4xx）、`unregister()` で `Unregistering → Idle`。※ TestBackend 上で完走（P17-4 で検証済み）。

**E3. make_call（RFC §41.3 / §18-19 / H9-H11）**
- 契約: 前 `OutgoingCallRequest` の全 6 フィールドが検証通過／後 `make_call` が実 `CallId`（u64）を返し、`CallConnected`（または `CallDisconnected`）が `meta.call_id` 付きで受信できる／不変: reject（486/603）は `CallDisconnected` で観測。
- テスト: 発信成功・拒否（486/603）・`hangup` での切断、イベント順序（`OutgoingCallStarted → OutgoingCallTrying → CallConnected`）。TestBackend では `NativeEvent` 注入による検証のみ（P17-5 で `CallEntry.state` 更新は実装済み）。

**E4. audio_tap（RFC §22 / §21 / H13）**
- 契約: 前 `subscribe_audio(call_id, format, capacity, mode)` が有効な tap を返す／後 `AudioChunkPair`（L=IN / R=OUT）が交渉済み `AudioFormat` で連続生産される／不変: `Realtime` は最古破棄、`Lossless` は producer ブロック（§22.1）。
- テスト: フレーム連続生産・フォーマット一致・backpressure 両モード・`AudioChunkPair` → 指定 bit/hz のステレオ WAV 変換（`write_stereo_wav` / `WavWriter` は P16-7 で実装済み）。※ tap 駆動は pjsua-native conf bridge が前提（P17-8 の構造は実装済み）。

**E5. tts_source（RFC §23-24 / §41.5 / H14）**
- 契約: 前 `AsyncAudioSource::next_chunk` が 20ms フレームを返す／後 `add_audio_source(call_id, source, channels)` が source を登録し、IN/OUT/BOTH の指定チャネルへ mix される／不変: source が閉じたら自動除去。
- テスト: ストリーム source の注入、BOTH/IN/OUT 各チャネルへのルーティング、`open_default_microphone_source` の注入（通話マイクではなく独立キャプチャである点を明記）。※ `AddAudioSource` 時の conf bridge 登録再実行が前提（H14）。

#### 検証方法

- `make test`（`--features test-util`、TestBackend）で全 integration test をグリーンに保つ。
- `cargo build --features pjsua-native` がビルド・実行できること（本番バックエンド修復の条件）。
- 各 example は `cargo run --example <name> --features pjsua-native -- --host ...` で実 PBX / ローカル SIP サーバに対して完走すること。
- 実機 SIP 相互接続試験（§43.4 Layer 4）を CI の Docker job（§44 / P16-10）で実行。

#### 実装チケットの依存関係

- 例バイナリ本体の実装（`P8-6` / `P9-1` / `P13-3` / `P14-3`）は、上記 Phase 1-5 の機能実装が先に完了していることが前提。
- `P8-8` / `P9-2`（audio subscribe）、`P15-7` Layer 3+（メディア配線）は E4/E5 の前提。
- `P12-7` / `P8-21`（NativeEvent dispatch / FFI キュー drain）、`P12-8`（CallDirection）は E2/E3 の前提。
