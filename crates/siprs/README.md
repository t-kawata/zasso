# RFC-ROOT

> 対象 RFC: /Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT.md
> 生成グラフ: /Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json

# クイックスタート（SipClient 初期化と最初のステップ）

トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- 確認済み内容は「トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード」。RFC §41.1 の使用例は `TransportConfig::udp(5060)` と `stun_servers: vec![...]` を用いるが、**公開 `ClientConfig`（`src/config.rs:141-170`）には `transports` Vec・`stun_servers` Vec が存在しない**。実フィールドは `sip_proxy_host` / `sip_proxy_port` / `credentials` / `stun_server: Option<String>` / `turn_server: Option<StunServerConfig>` / `ice_enabled` / `srtp_enabled` / `tls_enabled` / `log_level` / `dtmf` のみ。→ 書こうとするコードはコンパイル不能な API を参照する（OMISSIONS F3 / §6.6）。
- RFC 準拠の `ClientConfig`（`src/config/client_config_spec.rs:137`）は `lib.rs` に `ClientConfig` として再公開されておらず、`SipClient::new` は旧 config 型を受理する（`lib.rs:98` vs `lib.rs:132`）。
- `SipClient::new` 自体は成功し `ClientInitialized` を受信できるが（`src/client.rs:110-138`）、reactor は `MockBackend` を無条件生成（`src/runtime/reactor.rs:74-75`）するため実 SIP ネットワークへの接続は発生しない。

### 実装補強設計（完全記述への条件）

1. RFC §10 準拠 `ClientConfig`（`client_config_spec` 版）を公開 API に昇格し、旧 `config.rs` 版を削除・`SipClient::new` のシグネチャを移行（lib.rs 再公開）。
2. `reactor.rs:74-75` に `#[cfg(feature="pjsua-native")] PjsuaBackend` 選択を追加し、実トランスポート（UDP/TCP/TLS）生成と STUN 設定を PJSIP へ反映。
3. `TransportConfig`（`transport_ice_spec`）を公開設定経路に接続（現在 `CreateTransport` アームは状態記録のみ、`reactor.rs:394-440`）。

# ClientConfig の設定項目（transports・STUN/TURN・音声・タイムアウト）

ClientConfig の全フィールド（transports, stun_servers, turn_servers, ice, audio, timeouts, raw_sip_events）を既定値と併せて表形式で解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- 確認済み内容は RFC §10 の全フィールドを既定値付きで解説するもの。しかし `ClientConfig` が 2 つ存在し（旧 `src/config.rs:141` と RFC 準拠 `src/config/client_config_spec.rs:137`）、**公開 API は旧型**（`lib.rs:98`）。RFC §10 の `max_calls` / `event_bus_capacity` / `transports: Vec` / `stun_servers: Vec` / `turn_servers: Vec` / `timeouts` は公開型に存在しない（OMISSIONS §6.6a）。
- `client_config_spec::ClientConfig` は生産コードから一切参照されない（dead config）。
- `IceConfig` 既定値が RFC §10（enabled=true / aggressive_nomination=true / max_host_candidates=16）と実装（false / false / 5）で乖離（RFC §13 とも不一致、RFC-DESIGN-DEFECT RD-5）。

### 実装補強設計（完全記述への条件）

1. 旧 `config.rs` 版を廃止し RFC 版へ一本化（lib.rs 再公開 + 呼び出し側移行）。
2. ICE / STUN / TURN の形状と既定値を §13 と一致させる。
3. 各設定を実 PJSIP 設定（stun_srv / turn_cfg / media_ice / pjsua_acc_config）へ反映するバックエンド配線を実装（§3.1 の `PjsuaBackend`）。

# 初期化のバリデーション規則とエラー処理

§42 のバリデーション規則（event_bus_capacity>=16、sample rate 制限、raw_sip 容量制約等）と失敗時の SipError 処理をコード付きで解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- 確認済み内容は RFC §42 の規則（`event_bus_capacity>=16` / `raw_sip_event_capacity>=event_bus_capacity` / sample rate 8/16/24/48k のみ等）をコード付きで解説するもの。しかし §42 の対象は RFC 型 `ClientConfig` であり、**公開 API の旧 `ClientConfig` には `event_bus_capacity` 等のフィールドが存在しない**（`src/config.rs:141-170`）。
- RFC 型の `validate()` は `client_config_spec.rs` に実装があるが、`SipClient::new`（`src/client.rs:100-138`）の生産経路から呼ばれない（dead）。
- `SipError.native_status` は変換経路で喪失（`src/error.rs:299-307` が `None` を設定、`backend.rs::map_pjsua_status` は文字列埋め込み）→ エラー解説が数値ステータスと乖離（OMISSIONS §6.3c）。

