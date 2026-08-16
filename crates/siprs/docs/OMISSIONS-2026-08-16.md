# siprs 実装漏れ・不足・矛盾 完全目録 (OMISSIONS-2026-08-16)

> **読者**: siprs crate の実装者・レビューア。
> **目的**: 12の必須機能（ユーザー要件）と設計書 RFC-ROOT.md に定義された実装に対して、`src/` の実装にある**漏れ（OMISSION）・不足（DEFICIENCY）・矛盾（CONTRADICTION / RFC-DESIGN-DEFECT）** を詳細に炙り出し、完全実装に至るための修正要件を提示する。
> **調査対象**: `/Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT.md`（設計書・3763行）と `src/` 配下の全 Rust 実装。`specs/`・`tests/` は原則読まず `src/` と `RFC-ROOT.md` のみから事実を導いた。
> **調査実施日**: 2026-08-16（HEAD `6525a8a8` v0.24.604）
> **English version**: `OMISSIONS-2026-08-16-EN.md`

---

## 目次

1. [はじめに](#1-はじめに)
2. [調査方法](#2-調査方法)
3. [最重要3つの根本病理](#3-最重要3つの根本病理)
4. [必須12機能の診断一覧](#4-必須12機能の診断一覧)
5. [機能別詳細（12必須項目）](#5-機能別詳細12必須項目)
6. [基盤層の追加不備（第2波調査）](#6-基盤層の追加不備第2波調査)
7. [RFC 設計上の欠陥（RFC-DESIGN-DEFECT）](#7-rfc-設計上の欠陥rfc-design-defect)
8. [完全実装のための修正計画](#8-完全実装のための修正計画)
9. [検証方法](#9-検証方法)
10. [付録: 証拠ファイル索引](#10-付録証拠ファイル索引)

---

## 1. はじめに

siprs は PJSIP (PJSUA) を Rust の安全な async 層で包む SIP 音声クライアント libcrate である。RFC-ROOT.md はこの crate の完全設計を指示しており、`src/` はその実装である。しかし現在の実装は**「型・イベント・API 契約」の完成度が高い一方、「実ネットワーク動作（PJSIP バインド・リアルタイムメディア配線）」が未配線**である。本稿は以下の 4象限に分けて現状を検証する。

- **A. 必須12機能 vs src**: ユーザーが必須であると定めた12項目が、実際に動く実装になっているか。
- **B. RFC-ROOT.md の仕様 vs src**: RFC が規定した形と実装の形に、漏れ・不足・矛盾がないか。
- **C. RFC 内部の自己矛盾**: RFC 自体が変数型を矛盾して定義している箇所。
- **D. コード品質 / セキュリティ**: 型安全・メモリ・機密情報の扱い上の問題。

本稿ではすべての指摘に **証拠（RFC行番号 + srcファイル:行）**を添える。指摘の**種類**を次の記号で示す:

| 記号 | 意味 |
|---|---|
| 【OMISSION】 | RFC・必須要件に定められているが、実装に存在しない。 |
| 【DEFICIENCY】 | 実装は存在するが、動かない・正しくなく・到達不能・形が違う等の欠陥がある。 |
| 【RFC-DESIGN-DEFECT】 | RFC-ROOT.md 自身が要件または **必須機能と矛盾** する設計欠陥を持つことが実証された場合。 |
| 【CONTRADICTION】 | src が RFC と矛盾する挙動・形・既定値を持つ。 |
| 【WIRED-DEAD】 | 実装はあるが production から呼ばれない (dead code) で、動かない。 |

---

## 2. 調査方法

- **対象**: `RFC-ROOT.md`（全3763行、サクション202件）と `src/` 配下の全 `.rs` ファイル。
- **手順**: 3段階
  1. **機械走査**: `grep -rn` による `[STUB::]`・`todo!`・`unimplemented!`・`panic!`・`unreachable!`・`#[allow(...)]`・`cfg(target_os)`・`cfg(feature=...)`―全ソースを網羅。
  2. **機能別深掘り**: 12必須機能 × 対応する RFC章節と src ファイルの対比（第1波: 9 エージェント）。
  3. **基盤層深掘り**: エラー・シャットダウン・パニックポリシー、設定準拠、セキュリティ/ビルド/プラットフォーム、model/state層、観測性を対比（第2波: 4 エージェント＋機械走査）。
- **タッチなし**: 本調査ではコード変更は一切行っていない。
- **用語**: 「本番（production path)」は `#[cfg(test)]` や `#[cfg(any())]` のテスト/サンプルに含まれない実際のランタイム経路を指す。

**機械走査の結果（決定的な事実）**:

| 走査項目 | 結果 |
|---|---|
| `[::STUB::]` マーカー | **0件**（`src/`全体。※Cargo.toml コメントには歴史的な `[::STUB::] P0-3/P0-5` が残るのみ） |
| `todo!` / `unimplemented!` | **0件** |
| `panic!`（production の分岐） | production の `panic!` は認められない運用だが、`unreachable!()` が `handle.rs:152-209` と `pj_str.rs:79` に存在（真に unreachable の防御用。許容とみなす） |
| `#[allow(...)]` 警告抑制 | **0件** |
| `#[cfg(target_os)]` / `cfg(unix)` / `cfg(windows)` | **0件** → プラットフォーム分岐がない（§6.2） |
| `#[cfg(feature=...)]` | `metrics` ゲート（observability_metrics.rs）のみ。**`pjsua-native`・`tls`・`srtp` をコード上で切替えない** |
| `MockBackend` 参照 | reactor.rs / backend.rs / command.rs / shutdown_specification.rs / standalone_server_config.rs / public_api_design.rs / error/m20_runtime_command_error.rs / tests/* |

---

## 3. 最重要3つの根本病理

以下に書く個々の指摘は、主にこの3つの根本原因に帰する。まずこれを読むと全体が見える。

### 3.1 【DEFICIENCY】Reactor は `MockBackend` を無条件に生成し、実PJSIP が選ばれない

`src/runtime/reactor.rs:74-75`:

```rust
// MockBackend is used until PjsuaBackend is implemented.
let mut backend: Box<dyn SipBackend> = Box::new(MockBackend::new());
```

- `#[cfg(feature="pjsua-native")]` での選択肢（`PjsuaBackend`）が**存在しない**。実PJSIP に接続する経路が一切ない。
- `PjsuaBackend` は定義されている（`src/runtime/backend.rs:406-474`）が、**unit test 内でのみ生成され**、非ゲート時は内部メソッドが `Err("...requires the pjsua-native feature")`（`backend.rs:538-565 等`）を返す。
- **既定機能** (`default = ["serde","tls"]`、Cargo.toml:11) では `pjsua-native` は入らない。さらに、**`pjsua-native` を有効にしても現状はビルド不能**（後述 §6.1）である。
- 結果: この crate は**実SIPネットワークに対して何も動作しない**。`make_call` が「成功した ID」を返しても Mockが生成した ID で、REGISTER/INVITE はワイヤに出ない。

### 3.2 【DEFICIENCY】イベントバスが2台あり、アプリが受信するバスが送信側と接続されていない

- クライアント側: `SipClient::new`（`src/client.rs:110-112`）が自前の `EventBus` を作り、その Receiver を呼び出し元へ返す。
- Reactor 側: `CoreReactor::new`（`src/runtime/reactor.rs:88-96`）が**別の** `EventBus` を作り、`client_event_buses` マップ（空のまま）を持つ。
- イベント発行は reactor 側のバスにのみ行われ（`reactor.rs:537-557,574-634`）、**それをクライアント側のバスへ転記するコードが存在しない**。
- 結果: アプリが唯一受信できるのは `SipClient::new` 内で直接 `publish` した `ClientInitialized` の1件だけ（`client.rs:132-138`）。Registr/通話/DTMF/音声のイベントは一切届かない。
- 非公開の暫定ルート `client.handle().default_event_bus()`（`handle.rs:92`）でのみ reactor 側イベントに触れるが、ドキュメント化されておらず raw SIP も届かない。

### 3.3 【DEFICIENCY】必要な部分は「型だけある」

RFC で規定され公開 API として定義されているものの**データ型・イベント定義・シグネチャのみが揃い、実際に何かを駆動する production 配線が無い**ものが多い。代表例（詳細は各節）:

- `AsyncAudioSource` / `AudioMixer` / `AudioPipeline`: `AudioWorkerTask` が本番で一度も spawn されない（F9・F11 参照）。
- `register_on_start` / `allow_outbound_without_register`: 実行時に一切読まれない（§3.1 とは別の設定死骸）。
- `ShutdownSpec` / `ShutdownCommandRouter` / `PanicPolicy`: テストのみ、production から未使用（§6.4・§6.5）。
- `m20_runtime_command_error` 変換器群: テストのみ（§6.3）。
- `MetricsRegistry` / `ClientCapabilities`: 宣言のみ（§6.7）。
- REST API: エンドポイント定数18本のうち、Router 登録は2本（F12 参照）。

これらの根本病理に対して、「型」を増やすのではなく「実配線」を追加することが完全実装の道である。

---

## 4. 必須機能の診断一覧

| # | 必須機能 | 判定 | 要約 |
|---|---|---|---|
| F1 | 複数SIPアカウント設定 | ⚠ **DEFICIENCY** | 構造（BTreeMap×add_account）はOK。実ネワーク登録が Mock のみで動かない |
| F2 | イベント Subscribe / 受け取り | ❌ **DEFICIENCY** | バス2台分断。受信できるのは `ClientInitialized` 1件のみ |
| F3 | 複数 STUN/TURN 設定 | ❌ **DEFICIENCY**（必須機能ニーズ満たさず） | 実APIは単一値・TURNは STUN 型のバグ。RFC の Vec 仕様は dead |
| F4 | Register 方法 | ❌ **OMISSION**（自動登録）＋ DEF | `register_on_start` 未消費、`set_registration` no-op、定型 "Registered" ハードコード |
| F5 | Register なし起動 | ⚠ 構造は許容 / 動作不可 | `allow_outbound_without_register` 未読。受信専用はイベント源ゼロ |
| F6 | 発信・着信 | ❌ **発信**: 型OK・イベント配信ゼロ / **着信**: `answer` API 不在 | |
| F7 | DTMF 送信 | ❌ **OMISSION**（必須機能 XY) | `SipCall::send_dtmf` は検証のみ、reactor 送信経路は dead |
| F8 | SIP関連イベント受信 | ❌ **一部のみ** | 36 variant 中 ~16のみ実際に発火 |
| F9 | 音声 L/R 取得 | ❌ **API 契約のみ** | `AudioTapSender::push` の本番呼び出しゼロ、`recv()` は永久ブロック |
| F10 | 音声⇄イベントトレース | ❌ **未実装** + 不定 | `seq` フィールド不存在、`SequenceGenerator` 未接続 |
| F11 | IN/OUT 音声注入 | ❌ **断線** | ソースは追加できるが再生されない。call_id ルーティング喪失 |
| F12 | REST API | ❌ **起動不能+規約違反** | `run_server` が必ず `Err(InvalidConfig)`、siprs に server feature 存在（RFC §52.1に違反） |

**詳細は §5 を参照。** 上記のうち F1〜F12 は必須機能それ自体が「実装目的」であり、未達のままでは crate として要求を満たさない。

---

## 5. 機能別詳細（12必須項目）

### F1. 複数SIPアカウントの設定方法

**背景**
- RFC は複数アカウントを規定: 「複数 `SipAccount` の同時保持。」「アカウント動的追加・削除。」（RFC-ROOT.md:126-127）、`add_account` / `remove_account`（RFC:778-783）。
- ID 設計 §9:「識別子はランタイム一意な非ゼロ整数」（RFC-ROOT.md:374）。

**現状（src）**
- 記憶構造は正しい: `ClientState.accounts: BTreeMap<AccountId, AccountEntry>`（`src/runtime/state.rs:45`）。
- `SipClient::add_account(config) -> Result<SipAccountHandle, SipError>`（`client.rs:219`）を複数回呼べ、各ハンドルは `id()`（u64）と `AccountId`（NonZeroU64）で区別（`src/api/public_api_design.rs:33-52`, `src/model/id_design_newtype.rs:64`）。
- `SipClient::account(id)` 再取得・`remove_account`（`client.rs:242-302`）。

**【DEFICIENCY】** 実装構造は OK だが、リアルアカウント管理が MockBackend 上のフェークにすぎない（§3.1）。複数アカウントの「設定方法」は書けるが「実証できる動作」が無い。

**【補充指摘】** RFC §50:3067「複数 account の独立 register/unregister が動作」は未達である。

**修正要件**:
- §3.1 の実バックエンド選択を実装する（Mock を使わないと実 network に通信）。
- Mock に頼らず複数アカウントの登録・削除を実際に検証する統合テスト（これを unit テストに依存させない）。

### F2. イベントの Subscribe と受け取り方法

**【背景】** RFC §8.3: `subscribe()`, `subscribe_account(AccountId)`, `subscribe_raw_sip() -> Option<Receiver<RawSipMessage>>`。§15.4-15.6（EventBus 分割・購読者モデル）・§15.5 `AccountEventReceiver`。

**【src】** `subscribe()`（`client.rs:165`）、`subscribe_account()`（`client.rs:174`）、`subscribe_raw_sip()`（`client.rs:186`）、`subscribe_audio()`（`client.rs:349`）。`AccountEventReceiver::new/recv/try_recv`（`src/api/eventbus_receiver.rs:121-160`）。

**【DEFICIENCY】（・§3.2）**
- `subscribe()` の戻り Receiver は `self.events` に由来（`client.rs:166`）が、**そのバスに publish するのは `SipClient::new` 内の `ClientInitialized` の1回のみ**。
- `subscribe_account()` は `meta.account_id` でフィルタするが、発行されるイベントの `account_id` は常に `None` → 受信 0 件（意に反して全滅）。
- `subscribe_raw_sip()` は `EventBus::new(DEFAULT_EVENT_BUS_CAPACITY, None)` が `None` → 常に `None` を返す（RFC §15.6「無効時のみ None」と矛盾）。
- `recv()` は `Lagged(n)` を素通し（RFC §15.7 と一致）→ これは正しい。

**【RFC-DESIGN-DEFECT】** なし（subscribe API 自体の RFC 記述は正しい）。

**修正**:
- reactor の発行先 `ClientEventBus` を、`SipClient` が保持するバスに登録（§15.6 の `subscribe() → subscribe_control()`）。
- `RawSipEventConfig.enabled`（default true, `client_config_spec.rs:81-97`）を使って `raw_sip_capacity` を実際に `EventBus::new` に渡す。

### F3. 複数 STUN/TURN の設定方法

**【RFC】** §13は複数指定を義務:** `pub stun_servers: Vec<StunServerConfig>`、`pub turn_servers: Vec<TurnServerConfig>`（RFC-ROOT.md:400-401）、必須機能「複数 STUN/TURN 設定」（RFC-ROOT.md:132）。各形状: `StunServerConfig{uri:String}` / `TurnServerConfig{uri,username:Option,password:Option,transport}`（RFC §13:596-605）。

**【src】**
- `config.rs:152` `pub stun_server: Option<String>`（**単一**）
- `config.rs:154` `pub turn_server: Option<StunServerConfig>`（**単一かつ型バグ**: TURN の型に STUN 型)
- `config.rs:157` `pub ice_enabled: bool`
- 一方、RFC 準拠の `client_config_spec.rs:153-157` に `stun_servers: Vec`/`turn_servers: Vec`/`ice: IceConfig` があるが、**lib.rs に複輸出されず、どこからも読み込まれない**（dead）。

**【DEFICIENCY】** 複数 STUN/TURN を設定する手段が現存しない。さらに runtime/ffi からも stun/turn/ice は **一切参照されない**（§3.1 と同じく生れた死設定）。

**【CONTRADICTION】** `config.rs:71` と `transport_ice_spec.rs:143` の2箇所に `StunServerConfig {host,port}` が重複定義（同一 crate 内の型重複）。

**修正**:
- `client_config_spec::ClientConfig` を公開 API の `ClientConfig` として採用し（`lib.rs` に re-export）、legacy の config.rs 型を廃止する。
- `turn_server` を `TurnServerConfig` で正しく型付けし `Vec` 化する。
- `StunServerConfig`/`TurnServerConfig` を1箇所に統合。
- §3.1 の実バックエンドで config を PJSIP に反映（stun_srv / turn_cfg、ICE は `pjsua_acc_config` の media_ice 等）。

### F4. Register 方法

**【RFC】** §11 `register_on_start: bool`、§17 状態機（Disabled/Idle/Registering/Registered/Unregistering/Failed/Expired）、RFC §50:3067 独立 register/unregister 動作、§41.2 の例（明示的 register()）。

**【src】**
- `register` (`public_api_design.rs:56`) / `unregister` (:76) / `set_registration_enabled` (:96) / `registration_state` (:120) はある。
- `AccountConfig.register_on_start: bool`（`account_config_spec.rs:171`、デフォルト true）は**runtime からどこにも読まれない** → 自動登録が無い。

**【OMISSION】** 自動登録（`register_on_start`）の消費処理がない。

**【DEFICIENCY】**
- `MockBackend::set_registration`（`backend.rs:232-238`）は no-op: `Ok(())` を返すだけで状態を変えない。
- **偽造の状態表示**: `MockBackend::add_account` が `registration: "Registered"` を固定で設定（`backend.rs:206`）。RFC §17 の初期 `Disabled` と矛盾 → `registration_state()` が登録していないアカウントを「Registered」と返す。
- `examples/account_register.rs:63-64` のタイムアウトmsg:「reactor NativeEvent dispatch pending P12-7」と自己記録。

**修正**:
- reactor `AddAccount` arm で `register_on_start == true` なら `backend.set_registration(acc, true)` を呼ぶ。
- 実バックエンドで `NativeEvent::RegistrationStateChanged` を発行させ、P0 mapping（`state/m20_registr_cmd_pat.rs`）で registration イベントを publish。
- `Mock` でハードコードされた `Registered` を `Disabled`/Idle へ（RFC §17 初期化）修正し、状態報告を駆動ベースに。

### F5. Register なしでの起動方法

**【RFC】** §11.1 の注記: `register_on_start == false` でも `allow_outbound_without_register == true` なら発信可能、§17 の不変性「未登録でも make_call は常に可能」。

**【src】** 起動はアカウント無しで `SipClient::new` 可能（§3.1で Mock）。`allow_outbound_without_register`（`account_config_spec.rs:173`）は**runtime から未読**（dead）。

**【DEFICIENCY】** 動作は「メモリ内シミュレーション」。受信専用（着信待ち）は実イベント源（PjsuaBackend の callback）が build されないため不可。

**【構成】**: 状態は他項目同様に §3.1 に従う。`allow_outbound_without_register` の意味（未登録発信の許可）を `make_call` パスで強制 or 意味を明示。

### F6. 発信・着信方法

#### 発信
**【RFC】** §19: `account.make_call` が正 (u64 CallId)、§18.1 の状態遷移、§41.3 の手順（Ringing→Connected を待つ）。

**【src】** : `SipAccountHandle::make_call(OutgoingCallRequest) -> Result<u64, SipError>`（`public_api_design.rs:142-156`）→ `handle.rs:303` `DispatchCommand::MakeCall` → `handle_make_call`（`reactor.rs:701-721`）→ `backend.make_call`。戻り値 u64 OK。

**【DEFICIENCY】: 発信イベントが1つも発行されない**
- `handle_make_call` は CallEntry を登録して id を返すだけで、`SipEventPayload`（`OutgoingCallStarted` 等）を一切 publish しない。
- MockBackend の `make_call`（backend.rs:241）は increment した id を返すだけ。RFC §15.1 の event 系列（Trying→Ringing→Connected）が実経路上で生成されない。
- → **既定の構成では「発信」は型とIDを返すだけで、実際の INVITE も wire に送信されない。**

#### 着信
**【RFC】** §19 `answer` 必須（SipClient 上）、§19.1 answer のセマンティクス（180/183/200/486/603）、§37 `IncomingCall` データ構造 + auto-reject timer、§18 Incoming→Connecting（answer(200)）遷移。

**【src】**
- `SipEventPayload::IncomingCall(IncomingCallInfo)`（event_model_payload_bus.rs:338）は**定義のみ**。実際には PjsuaBackend の callback（`on_incoming_call`）で生成されるはずだが、そのバックエンドは選択されない（§3.1）。
- **`SipClient::answer(...)` が存在しない**。`SipCall::answer(code)`（`src/call.rs:147-157`）はローカル状態遷移のみ（reactor / wire へ渡らない）。
- `SipCall` doc（`call.rs:33-34`）は「`SipClient::make_call()` または `SipClient::answer_call()` で生成」と記載するが、**両方とも存在しない**（`make_call` は `SipAccountHandle` にあり、`answer_call` は存在しない）→ **ドキュメント嘘**。

**【OMISSION】** `answer`（着信応答）の公開 API が存在せず、**着信の受信→応答**のフローが実装不可能。

**【DEFICIENCY】** さらに応答以外の着信操作（拒否・保留など）も公開 API が未整備であり、RFC §19 / §18 の状態遷移（Incoming→Connecting、Incoming→Disconnecting 等）は SipCall のローカル検証のみで実際の wire 動作に反映されない。

**修正**:
- `SipClient::answer(call_id, code)` / `reject` を公開する（§19.1 のコード 100-199/200/486/603 を考慮、486/603 は拒否応答）。
- `SipCall` を取得する手段（`SipClient::make_call` 相当の公開 API、または着信時に SipCall を返す購読）を提供。
- §3.1 の実バックエンドで `IncomingCall` を Reactor 経由で publish する。


### F7. DTMF送信方法

**【RFC】** §20 `DtmfMethod {Inband, SipInfo, Rfc4733}` + DtmfPolicy、§19 `SipClient::send_dtmf`、M20 追補「DtmfSent 発火は2相 + 500ms timeout」`DtmfConfig::sent_timeout_ms`。

**【src】**
- DtmfPolicy/Method/DtmfConfig: `account_config_spec.rs:35-47`、`config.rs:108-125`（Method は {Rfc2833, Rfc4733, Info, Inband} — SipInfo 表の Info に一致）。イベント `DtmfSentInfo`（`m20_dtmfsent_twophase.rs:35-44`）と `DtmfReceivedInfo`。
- **二相の reactor 実装は完全**: `DispatchCommand::SendDtmf` → `handle_send_dtmf`（`reactor.rs:725-756`）で `backend.send_dt` + digitごとに `spawn_dtmf_sent_timeout`（`reactor.rs:744`）が 500ms で `DtmfSent{Err(Timeout)}`。
- しかし**公開 API から `SendDtmf` を送る経路が無い**: `SipCall::send_dtmf(digits, method)`（`call.rs:185-195`）は 状態検証のみ（`validate_dtmf_digits` / `validate_dtmf_send_method`）で backend 呼び出ししない。`handle.rs` に wrap 無し。

**【OMISSION】必須の DTMF 送信** が不可。二相の工業部品（DtmfSent 発火、timeout）は工程的に完成しているのに、**それを駆動する公開インターフェース（`SipClient::send_dtmf`）が実装されていない**。

**修正**:
- `SipClient::send_dtmf(call_id, digits, method)`（RFC §19 のシグネチャ）を実装し、`RuntimeCommand::SendDtmf`（`command.rs:273`）を submit する。
- `SipCall::send_dtmf` を、検証の後に reactor 経由の実送信と timeout 監視を呼ぶ形に変更。

### F8. SIP関連イベント受信方法

**【RFC】** §15.1 `SipEventPayload` 全変数列挙、§15.1-15.3 の構造。§50:3017「全列挙イベントが発火する」、M20 変換テーブル（P0/P1/P2 分類）。

**【src】** 
- `SipEventPayload` は36変数 `#[non_exhaustive]`（`event_model_payload_bus.rs:290-387`）で、variant 名は全 RFC 一致。
- 実際に生成されるのは約 **16に**（`ClientInitialized`, RegistrationStarted/Succeeded/Failed, `IncomingCall`, `OutgoingCallStarted/Trying/Ringing`, `CallConnected/Disconnected`, `CallHeld`, `MediaActive/MediaError`, `DtmfReceived`, `DtmfSent{Err(Timeout) or Ok}`, `Error`）。
- `OutgoingCallStarted → Trying → Ringing → Connected` のうち、convert_call_state（`m20_callstate_mapping.rs:76-120`）が番は `CONNECTING` 判別のみで、`OutgoingCallStarted`/`Trying` 等はあっても**現実には output のまま**。
- **P1/P2（Transport, ICE, CallTsxStateChanged, CallRedirected, TransferStatus, CallReplaced, NatDetected, ReferReceived, TransferCompleted, RegistrationExpired, Unregistration*, MediaStopped, etc.）は 変換が `None` を返し**、デッドならぎのまま。

**【OMISSION】** 36のうち実発火は16 SUBSET不可避。→ §50「全列挙イベントが発火する」Not Achieve。`#[non_exhaustive]` は RFC §15.1 に通り実装（OK）。

**修正**:
- M20 変換器から P1（Transport/ICE/Refer/Media/Account/Lifecycle）への `Some()` 化を具実装する。
- Dtmf (Rfc2833) - Method の `Info` `Inband` (comment) 状態補完。
- 意図的に発行されない variant には `[::STUB::]` か deferred マーカーを付与（現行は「宣言のみ」で維持不能）。

---

### F9. 音声ストリームの L/R ペアの受信・取得方法

**【RFC】** §21 `AudioFormat { sample_rate, bit_depth, channel_layout, frame_ms }`、`ChannelLayout::StereoInOut`（L=IN, R=OUT）、§22 音声購読 API `subscribe_audio(...) -> AudioTapHandle`、`AudioChunkPair { call_id, account_id, timestamp, in_chunk, out_chunk }`（RFC §21.1）。§22.1 backpressure（Realtime は古いものを破棄 / Lossless は producer block）。

**【src】**: 型は**完全一致**である:
- `ProcessedFrame { stereo_interleaved: Vec<i16>, negotiated_codec, timestamp }`（`audio/pipeline.rs:163-171`）
- `AudioChunkPair { call_id, account_id, timestamp, in_chunk, out_chunk }`（`model/audio_format_chunkpair.rs:215-226`）
- `AudioChunk::I16 / F32`（同 :181）、`ChannelLayout::StereoInOut` = L=IN/R=OUT（同 :87-96）
- `SipClient::subscribe_audio(call_id, format, capacity, mode) -> Result<AudioTapHandle, SipError>`（`client.rs:349-368`）
- `AudioTapHandle::recv() -> Option<AudioChunkPair>`（`audio_subscribe_bp.rs:113-123`）
- backpressure: `AudioTapSender::push`（`audio_subscribe_bp.rs:172-214`）は Realtime の evict-oldest / Lossless の await-space 実装が unit test 済み。

**【DEFICIENCY / WIRED-DEAD】（不能動作の核心）**
- `SipClient::subscribe_audio` はローカルに `tap_channel(capacity, mode)` を作り `AudioTapSender` を `client.tap_senders`（`client.rs:362`）へ保存するが、**production のどこからも `AudioTapSender::push(...)` を呼ぶコードが無い**。
- RFC §22 M20 (Reactor `SubscribeAudio` → `conf_connect` → tap task) は **未実装**。`RuntimeCommand::ConfConnect`（`command.rs:178`）は存在するが error path のシャットダウンテストからのみ生成される。
- 結果: `recv()` は `frame_available` で永久ブロックし、`AudioChunkPair` フレームは一度も生成されない。**API contract はあるがテータパスが断たれている**。

**修正**:
- Media backend (`PjsuaBackend`) のメディアコールバック（`on_call_media_state` / conf port からの `put_frame`）から `AudioTapSender::push` を呼ぶ tap task（async ドレインタスク）を追加する。
- `RuntimeCommand::SubscribeAudio` を追加し、reactor が `conf_connect`（RTP）を張る手順を実装（§22 M20）。

### F10. 音声ストリーム L/R ペアとイベントとの関係性トレース

**【RFC】** §54.5 「イベント-音声時間的な相関保証（設計判断）」が `SipEvent` に `seq: u64` を、`AudioChunkPair` に `first_seq/last_seq` を要求する（RFC-ROOT.md:3325-3344）新しい同期方式。同時に「タイムスタンプによるフォールバック」も言及。

**【src】** 
- `SipEvent { meta, payload }` — **`seq` フィールドが無い**（`event_model_payload_bus.rs:397-401`）。
- `AudioChunkPair` に `first_seq`/`last_seq` が**無い**（`audio_format_chunkpair.rs:215-226`）。
- `SequenceGenerator`（`http_ws_protocol.rs:202-241`、monotonic `AtomicU64`）が存在するが、**どこからも使われない**（デモ用途はテストのみ）。`AudioFrameHeader`（WS 枠）にも `sequence_number` が定義されているが、EventBus には接続されていない。

**【RFC-DESIGN-DEFECT】** §54.5 は §21/§22 の既定義にフィールドを**後付で「追加」する**読み方であり、RFC 自身の中に「§54.5 の seq 追記が §21/§22 の定義を置換する／アップデートする」という序列の明記が無い。→ **RFC の自己矛盾**（§7 にも登録）。

**【OMISSION】** event−audio 相関の E2E 実装はゼロ。join の鍵は `AudioChunkPair.call_id` と `EventMeta.call_id`（同じ `CallId`）で「設計上は」取れるが、seq による確定トレースは不可能。

**修正**:
- RFC の §54.5 を正解として `SipEvent.seq` と `AudioChunkPair.first_seq/last_seq` を追加。
- 単一の `SequenceGenerator` を reactor と tap task で共有してインジャンクトし、発行 event と audio フレームを同一カウンタで印字する。
- 時間的相関の検証テスト（同一 call 下で event→frame の seq が昇順であること）。

### F11. 通話のIN/OUT チャネルへの任意音声流し込み（ファイル・ストリーム・マイク）

**【RFC】** §23 `AsyncAudioSource`（`async fn next_chunk(buf: &mut [i16]) -> usize`）、`SyncSourceAdapter`（ファイル・トーン）、§24 AudioMixer（per-call の mixer）、§24.1-24.3 worker / mix / gain、§24.4 `SipClient::add_audio_source(call_id, source)`（**call 毎**に source を登録）、§40 `open_default_microphone_source`（cpal-input）。

**【src】**: API はある:
- `AsyncAudioSource` trait（`runtime/audio_worker.rs:24-31）
- `AudioMixer::add_source/set_gain/mute`（`audio_worker.rs:186-227`）
- `RuntimeHandle::submit_add_audio_source`（`handle.rs:367-387`、`RuntimeCommand::AddAudioSource` は **`call_id` を持たない**（`command.rs:193`））
- `open_default_microphone_source`（`#cfg(feature="cpal-input")`, `asyncaudiosrc_adapter.rs:174-179`）
- `SyncSourceAdapter`（`asyncaudiosrc_adapter.rs:100-144`）
- `examples/tts_source.rs`（mpsc→source 注入）、`examples/audio_tap.rs`（tap 表示）

**【DEFICIENCY: ルート断線】**
1. `AudioWorkerTask::spawn`（`audio_worker.rs:265-310`）が **production のどこからも呼ばれない**（起動時の reactor も client も worker を spawn しない）。
2. `AudioMixer` は reactor が生成（`reactor.rs:79`）し、`dispatch`（`reactor.rs:175-207`）で source を追加するが、**worker が走らないので out_queue にフレームが滞積しない**。on_queue も誰も pop しない。
3. `AudioPipeline`（`pipeline.rs:210-247`）は全部 pure で **production からの caller 0**。
4. onClick の mixer（per-call）が失われている: 実装は**グローバル1個**の AudioMixer（reactor.rs:79）で、add source は call とは無関係。RFC §24.4 の per-call が剥奪されている。
5. IN と OUT のルーティング: 受信音（RT callback → `in_queue`）を worker が `out_queue` に mix する設計はあるが、**`in_queue` にも push しない**。つまり「通話の IN チャネル（相手の声）を取得してtap」も、「OUT にファイルを流す」も、**実際のメディアパスが無い**。
6. マイク: `cpal-input`（非 default）で compile されるだけで、リアルな `pjsua` の input device へは接続されない。

**【CONTRIBUTION】**: RFC §24.4 の per-call API（`SipClient::add_audio_source(call_id, source)`）と実装の call-less `submit_add_audio_source` **シグネチャが矛盾**。

**修正**:
- `SipClient::add_audio_source(call_id, source)`（RFC §24.4 の公開形）を実装し、command に call_id を追加。
- `AudioWorkerTask::spawn` を client 初期化時に起動し、mixer と PJSUA conference port を共下で接続（ARCA の `conf_connect`）。
- cpal-input のデバイスを開いて AsyncAudioSource のソースとして結線する E2E パス。
- IN channel（受信音）を取り出す経路と OUT channel（mix& 送信）の _それぞれ独立_ の構造を実装する。

### F12. REST API ドキュメント

**【RFC】**
- §52.1 決定: **`siprs-server` を別 crate に分離**（「siprs 自体に Axum 等の HTTP 依存は一切追加しない」「server feature も siprs には定義しない」RFC-ROOT.md:3099-3100）。
- §53.1 起動: `ServerConfig::from_args()` → `SipClient::new(client_config)` → 90ラル etc.
- §54.1 REST エンドポイント一覧（18本）、§54.2 WS2本、§54.3 Axum Router、§54.4 WS メッセージ（text/binary）、§55 JWT（POST /auth/token、claims sub/username/domain/exp/scope）、§56 SQLite（sea-orm）。
- 必須機能「REST API」.

**【src】**
- **RFC 違反**: `siprs` に `server = ["dep:axum","dep:tower-http"]` / `cli = ["dep:clap"]` feature が存在（Cargo.toml:22-24, 69-71）。RFC §52.1 の「siprs は Axum 不要」を破る。
- `crates/siprs-server/` は存在するが **P4-3 STUB**: `src/routes.rs` 空、`main rs` "ready (stub)"、`auth.rs` 401 固定、`Cargo.toml` の rusqlite/sea-orm はコメントアウト。**migrations/ ディレクトリ不在**（§56.2）。
- `standalone_server_config.rs` の `build_router`（`:334-339`）は `/api/v1/health`(GET) と `/api/v1/shutdown`(POST) のみ登録。**エンドポイント定数18本**（`http_ws_protocol.rs:21-55`）は RFC と byte 一致して良いが、実装は 2 本しかない。
- `run_server`（`:364-440`）は **`ClientConfig::default()` を hardcode** し、デフォルト `sip_proxy_host=""` → `validate()` が `Err(InvalidConfig)` → **起動不能**（テスト `standalone_server_config.rs:1132-1143` がこの失敗を固定）。
- JWT: `auth_jwt_middleware.rs` の `JwtValidator` / `Claims` は実在、しかし production router に token エンドポイントが**登録されていない**。token 発行はテストハーネス（`siprs-server/tests/common/harness.rs`）のみ。
- WS binary `AudioFrameHeader`（30byte）vs RFC §54.4（「合計24byte」の記述）: **RFC の field サイズ合計が 30 であり、記述と矛盾**。実装は 30byte で正しい（RFC-DESIGN-DEFECT: §7）。

**【OMISSION・DEFICIENCY】**
- REST エンドポイント 18本のうち **16本が 404**、WS もハンドラ不在。
- `config_file`（§53.2）による ClientConfig 構築が未実装、サーバーが実起動しない
- `siprs-server` が STUB のまま（P4-3）、稼働サーバーは無い。
- JWT の本番ルート・`find_account` 検証・`expires_in` レスポンス 欠落。

**修正**: §52-57 の実装を完遂する（siprs-server crate を実装、run_server から実 client_config を読ませる、18 endpoint + WS 実装、JWT 巡回）。本報告の対象は「実装の実体」なので、この修正は必須とする。

**§5 までのまとめ**: F1〜F12 の大部分は「**公開APIのシグネチャと型は揃っているが、reactor が MockBackend を使い、実バックエンド（PJSIP）が選択されず、イベントバスが分断され、メディアパスが未配線である**」という構造によって「動かない」。以下 §6 で、その背後にある基盤層の追加不備を列挙する。


---

## 6. 基盤層の追加不備（第2波調査）

第5章で12必須機能の表面的な不備を示した。ここではそれらの背後にある**基盤層**（ビルド・FFI・エラー・シャットダウン・パニック・設定・観測性・セキュリティ・model/state）の追加不備を証拠つきで列挙する。

### 6.1 【DEFICIENCY】 `pjsua-native` feature は現状ビルド不能・EFI 経路が成立しない

ビルド・FFI まわりの不備が、3.1「実バックエンドが選ばれない」をさらに抜き足にかけている。

**(a) `expose_secret()` メソッドが無い** — `src/ffi/backend_strategy.rs:87,135` が `config.password.expose_secret()` を呼ぶが、`SecretString`（`src/security/security_platform_diffs.rs`）にそのメソッドは無い（公開は `as_str()` のみ）。feature 無効時は該当関数がコンパイル対象から外れて通るが、**feature 有効でコンパイルエラー**になる。

**(b) bindgen 生成定数の名前が stub と不一致** — stub（`src/ffi/bindings.rs:90-101`）は C enum を Rust「モジュール」形式（`pjsua_call_media_status::ACTIVE` 等）で定義するが、bindgen 0.69 のデフォルト出力はフラット定数（`pjsua_call_media_status_PJSUA_CALL_MEDIA_ACTIVE`）。参照元（`m20_native_event_conv.rs:166,298,312,332`・`reactor.rs:1083+`）はモジュール形式を前提としており、**feature 有効ビルドで名前解決が壊れる**。build.rs に `constified_enum_module()` 等の回避策は無い。

**(c) リンク指定が矛盾** — build.rs（`build.rs:144-150`）は `cargo:rustc-link-lib=static=pjsua2` を emit するが、FFI は **C API（`pjsua_*`）** をバインドしており、対象ライブラリは `libpjsua`（C）/ `libpjsua2`（C++）の実であり、`libpjsua2` のみでは解決しない。R の選択は背後でずれている（§28.4 OS別の -l/system framework list は未 emit）。

**(d) prebuilt ライブラリ検出が常に失敗** — `resolve_prebuilt_lib_dir()`（`build.rs:117-127`）は `vendor/prebuilt/{TARGET}/lib` を見るが、ディスク上の実体は `vendor/prebuilt/aarch64-apple-darwin/lib.bak/`（中身 `*.a` あり）であり `lib/` ではない。→ 常に `None` → `cargo:warning=PJSIP not found`（`build.rs:34-36`）。M1 Mac での prebuilt が有効にならない。

**(e) sourceビルド不在** — RFC §28.2 の `build_pjsip_from_source`（CMake 発行）は実装されていない（`src/build/build_strategy_os_deps.rs:210-232` は `vendor/pjsip/CMakeLists.txt` 存在チェックのみで、probe は「存在すれば Present」と報告するだけ）。cmake/make の起動コードは repository 内に無い。

**修正要件**：
- `expose_secret()` を `SecretString` へ実装（または `as_str()` に置換）。
- bindgen の enum 生成を `constified_enum_module()` で stub と同じモジュール形式に固定する（または参照側をフラット定数に）。
- build.rs に OS 別リンク選択（§28.4）と `pjsip`/`pjsua` 本体の解決を実装。
- prebuilt パスを `lib/` ≍ `lib.bak/` に見直す、または probe を実ファイルの存在で判断。
- CMake/source build のフォールバックを実装。

### 6.2 【OMISSION】 プラットフォーム差異 §36 がコード上で皆無

- `src/` 全体と `build.rs` を通して **`#[cfg(target_os)]` / `cfg(unix)` / `cfg(windows)` は0件**（機械走査で確定）。
- RFC §36（2431-2435）は「Windows MSVC prebuilt / macOS system framework / Linux system libs」を build スクリプトで emit するよう要求、§50「3対応OSで build 正常」。
- 実態は: `docs` コメント（`security_platform_diffs.rs:28-31`）、`os_dependency_hint` の文字列（`build_strategy_os_deps.rs:162-168`）、CI matrix（`cicd_docker_prebuilt.rs:25-117`）、ARMエンディアンの `platform_clang_defines`（`build_script_bindgen.rs:173-191`）のみ。**プラットフォーム分岐コード・OS別ライブラリリンク経路は無い**。

**修正**： `#[cfg(target_os)]` と build.rs での `-framework` / `-l` 分岐を実装し、OS ごとに audio/FFI の compile 選択肢を持つ。

### 6.3 【DEFICIENCY】 エラー設計（§14）の不整合と production 未接続

(a) **variant 数が RFC とずれる**: RFC §14（RFC-ROOT.md:626-643）は 23 variant。実装（`error_design_siperror.rs:49-99`）は **24**（`InvalidArgument` が追加）。「24 である」とする invariant コメント・テスト（同 :45, :696-728）があり、RFC の列挙との比較テストが無いため表面化しない。

(b) **変換器が production で使われない**:
- `m20_runtime_command_error.rs` の `convert_conf_*` / `convert_get_account_info_error`（M20 で指定の `InvalidState` / `AccountNotFound` へ変換）は **`#[cfg(test)]` 内のみ**で使用。
- reactor の `ConfConnect` ・`GetAccountInfo`（`reactor.rs:175-236`）はバックエンド結果を素通しし、M20 変換器を経由しない。→「conf_port 未解決 → InvalidState」等の意味付けは表面化しない。

(c) **`native_status` が変換パスで失われる**: `backend.rs::map_pjsua_status`(389-391) が status を文字列に埋め込み、`From<ReactorError>`（`error.rs:299-307`）が `NativeError` を作る際に `native_status=None` を設定する。→ **数値状態はどこにも破棄される**。`native_error_with_status()`（m20 の helper）は数字を持つが production 未使用。

(d) **SIP 4xx-6xx → InviteFailed / RegistrationFailed の変換がない**: grep で production に生成箇所ゼロ。`RegistrationFailed` はイベント payload としてのみ存在。`convert_pj_status`（`error.rs:322-330`）は「何でも NativeError」の dead code。

**修正**：RFC §14.1 の変換表（pj_status != success → NativeError / 4xx-6xx → Invite/RegistrationFailed、supplemental への転写）を reactor 経路に実装し `native_status` を保持する。M20 変換器を reactor から呼ぶ。variant 24 vs 23 は RFC 側で明示するか `InvalidArgument` を RFC 拡張として受け入れるか決定。

### 6.4 【DEFICIENCY】 シャットダウンが実パスで本格的手続きを通らない

- RFC §32：`shutdown()` は idempotent；BYE/CANCEL 全通話 → account unregister → audio drain → pjsua_destroy の順。
- 実装：`src/state/shutdown_specification.rs`（`ShutdownPhase` 63-71、`execute_sequence` 178-212、per-phase timeout）は unit test（C044）で検証されているが、**production の `client.shutdown()` 経路では呼ばれない**。reactor の Shutdown arm（`reactor.rs:460-468`）は `backend.shutdown()` を呼び `terminated=true; break` のみ。
- **M20 Shutdown ルーティング（§32 追補）も dead**: `ShutdownCommandRouter::classify`（`src/error/m20_shutdown_routing.rs:68-86`）は精確な分岐を持つが、reactor のループに `is_shutting_down` ゲートが無い。shutdown 後に enqueue されたコマンドは router を通らずドロップ（oneshot sender drop）。
- 唯一 OK: 冪等性（is_terminated チェック + ReactorDown→Ok）は達成。§32.1 cancellation safety（oneshot reply を受信側が落とすと sender 側で無視、reactor 継続）は正しい。

**修正**：reactor の `shutdown` arm から `ShutdownSpec.execute_sequence(...)`（BYE/unregister/drain）を呼ぶ。command 受け取りループに `ShutdownCommandRouter` を接続する。

### 6.5 【DEFICIENCY】 パニックポリシー §46 が実装されていない

- RFC §46：FFI callback 境界で catch_unwind 必須。§46.1: 依存エンティティを Stopping にして async クリーンを別 catch_unwind で行い、reactor は止まらない。
- 実装: `ffi/callback.rs`（extern "C" callbacks）に **catch_unwind 無し** — C ABI でパニックの unwinding は UB。
- reactor は DispatchCommand 内 arm でパニックが起きたら `terminated=true; break`（`reactor.rs:46-47,132-157`）→ **RFC §46.1「entity を Stopping にして継続」と反対**。
- `PanicPolicy`（`challenges_panic_policy.rs`）は実行されたポリシー文書であり、`catch_unwind_mandatory()` は const true を返すだけで実施が無い。
- `SipEventPayload::Error` が dispatch パニック時に発行されない（elsewhere: reactor の backend 失敗 arm のみ）。
- その他: `handle.rs:152-209`・`pj_str.rs:79` の `unreachable!()` は trusted-unrechable 防御（許容）。

**修正**: （1）`ffi/callback.rs` の各 `extern "C"` callback を `catch_unwind` で包む（e.g. `std::panic::catch_unwind(AssertUnwindSafe(...))`，panic を記録して無害値 return）。（2）reactor の dispatch を「entity を Stopping に遷移 → `SipEventPayload::Error` 発行 → 継続」にする。

### 6.6 【DEFICIENCY】 設定系の大きな乖離

**(a) 2つの `ClientConfig`**（最重要の config 系問題）
- **公開API `config::ClientConfig`（`src/config.rs:141-170`）** は P0-3 遺物：`sip_proxy_host/port`・`credentials: Option<AuthCredentials>`・`stun_server: Option<String>`・`turn_server: Option<StunServerConfig>`（前述の型バグ）・`ice_enabled: bool`・`log_level` 等。RFC §10 のフィールド（`max_calls`, `event_bus_capacity`, `transports: Vec`, `stun_servers: Vec`, `timeouts` 等）は含まない。
- RFC 準拠の **`config::client_config_spec::ClientConfig`（`client_config_spec.rs:137-162`）** はフィールド正確だが **lib.rs に re-export されず production から未使用**（dead）。
- `SipClient::new` が受けるのは前者。→ RFC §10 の仕様は「公開 API と無関係」。
- `IceConfig` default 乖離（RFC: enabled=true / aggressive_nomination=true / max_host_candidates 16=usize vs 実装 false/false/5/u8）。`StunServerConfig` / `TurnServerConfig` の形（RFC `uri` vs 実 `host+port`）。`ClientConfigBuilder::build()` は host 未設定で **`panic!`**（`config.rs:327`）。

**(b) 登録関連**： `registrar_uri` の自動導出（§11.1、`sip:{domain}`）が rustdoc に記載されるが**コード上で派生されない**（`account_config_spec.rs:162` doc、`validate()` はしない）。

**修正**：公開 `ClientConfig` を `client_config_spec` の RFC 準拠型に切り替える（`lib.rs` に re-export）。ICE/STUN/TURN の形と default を RFC §13 に揃える。`builder().build()` の panic を `Result` に。

### 6.7 【DEFICIENCY】 観測性（metrics / capability）は宣言のみ

- RFC §34.2 の 8カウンター/ゲージ（`audio_tap_overflows_total`・`dtmf_sent_total`・`dtmf_received_total`・`ice_failures_total`・`transport_reconnects_total`・`raw_sip_messages_total` と `active_calls`・`registered_accounts`）は `observability_metrics.rs` に **名前だけ存在**。
- `metrics` feature は非 default（Cargo.toml:11 default は serde,tls）で、`MetricsRegistry` を **誰もインクリメントしない**。`active_calls` 等は Reactor が更新しない。
- **ClientCapabilities が2つある**: `observability_metrics.rs:44-159`（RFC §34.3 の20フィールド、値はハードコードされた安全デフォルト）と、`runtime/state.rs:19-23` の最小型。イベント payload には前者、reactor state は後者。E2E どこにも実際の検出結果（stun_supported 等）が入らない。

**修正**: reactor/backend からのメトリック更新（tap overflow・dtmf 送受信・ice・transport reconnect・raw sip）と能力取得（`ClientCapabilities` の実検出）を実装する。

### 6.8 【DEFICIENCY】 セキュリティ §35 に関わる不備

- **§35違反**: `src/api/call_types.rs:42` `AuthOverride::Credentials { username: String, password: String }` — **パスワードが plain String**。`Debug` derive で `{:?}` すると平文漏出。SecretString が使われているのは account / TURN / AuthCredential のみ（`account_config_spec.rs:159`、`transport_ice_spec.rs:168`、`config.rs:64`）。
- **serde で平文が漏れる**: `SecretString` の Serialize（unconditional）は平文を出力し、`security_platform_diffs.rs:306-318` が「serialized JSON に平文が含まれる」ことを **テストで固定**。JSON ログ・サーバー永続化に credential が清文で出る。
- **zeroize はデフォルト off**: `zeroize = ["dep:zeroize"]` は `default=["serde","tls"]` に含まれず、パスワードがヒープに残る。
- **sqlite_schema.rs:256** に password を `Vec<u8>` で貯す（"encrypted" コメントは不実体 — 実際は平文）。
- ただし `Debug` 表示は `[REDACTED]`（`security_platform_diffs.rs:78-91`）・TLS verify default true（`transport_ice_spec.rs:98-109`）・Authorization header リダクションは実装済み（`raw_sip_message_spec.rs:166`）。

**修正**: `AuthOverride::Credentials.password` を `SecretString` に。`SecretString` の Serialize に赤化 config を入れる。`zeroize` を default にするか、明示的な警告つきで。DB の credential 保存に暗号化レイヤを。

### 6.9 【DEFICIENCY】 model/state 層の追加不備

- **domain 型に serde が無い**: `serde` は default feature だが、`AccountId`/`CallId` ・イベント payload struct（`ConnectedCallInfo` 等）は一切 `Serialize` を持たない。→ JSON イベント配信（§54 の要とする）が単に不可能。
- `RawSipMessage::redact_authorization` の表現が RFC（`***REDACTED***`）と実装（`[REDACTED]`）で違う（RFC-ROOT.md:1068 vs `raw_sip_message_spec.rs:28`）— コンシューマが wire 文言に依存した場合不一致。
- **runtime state が String 型のまま**: `AccountEntry.registration: String`（`state.rs:66-68`）、`CallEntry.state: String` / `media: String`（`state.rs:75-86`）— RFC §33 は型付き（`RegistrationState`/`CallState`）を要求。型付き newtype は存在するのに storage が String。RFC §17 の初期 `Disabled` が Mockの `"Registered"` で置き換えられている（§F4）。
- `max_calls`（§18.2）は config で `>0` 検証のみで、make_call 時に**強制されない**（`reactor.rs:701-717` に容量チェックなし）。
- codec 設定（§29）：`configure_codecs`（`backend_calls.rs:235-257`）は FFI 実装があるが**初期化時に呼ばれない**（§50「PCMU/Opus のみ交渉」未達）。`NegotiatedCodec` を `CallConnected` の `ConnectedCallInfo` に含める（RFC §29）も未実装（`event_model_payload_bus.rs:128-132` は 3フィールドのみ）。
- `SipCall::answer`：`is_valid_answer_code`（`call.rs:127-142`）が 100-199/200 を許容、RFC §19.1 の 486/603（decline）を拒否 → decline応答が表現不能。
- `DtmfMethod` が3箇所に重複（account_config_spec / observability_metrics / RFC表記 `SipInfo` vs 実装 `Info`/`Rfc2833`）。
- §16 `RawSipMessage` 構造は RFC 17field 一致（OK）。CallState 13 variant・20 edge・`CallMediaState` は正確。

**修正**: serde の追加 （ID+event struct）、state の string → typed（`RegistrationState`/`CallState`）、`max_calls` 強制、init 時 codec 設定、answer 486/603 受容、DtmfMethod 統合。

### 6.10 【DEFICIENCY】 TLS / SRTP / ICE が実際のメディア設定に届かない

- `TlsConfig`（`transport_ice_spec.rs:79-110`）は export 済みだが **consumer ゼロ**：`backend_calls.rs:55-62` の `create_transport()` は `pjsua_transport_create(NULL, ...)`（ulSetting なし）で TLS 設定を渡さない。reactor の TLS arm（`reactor.rs:402-413`）は `("tls", port)` を state に記録するのみ。
- SRTP: `SrtpPolicy` が **2箇所**に重複定義（`account_config_spec.rs:44`・`srtp_transport_reconnect.rs:27-42`）。どちらも production から`.validate()` が呼ばれず、SRTP feature は `[]`（`Cargo.toml`）で `#[cfg(feature="srtp")]` コードが無い。`pjsua_acc_config` に `srtp_use` を設定する経路が無い（§37の RF).
- **§59.1 TLS 証明書通知が未実装**: `NativeEvent::TlsCertificateInfo`（fingerprint/subject/issuer/expiry/verified）・`DnsResolutionResult` は **variant としても存在しない**。`TlsCertInfo`（`semver_sip_networking.rs:49-61`）は config の3フィールド（ca_cert_path, client_cert_path, verify_server）で、RFC の「通知 payload」とは形が違う。

**修正**: TLS transport の設定を PJSIP へ、SRTP の SDP 設定（`srtp_use`・`media_srtp`）を add_account へ接続。§59.1 の TLS/DNS ナイフイベントを NativeEvent に追加して PJSIP TLS callback で発行。

---

## 7. RFC 設計上の欠陥（RFC-DESIGN-DEFECT）

以下は src 側の実装ではなく、**RFC-ROOT.md 自身**の設計矛盾・記述矛盾であり、修正時には RFC 側・必須機能の整合を取る必要がある。

| # | RFC の箇所 | 内容 | 分類 |
|---|---|---|---|
| RD-1 | M20 追補 error table（RFC-ROOT.md:664-671） | `ConfConnect` 失敗の変換先として **`InternalError`** / **`NotFound`** を列挙するが、§14 の `SipErrorKind`（23変数）にそれらは存在しない。→ RFC 内部自己矛盾。実装は `NativeError` 等で代替した（§6.3）。 | RFC-internal contradiction |
| RD-2 | §54.5（RFC-ROOT.md:3316-3346） | `SipEvent.seq`・`AudioChunkPair.first_seq/last_seq`（恒常的 uid）を要求するが、§21/§22 の構造定義にそのフィールドが無い。「追加する」という序列の明記が無く、RFC 文書内で同名 struct が形を変える。実装は旧定義を採用して seq を落とした。 | RFC-internal contradiction（規格追記の欠落） |
| RD-3 | §54.4（RFC-ROOT.md:3317-3318） | WS binary `AudioFrameHeader` が「合計24バイト」と記述されるが、RFC 自身のフィールド列（u64+u64+u16+u16+u8+u8+u32+[u8;4]）の合計は **30バイト**。実装は 30 バイトで正しい。 | RFC-internal arithmetic error |
| RD-4 | §16（RFC-ROOT.md:1068） | リダクション文字が `***REDACTED***` と定められる一方、実装は `[REDACTED]`（テストで固定）——意図としては互換かもしれないが、wire 消費者に混乱を生む。デフォルト表記を統一すべき。 | 仕様の文言不一致 |
| RD-5 | §13 vs §10 | ICE default（§10 `IceConfig::default()`）と §13 のデフォルト記述が一致しない（enabled / aggressive_nomination / max_host_candidates が §10 と §13 で異なる）。実装は §10 のデフォルトに追従したとして §13 と矛盾。 | RFC-internal inconsistency |

> 注: RD-5 は実装の「対処」がおかしいわけではなく、RFC の内部・既定値が衝突した結果として実装が片方に従ったことを示す。

**メタ判断**: 必須機能と矛盾する RFC は「RFC の設計欠陥」と見なす（ユーザー指示）。RD-2 の seq 相関は必須機能 F10 と絡み、RFC の §21/22 との整合な形に書き直すだけで（実装に seq を追加し）両立可能。RD-1 は variant 集を定義済みに戻す/追加を明記する。

---

## 8. 完全実装のための修正計画（Fix Plan）

### Phase 0 — ビルドを可能にする（最優先）
1. `SecretString` に `expose_secret()` を追加するか、`backend_strategy.rs` を `as_str()` に。
2. `build.rs` の bindgen enum 出力を stub と同じモジュール形式に統一（または問題の参照を更新）。
3. `build.rs` の link 行を C API の実際のライブラリに合わせ、OS 別の framework/lib を §28.4 から emit。
4. `resolve_prebuilt_lib_dir` を実際の `lib.bak/` 等から適切なパスへ（または probe を「実ファイル存在」で判定）。
5. `build_pjsip_from_source`（CMake）フォールバックを実装。

### Phase 1 — reactor から実バックエンドへ
6. `reactor.rs:74-75` に `#[cfg(feature="pjsua-native")] PjsuaBackend` / mock の切替を実装。
7. イベントバスを 1 本化（reactor` dispatch_event` をクライアントのバスへ、§15.6）。

### Phase 2 — イベント・API の実配線
8. 「発信・着信・登録・DTMF・音声」の公開 API と reactor コマンドを直接接続（F1〜F12 参照）。イベント 36 variant のうち production で到達する経路を作る（F8）。
9. `SipClient::answer` / `send_dtmf` を公開（F6, F7）。
10. メディアパスを結線（tap / AudioWorkerTask / `conf_connect`、F9・F11 参照）。

### Phase 3 — 音声・トレース
11. `AudioWorkerTask` spawn を初期化時に起動・mixer と PJSUA conf を結線（F9, F11）。
12. `seq` （SipEvent / AudioChunkPair）実装と unified SequenceGenerator（F10）。

### Phase 4 — 基盤・設定・観測
13. `ClientConfig` を RFC §10 準拠の `client_config_spec::ClientConfig` に貫替、STUN/TURN/ICE を Vec 化（F3）。
14. エラーを §14 の23変数（または拡張明記）＋native_status 保持＋4xx-6xx 変換（§6.3）。
15. 破棄シーケンス（§32）・M20 ルーティング・パニック処理（§46）を reactor で実効化（6.4・6.5）。
16. Metrics・ClientCapabilities 更新（6.7）、`SecretString` 適用と zeroize default（6.8）、domain serde（6.9）、TLS/SRTP wiring & `TlsCertificateInfo`（6.10）。

### Phase 5 — REST・サーバー
17. `siprs-server` 実体化（18+2 endpoint、WS ハンドラ、`run_server` の config 読み取り）、JWT 本番ルート（§5.12）。
18. 必須12機能すべてに E2E テストを追加。

---

## 9. 検証方法

修正は「1. 失敗するテストの作成（RED）→ 2. 最小実装（GREEN）→ 3. リファクタリング（REFACTOR）」の TDD で行う（ユーザー指示の実装順序に従う）。

**各指摘の修復に対応して**：
- 単体テスト: `make test`（Makefile 経由）。
- `cargo test --features pjsua-native` で feature ON ビルドが**コンパイル**できること（Phase 0 の確認）。
- 公開 API のシグネチャを既存テストが壊れない形で追加。
- `pjsua-native` なしの既定ビルドは今まで通り green。

**重大度ランクの目安（Priority 表）**:
- **P0**: ビルド不能（6.1, 3.1）
- **P1**: 公開 API の実効的動作（F1-F12、イベント、DTMF、answer）

各指摘の背景・根拠は対応する節に記載済み。実装が既存テストの前提を変える場合は、テストを変更せず、RFC と必須要件の整合を取ってから実装する。

---

## 10. 付録: 証拠ファイル索引

| ファイル | 主要な指摘への関連元 |
|---|---|
| `src/runtime/reactor.rs` | 3.1（Mock 選択）、3.2（バス分断）、発信イベント不在、DTMF、shutdown arm等 |
| `src/runtime/backend.rs` | Mock ハードコード（Registered）、set_registration no-op・map_pjsua_status |
| `src/runtime/state.rs` | accounts BTreeMap、registration/call の String typed、ClientCapabilities 2種 |
| `src/runtime/command.rs` | ConfConnect/AddAudioSource、SendDtmf（テスト）、Answer 不在 |
| `src/runtime/handle.rs` | submit_add_audio_source、default_event_bus、enqueue_native_event（test のみ） |
| `src/client.rs` | new のタプル返し&ClientInitialized、subscribe 系、shutdown の簡素 |
| `src/config.rs` | ClientConfig 単一値、builder の panic |
| `src/config/client_config_spec.rs` | RFC §10 ClientConfig（未 export） |
| `src/config/account_config_spec.rs` | DtmfMethod/DtmfPolicy、register_on_start、allow_outbound_without_register |
| `src/config/transport_ice_spec.rs` | STUN/TURN/ICE 形と二重定義 |
| `src/ffi/backend_calls.rs` | configure_codecs、pjsua 呼び出し、expose_secret 呼び出し |
| `src/ffi/bindings.rs` | stub モジュール形式 enum |
| `src/ffi/callback.rs` | catch_unwind 不在 |
| `src/model/audio_format_chunkpair.rs` | AudioChunkPair/ChannelLayout（型は一致） |
| `src/api/audio_subscribe_bp.rs` | AudioTapHandle/push の未配線 |
| `src/api/event_model_payload_bus.rs` | SipEventPayload 36 変数の未発行／Info struct の一部欠損 |
| `src/api/call_types.rs` | OutgoingCallRequest （型は一致）、AuthOverride のパスワード String |
| `src/api/standalone_server_config.rs` | build_router 2 本、run_server の InvalidConfig |
| `src/api/http_ws_protocol.rs` | シーケンス generator 未接続、AudioFrameHeader 30B |
| `src/security/security_platform_diffs.rs` | SecretString Debug 赤化、serde 平文 |
| `src/error/**` | 24 vs 23、convert dead、ShutdownRouter dead |
| `src/state/shutdown_specification.rs` | 5-phase（test のみ） |

---
*生成: 2026-08-16。調査根拠は RFC-ROOT.md と src/ の全コード。第1波（機能別9チャ）＋第2波（基盤層4チャ＋機械走査）による。*