### 実装補強設計（完全記述への条件）

1. RFC 型 `ClientConfig` への移行後、`SipClient::new` 冒頭で `validate()` を fail-fast 実行（§42 の各規則をテストで固定）。
2. `native_status` を保持するエラー変換を §14.1 テーブルに沿って reactor 経路に実装（`m20_runtime_command_error.rs` の converters を生産経路から呼び出す）。

# アカウントの追加と設定更新（add_account / update_config）

add_account の最小コードと、update_config(AccountConfigPatch) による設定更新および更新時に走る register/unregister の挙動を併せて解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- `add_account` は構造上動作する（`reactor.rs:237-269` が `backend.add_account` → `ClientState` 登録 → handle 返却）。`update_config` も配線済み（`public_api_design.rs:165-198` → `reactor.rs:313-363` が `backend.update_account` + `entry.config` 更新）。
- しかし確認済み内容の**「更新時に走る register/unregister の挙動」は存在しない**。`register_on_start` はランタイム未消費（`src/config/account_config_spec.rs:171` 定義のみ、grep で参照ゼロ）、`MockBackend::set_registration` は no-op（`src/runtime/backend.rs:232-238`）。設定更新で再登録が走るコードはない（OMISSIONS F4/F5）。
- `MockBackend::add_account` は registration を `"Registered"` にハードコード（`backend.rs:206`）→ 未登録でも Registered を返す（§17 の初期状態 Disabled と矛盾）。

### 実装補強設計（完全記述への条件）

1. reactor の `UpdateAccount` アームで、設定更新後に `register_on_start` に応じて `backend.set_registration(native_id, enabled)` を発行（更新→再登録/解除の手順を確定）。
2. `MockBackend::set_registration` を状態変更する実装にし、`NativeEvent::RegistrationStateChanged` を emit（P0 変換 `state/m20_registr_cmd_pat.rs` 経由で publish）。
3. `register_on_start` / `allow_outbound_without_register` のランタイム消費を実装（§3.1 の `PjsuaBackend` で実 REGISTER へ接続）。

# 登録と登録解除（register / unregister / set_registration_enabled）

register() / unregister() / set_registration_enabled() の使い分けと、register_on_start による自動登録設定を併せて解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・危険）

- `register()` / `unregister()` / `set_registration_enabled()` は `RuntimeCommand::SetRegistration` を submit する（`public_api_design.rs:56-112`）。
- 受けた `MockBackend::set_registration` は **no-op**（`src/runtime/backend.rs:232-238`、状態を変更せず `Ok(())` を返す）。→ 実登録・解除は発生しない（OMISSIONS F4）。
- `MockBackend::add_account` が registration を `"Registered"` にハードコード（`backend.rs:206`）。
- 登録系イベント（`RegistrationStarted` / `RegistrationSucceeded` / `RegistrationFailed` 等）は発火しない（イベントバス分断、OMISSIONS §3.2）。
- `register_on_start` による自動登録も未実装（`account_config_spec.rs:171` 未消費）。

### 実装補強設計（完全記述への条件）

1. reactor `SetRegistration` アーム → 実 backend（PJSIP `acc_modify` / 登録処理）へ接続。
2. P0 変換マッピング（`state/m20_registr_cmd_pat.rs`）で `RegistrationStateChanged` を `SipEventPayload` に変換し、クライアント側 EventBus に publish（§15.6 のバス一元化）。
3. Mock の初期状態を §17 どおり `Disabled` に修正し、実 REGISTER 成功時のみ `Registered` に遷移させる状態機械を配線。

# 登録状態の参照（registration_state と RegistrationState）

registration_state() の呼び出しと、RegistrationState（Disabled/Idle/Registering/Registered/Unregistering/Failed/Expired）の各状態の意味を表形式で解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- `registration_state()` は `ClientState` の `AccountEntry.registration`（**String**）を `RegistrationState::from_storage_str` で変換する（`public_api_design.rs:120-133`、`src/runtime/state.rs:66-68`）。§33 は typed 状態を要求するが保存は String。
- `MockBackend::add_account` が `"Registered"` をハードコード（`backend.rs:206`）→ **未登録でも `Registered` を返す**。RFC §17 の初期状態 `Disabled` と矛盾（OMISSIONS F4）。
- 実状態遷移（Disabled→Registering→Registered→...）を駆動する実装がなく、状態表を正確に解説できない。

### 実装補強設計（完全記述への条件）

1. `AccountEntry.registration` を `RegistrationState`（typed）に変更（§33、`state.rs`）。
2. Mock の初期値を `Disabled` / `Idle` に修正。
3. `set_registration` / 実 backend の登録結果を状態機械（`state/registr_state_machine.rs`）と連動させ、実 REGISTER 成功時のみ `Registered` へ遷移。

# アカウントの取得・一覧・削除（account / accounts / remove_account）

remove_account(id) の呼び出しと、削除時に走る unregister の挙動・関連イベントを併せて解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- `account` / `accounts` / `remove_account` は配線済み。`remove_account` → `reactor.rs:364-393` が `backend.remove_account` + `ClientState` から除去。
- 確認済み内容の**「削除時に走る unregister の挙動・関連イベント」は存在しない**: `MockBackend::remove_account` はエントリ除去のみで、unregister 手続・`AccountRemoved` イベント発火なし（イベントバス分断 OMISSIONS §3.2）。
- 複数アカウント運用は Mock 上のメモリ状態のみで、実 REGISTER/UNREGISTER を伴わない（OMISSIONS F1）。

### 実装補強設計（完全記述への条件）

1. `remove_account` 時に unregister を先行実行し、その成否を反映する手順を reactor に実装。
2. `AccountRemoved` イベントを実 backend 経由で publish（§15.1 の account 系イベント配線）。
3. §3.1 の `PjsuaBackend` で実アカウント管理へ接続。

# イベントの購読と受信（subscribe / subscribe_account / subscribe_raw_sip）

subscribe() / subscribe_account(id) / subscribe_raw_sip() の 3 つの購読方法の違いと、購読解除（unsubscribe）の方法、SipEventPayload の主要バリアントの受信コードを解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・危険）

- `SipClient` は自身の `EventBus` を生成（`src/client.rs:111`、`EventBus::new(DEFAULT_EVENT_BUS_CAPACITY, None)` — **raw_sip チャネルは None**）。reactor は**別の** `EventBus` を持ち（`src/runtime/reactor.rs:88-96`）、reactor 側の publish はクライアント側バスに転送されない（OMISSIONS §3.2）。
- クライアント側バスで発火するのは `ClientInitialized` のみ（`client.rs:135-138`）。
- `subscribe_account` は `meta.account_id` でフィルタするが（`src/api/eventbus_receiver.rs:121-160`）、全イベントの `account_id` が None のため **0 件受信**（フィルタ死滅）。
- `subscribe_raw_sip` は raw_sip チャネルが None のため **常に None**（`client.rs:186-190`）。RFC §15.6「無効時のみ None」と矛盾。
- **unsubscribe API は存在しない**（broadcast `Receiver` の drop のみ。RFC にも明示 API なし）。

### 実装補強設計（完全記述への条件）

1. reactor の `dispatch_event` をクライアントのバスへ転送（§15.6 `subscribe()` → `subscribe_control()` 一元化、`P12-7` の `dispatch_event` 配線）。
2. `RawSipEventConfig.enabled`（default true）に応じて raw_sip チャネルを生成。
3. 明示的な unsubscribe API を追加するか、drop による購読解除を README に明文化（要 API 設計判断）。
4. `SipEventPayload` 36 バリアントのうち P1/P2 系を M20 変換器で `Some()` 化（OMISSIONS F8）。

# 発信（make_call と OutgoingCallRequest）

make_call の最小コード（target_uri のみ指定）と、発信後のキャンセル（hangup）方法を併せて解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・危険）

- `make_call` → `submit_make_call` → `MakeCall` アーム → `handle_make_call`（`reactor.rs:701-721`）→ `MockBackend::make_call` はインクリメント ID を返すのみ。**発信系イベント（OutgoingCallStarted / Trying / Ringing / CallConnected）は一切発火しない**（`reactor.rs:270-312`、OMISSIONS F6）。
- 確認済み内容の**「発信後のキャンセル（hangup）方法」を実現する公開 API が存在しない**。`SipCall::hangup`（`src/call.rs:160`）はローカル状態遷移のみで reactor/wire に届かない。`make_call` が返す CallId（u64）に対する cancel 経路がない。
- §17 の「未登録でも make_call 可能」不変条件も Mock 上のみ。

### 実装補強設計（完全記述への条件）

1. 公開 API に CallId ベースのキャンセル/終話（`hangup` / `cancel`）を追加し、reactor の終話コマンドへ配線（`SipCall` の取得手段も §19 に沿って整備）。
2. `MakeCall` アームで `OutgoingCallStarted → Trying → Ringing → Connected` のイベント系列を publish（M20 変換）。
3. §3.1 の `PjsuaBackend` で実 INVITE 送信と CallId の実値返却（P12-1）。

# 着信と応答（IncomingCall と answer）

IncomingCall イベントの受信から answer(code) による応答、reject（486/603）による切断までの一連のコードを解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `IncomingCall` イベントは `PjsuaBackend::on_incoming_call` で生成されるべきだが、実 backend が選択されない（§3.1）ため発火しない。
- **`SipClient::answer` は存在しない**。`SipCall::answer`（`src/call.rs:147-157`）はローカル状態遷移のみ。`is_valid_answer_code`（`call.rs:127-142`）は 100-199/200 を許可し、**§19.1 の decline コード 486/603 を拒否**（OMISSIONS §6.9）。reject / busy を実現する公開 API がない。
- `SipCall` のドキュメントは「`SipClient::make_call()` または `SipClient::answer_call()` で生成」と述べるが、**どちらも存在しない**（`src/call.rs:33-34`、ドキュメント偽り — `make_call` は `SipAccountHandle` 上、`answer_call` は不在）。

### 実装補強設計（完全記述への条件）

1. `SipClient::answer(call_id, code)` / `reject(call_id)` を公開 API に追加し、reactor の Answer コマンドへ配線（`command.rs` に Answer バリアント追加）。
2. 486/603 等の decline 応答を `is_valid_answer_code` で受理（§19.1 準拠）。
3. §3.1 の `PjsuaBackend` で `on_incoming_call` → `IncomingCall` イベント生成と `IncomingCall` データ構造の配線（§37）。

# 通話イベントと状態遷移（CallState の購読と判定）

OutgoingCallRinging / CallConnected / CallRejected / CallDisconnected 等の通話イベント受信と、CallState（§18）との対応を解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落）

- `OutgoingCallRinging` / `CallConnected` / `CallRejected` / `CallDisconnected` 等は実パスで発火しない。発火するのは `ClientInitialized` のみ（§3.2、OMISSIONS F8）。
- `convert_call_state`（`src/model/m20_callstate_mapping.rs:76-120`）は状態を CONNECTING にのみ分類し、Trying / Ringing 等の区別を実イベントとして生成しない。
- `SipEventPayload` 36 バリアント中、生成可能なのは約 16 のみ（OMISSIONS F8）。

### 実装補強設計（完全記述への条件）

1. M20 変換器で CallState 全遷移（Trying / Ringing / EarlyMedia / Connecting / Active / Held / Disconnecting）を `Some()` 化し、`meta.call_id` を付与して publish。
2. reactor の `NativeEvent` 処理（`dispatch_event` / `process_native_event`）を production 配線（`P12-7`）。
3. 通話イベントの順序保証と `meta.call_id` による絞り込みを integration test（MockBackend）で固定。

# DTMF 送受信（send_dtmf と DtmfSent / DtmfReceived）

send_dtmf(digits, method) の呼び出しと、DtmfMethod（Inband / SipInfo / Rfc4733）の使い分け、DtmfSent / DtmfReceived イベントの受信を解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- **`SipClient::send_dtmf` は存在しない**（RFC §19 のシグネチャ未実装）。`SipCall::send_dtmf`（`src/call.rs:185-195`）は `validate_dtmf_digits` / `validate_dtmf_send_method` の検証のみで、`RuntimeCommand::SendDtmf` を submit しない（OMISSIONS F7）。
- reactor の `SendDtmf` アーム（`reactor.rs:725-756`）と `spawn_dtmf_sent_timeout`（二相タイムアウト）は実装済みだが、**公開 API からの駆動経路がない**。
- `DtmfMethod` が 3 箇所に重複定義（`account_config_spec` / `observability_metrics` / RFC の `SipInfo` vs 実装 `Info`/`Rfc2833`、OMISSIONS §6.9）。

### 実装補強設計（完全記述への条件）

1. `SipClient::send_dtmf(call_id, digits, method)` を公開 API に追加し、`RuntimeCommand::SendDtmf`（`command.rs:273`）を submit。
2. `SipCall::send_dtmf` を検証後、reactor 経由の実送信 + `DtmfSent` 二相タイムアウト監視に変更。
3. `DtmfMethod` の定義を一元化（RFC と実装の名称差を解消）。

# 音声ストリームの取得（subscribe_audio と AudioChunkPair）

AudioFormat（ビット深度・サンプルレート・チャンネル）とストリームデータの対応を解説し、指定 bit/hz のステレオ WAV ファイルへ書き出す方法まで示す

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・危険）

- `subscribe_audio` は tap を作成し `AudioTapSender` を `tap_senders` に保存する（`src/client.rs:345-368`）が、**`AudioTapSender::push` を呼ぶ生産コードが存在しない**（grep でテスト内のみ確認）。→ `AudioTapHandle::recv()` は永久待機（OMISSIONS F9）。
- §22 M20 の `SubscribeAudio` → `conf_connect` → tap task が未実装。`RuntimeCommand::ConfConnect`（`command.rs:178`）はテストからのみ生成。
- 確認済み内容の**「指定 bit/hz のステレオ WAV ファイルへ書き出す方法」は、データ取得経路なしでは成立しない**。型（`AudioChunkPair` / `ChannelLayout::StereoInOut` = L=IN/R=OUT）は一致しているが、実データが流れない。

### 実装補強設計（完全記述への条件）

1. `PjsuaBackend` のメディアコールバック（`on_call_media_state` / conf port `put_frame`）から `AudioTapSender::push` を呼ぶ async tap/drain タスクを実装。
2. `RuntimeCommand::SubscribeAudio` と reactor による `conf_connect`（RTP）確立手順を実装（§22 M20）。
3. `AudioChunkPair` → WAV 変換（bit depth / sample rate / チャンネル対応）の検証を integration test で固定し、変換ロジックの例を README に記載。

# 音声の注入（AsyncAudioSource と add_audio_source）

2 者通話における IN / OUT / BOTH チャネルへの音声ファイル・ストリーム注入方法と、マイク入力 source の取得（open_default_microphone_source）を併せて解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾・危険）

- `add_audio_source` → `submit_add_audio_source`（`handle.rs:367-387`）→ `AddAudioSource` アーム → `AudioMixer::add_source` は配線済み。しかし **`AudioWorkerTask::spawn` は生産コードから一切呼ばれない**（grep で確認）→ `in_queue` に音声が積まれず、`out_queue` も drain されない（OMISSIONS F11）。
- 実装は**グローバル単一 `AudioMixer`**（`reactor.rs:79`）で、RFC §24.4 の per-call スコープが失われている。`RuntimeCommand::AddAudioSource` に **`call_id` がない**（`command.rs:193`）。IN / OUT / BOTH チャネル指定は存在しない。
- `open_default_microphone_source` は `cpal-input` feature 配下（`asyncaudiosrc_adapter.rs:174-179`）でデフォルト feature に含まれず、実 pjsua 入力機器に接続されない。
- 確認済み内容の「2 者通話の IN/OUT/BOTH へのファイル・ストリーム注入」は、チャネルルーティングと worker が未実装のため書けない。

### 実装補強設計（完全記述への条件）

1. `SipClient::add_audio_source(call_id, source)` の公開形と `call_id` 付きコマンドを実装（RFC §24.4 と実装シグネチャの矛盾解消）。
2. クライアント初期化で `AudioWorkerTask` を spawn し、`AudioMixer` を PJSUA conference port（`conf_connect`）へ接続。
3. IN（受話取得）・OUT（送話 mix & 送信）を独立経路として実装し、ファイル / ストリーム source を BOTH / IN / OUT に注入可能にする。
4. `cpal-input` のマイク source を実 pjsua 入力と接続し、デフォルト feature 方針を決定（`P8-7` / `P13-1` / `P14-1`）。

# STUN/TURN/ICE とトランスポート設定

ClientConfig への stun_servers / turn_servers / ice の設定方法と、TransportConfig（UDP/TCP/TLS）の選択を併せて解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・矛盾）

- 公開 `ClientConfig` は `stun_server: Option<String>`（単一）・`turn_server: Option<StunServerConfig>`（単一かつ **TURN が STUN 型で型バグ**、`src/config.rs:152-157`）。`stun_servers` / `turn_servers` の Vec は公開 API に存在しない（OMISSIONS F3 / §6.6）。
- RFC 準拠 Vec 版（`client_config_spec.rs:153-157`）は lib.rs 未再公開で dead。
- STUN / TURN / ICE はランタイム / FFI から一切参照されない。`TransportConfig`（`transport_ice_spec`）は lib.rs:135-137 で再公開されるが、`CreateTransport` アーム（`reactor.rs:394-440`）は状態に記録するのみで実トランスポート生成しない（§6.10）。
- `StunServerConfig` が `config.rs:71` と `transport_ice_spec.rs:143` に**二重定義**（同一クレート内の型重複）。

### 実装補強設計（完全記述への条件）

1. RFC 型 `ClientConfig` への移行と `stun_servers` / `turn_servers` の Vec 化、`TurnServerConfig` の型修正。
2. `StunServerConfig` / `TurnServerConfig` を一元化（二重定義解消）。
3. §3.1 の `PjsuaBackend` で `stun_srv` / `turn_cfg` / `media_ice` を pjsua 設定へ反映（TLS/SRTP/ICE の実メディア設定配線、§6.10）。

# シャットダウン

shutdown() の呼び出しコードと、その際のイベント（ClientShutdown）の受信、べき等性の説明を解説

<::README-RESIDUE::>

## RESIDUE — 完全記述の作成不可

### 証拠（欠落・危険）

- `shutdown()` はべき等（`is_terminated` ガード、`src/client.rs:388-410`、C044）で Mock 経由で `Ok` を返す — この部分は機能する。
- しかし確認済み内容の**「ClientShutdown イベントの受信」は不可能**。`ClientShutdown` は `client.rs` / `reactor.rs` のどこからも publish されない（grep で該当 publish なし）。
- reactor の `Shutdown` アーム（`reactor.rs:460-468`）は `backend.shutdown()` + `terminated=true` のみ。§32 の完全手順（BYE/CANCEL → unregister → audio drain → pjsua_destroy）は `ShutdownSpec`（`src/state/shutdown_specification.rs`）に実装があるが **テスト専用で production 経路から呼ばれない**（OMISSIONS §6.4）。
- M20 の `ShutdownCommandRouter`（`src/error/m20_shutdown_routing.rs`）も reactor ループに接続されていない（shutdown 後コマンドのルーティングなし）。

### 実装補強設計（完全記述への条件）

1. reactor `Shutdown` アームから `ShutdownSpec.execute_sequence` を呼び出し、通話終了 → 登録解除 → 音声破棄の順序を実行（`P8-32` の PhaseTimeout 含む）。
2. `ClientShutdown` イベントを publish（§15.1 クライアントライフサイクル系）。
3. `ShutdownCommandRouter` をコマンド受信ループに接続（`is_shutting_down` ゲート、M20 §32 追補）。

# REST/WebSocket API（siprs-server クレートとの境界）

クライアントライブラリの README には含めず、siprs-server の README に委ねる旨を記載

## 境界の説明

本 README は **siprs クライアントライブラリ** の利用方法を解説します。REST / WebSocket API による SIP 制御・イベント配信・音声ストリーミングは、**別クレート `siprs-server` の責務**です。

RFC §52.1 の設計判断により、siprs 自体には Axum 等の HTTP 依存は一切追加されず、`server` feature も定義されません。HTTP/WebSocket API を利用する場合は、`siprs-server` クレートの README およびドキュメントを参照してください。

> **注意（現在の実装状態）**: `siprs-server` は実装途上です。`build_router` は `/api/v1/health` と `/api/v1/shutdown` の 2 ルートのみを登録し（`src/api/standalone_server_config.rs:335-336`）、RFC §54.1 の 18 エンドポイント中 16 は未登録です。また `run_server` は固定の `ClientConfig::default()` を使用し、`sip_proxy_host=""` のためバリデーションで `Err(InvalidConfig)` を返し**起動できません**（OMISSIONS F12）。サーバーを利用する際は上記の制約を前提にしてください。

## Examples (implementation samples) spec and design

<::EXAMPLES-RESIDUE::>
## EXAMPLES-RESIDUE — 完全な examples 設計の作成不可

### 証拠（欠落・危険・矛盾）

READ ME の 17 セクション中 16 セクション（H1-H16）が RESIDUE であり、必須 12 機能（F1-F12）は OMISSIONS-2026-08-16 により全て DEFICIENCY / OMISSION と判定されている。Examples が「単一実装例に全セクションを統合し、確実に動作する」ことは、その前提たる機能実装が存在しないため成立しない。

- **例バイナリは存在するが動作しない**: `examples/` に `client_init.rs` / `account_register.rs` / `make_call.rs` / `audio_tap.rs` / `tts_source.rs` が存在しコンパイル可能だが、すべて `MockBackend`（`src/runtime/reactor.rs:74-75`）上で動作し、実 SIP ネットワークとの通信・メディアフローが発生しない。
- **account_register は確実に失敗する**: `examples/account_register.rs:33-42` は `subscribe_account` で登録イベントを待つが、イベントバス分断（§3.2、`client.rs:111` vs `reactor.rs:88-96`）により `account_id` 付きイベントは 0 件。30 秒の `REGISTRATION_TIMEOUT` 後に「timed out waiting for registration (reactor NativeEvent dispatch pending P12-7)」で失敗する。`register()` 自体も `MockBackend::set_registration`（`backend.rs:232-238`）の no-op を通るだけ。
- **make_call もイベント待ちで失敗する**: `examples/make_call.rs` は `OutgoingCallRinging` / `CallConnected` / `CallRejected` を待つが、これらのイベントは実パスで発火しない（`reactor.rs:270-312`、OMISSIONS F6）。
- **audio_tap は永久待機する**: `subscribe_audio` が `AudioTapSender` を保存するだけで、`push` を呼ぶ生産コードが存在しない（`client.rs:345-368`、OMISSIONS F9）。`AudioTapHandle::recv()` は `frame_available` 待ちでブロックし続ける。
- **tts_source は音声が流れない**: `AudioWorkerTask::spawn` が生産コードから一切呼ばれず（grep 確認）、`in_queue`/`out_queue` が駆動しない（OMISSIONS F11）。
- **唯一動作する例は client_init**: `SipClient::new` → `ClientInitialized` 受信 → `shutdown()` のみが Mock 上で完走する。

### 実装補強設計（Examples が完全記述になるための条件）

#### 前提: 機能実装の完了（各 README セクションの RESIDUE 解消）

Examples が「確実に動作する」には、以下が先に実装される必要がある（チケット化の素材）。

1. **Phase 0 — ビルド可能化**（OMISSIONS §6.1）: `pjsua-native` feature がビルドできること（`SecretString::expose_secret()` 実装、bindgen enum の `constified_enum_module`、build.rs のリンク仕様修正、prebuilt パス修正、source build fallback）。チケット: `P8-16` / `P10-2` / `P13-4` / `P8-5` / `P11-5`。
2. **Phase 1 — reactor → 実 backend**（§3.1）: `reactor.rs:74-75` で `#[cfg(feature="pjsua-native")] PjsuaBackend` を選択。チケット: `P3-2`。
3. **Phase 2 — イベントバス一元化**（§3.2）: reactor の `dispatch_event` をクライアント側バスへ転送。`subscribe_account` / `subscribe_raw_sip` が実際にイベントを受信できること。チケット: `P0-5` / `P7-2` / `P12-7`。
4. **Phase 3 — 公開 API の配線**: `SipClient::answer` / `send_dtmf` / `hangup` / `update_config` の再登録動作、`register_on_start` の消費。チケット: `P8-9` / `P8-11` / `P8-14` / `P9-3` / `P11-6` / `P11-7`。
5. **Phase 4 — メディア経路**: `AudioWorkerTask` の spawn、`conf_connect`、tap push、IN/OUT/BOTH ルーティング。チケット: `P8-8` / `P9-2` / `P8-23` / `P11-12`。
6. **Phase 5 — デバイス入力**: cpal マイク source の実接続。チケット: `P8-7` / `P13-1` / `P13-2` / `P14-1` / `P14-2`。

#### Examples 設計（実装後に完全記述化する目標）

5 つの例バイナリ（`examples/common/cli.rs` の CLI パースと `examples/common/client.rs` の add_account ヘルパーを共通利用）を以下に定義する。

**E1. client_init（RFC §41.1）**
- 契約: 前 `ClientConfig` がバリデーション通過（§42）／後 `SipClient::new` が `Ok` を返し `ClientInitialized(ClientCapabilities)` が 1 回 publish される／不変: 初期化失敗時は `Err(InvalidConfig)` で fail-fast。
- テスト: `SipClient::new` 成功・`ClientInitialized` 受信・不正 config で `InvalidConfig`（integration test、MockBackend）。

**E2. account_register（RFC §41.2 / §17）**
- 契約: 前 `register_on_start` または明示 `register()` が submit される／後 `RegistrationState` が `Registered` へ遷移し `RegistrationSucceeded` が受信できる／不変: 未登録時の初期状態は `Disabled`。
- テスト: 登録成功・失敗（4xx）、`unregister()` で `Unregistering → Idle`、タイムアウト時の `RegistrationFailed`。

**E3. make_call（RFC §41.3 / §18-19）**
- 契約: 前 `OutgoingCallRequest` の codec 検証通過／後 `make_call` が実 `CallId` を返し、`OutgoingCallRinging` → `CallConnected`（または `CallRejected`）が `meta.call_id` 付きで受信できる／不変: 4xx-6xx で `Failed` 遷移、`hangup` で `Disconnecting → Disconnected`。
- テスト: 発信成功・拒否（486/603）・キャンセル、イベント順序。

**E4. audio_tap（RFC §22 / §21）**
- 契約: 前 `subscribe_audio(call_id, format, capacity, mode)` が有効な tap を返す／後 `AudioChunkPair`（`in_chunk`=L=受話、`out_chunk`=R=送話）が交渉済み `AudioFormat` で連続生産される／不変: `Realtime` は最古破棄、`Lossless` は producer ブロック（§22.1）。
- テスト: フレーム連続生産・フォーマット一致（bit depth / sample rate / channel）、backpressure 両モード、`AudioChunkPair` → 指定 bit/hz のステレオ WAV 変換（H13 の要求）。

**E5. tts_source（RFC §23-24 / §41.5）**
- 契約: 前 `AsyncAudioSource::next_chunk` が 20ms フレームを返す／後 `add_audio_source(call_id, source)` が source を登録し、`set_audio_source_gain(call_id, source_id, g)` でゲイン適用、IN/OUT/BOTH の指定チャネルに mix される／不変: source が閉じたら（`next_chunk` が 0 返し）自動除去。
- テスト: ファイル / mpsc ストリーム source の注入、BOTH/IN/OUT 各チャネルへのルーティング、マイク source（`open_default_microphone_source`）の実接続。

#### 検証方法

- `make test`（Makefile）で全 integration test（MockBackend 上）をグリーンに保つ。
- `cargo test --features pjsua-native` がビルド・実行できること（Phase 0 の条件）。
- 各例は `cargo run --example <name> -- --host ...` で実 PBX / ローカル SIP サーバに対して完走すること。
- 実機 SIP 相互接続試験（§43.4 Layer 4）を CI の Docker job（§44 M20）で実行。

#### 実装チケットの依存関係

- `P8-6` / `P9-1` / `P13-3` / `P14-3`（例バイナリ本体の実装）は、Phase 0-4 の機能実装が先に完了していることが前提。
- `P8-8` / `P9-2`（audio subscribe）、`P8-23` / `P11-12`（audio orchestration）、`P8-7` / `P13-1` / `P14-1`（cpal）は E4/E5 の前提。
- `P8-30` / `P12-8`（CallDirection）、`P12-7`（NativeEvent dispatch）は E2/E3 の前提。
