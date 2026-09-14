# siprs Implementation Gaps, Deficiencies, and Contradictions — Complete Inventory (OMISSIONS-2026-08-16)

> **Audience**: implementers and reviewers of the siprs crate.
> **Purpose**: To expose in detail the **omissions (OMISSION), deficiencies (DEFICIENCY), and contradictions (CONTRADICTION / RFC-DESIGN-DEFECT)** in `src/` with respect to the 12 mandatory features (user requirements) and the implementation defined in the design document RFC-ROOT.md, and to present the correction requirements for reaching a full implementation.
> **Scope of investigation**: `/Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT.md` (design document; 3763 lines) and all Rust implementations under `src/`. Facts were derived only from `src/` and `RFC-ROOT.md`, without reading `specs/` or `tests/`.
> **Investigation date**: 2026-08-16 (HEAD `6255a8a8` v0.24.604)
> **Japanese version**: `OMISSIONS-2026-08-16.md`

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Methodology](#2-methodology)
3. [The Three Most Important Root Pathologies](#3-the-three-most-important-root-pathologies)
4. [Determination Summary of the 12 Mandatory Features](#4-determination-summary-of-the-12-mandatory-features)
5. [Feature-by-Feature Detail (12 mandatory items)](#5-feature-by-feature-detail-12-mandatory-items)
6. [Additional Baseline Layer Gaps (Second-Wave Investigation)](#6-additional-baseline-layer-gaps-second-wave-investigation)
7. [RFC Design Defects (RFC-DESIGN-DEFECT)](#7-rfc-design-defects-rfc-design-defect)
8. [Fix Plan for Full Implementation](#8-fix-plan-for-full-implementation)
9. [Verification Method](#9-verification-method)
10. [Appendix: Evidence File Index](#10-appendix-evidence-file-index)

---

## 1. Introduction

siprs is a SIP voice client library crate that wraps PJSIP (PJSUA) in a safe Rust async layer. RFC-ROOT.md prescribes the complete design of this crate, and `src/` is its implementation. However, the current implementation has **highly completed "types, events, and API contracts" on the one hand, while "real network operation (PJSIP binding / real-time media wiring)" is unwired** on the other. This document verifies the current state across the following four quadrants.

- **A. Mandatory 12 features vs `src`**: Whether the 12 items the user has declared mandatory are actually functional implementations.
- **B. RFC-ROOT.md specification vs `src`**: Whether there are omissions, deficiencies, or contradictions in the shape the RFC prescribed versus the shape of the implementation.
- **C. Internal RFC contradictions**: Places where the RFC itself defines types contradictorily.
- **D. Code quality / security**: Type safety, memory, and secret-handling issues.

Every finding in this document carries **evidence (RFC line number + `src` file:line)**. The **kind** of each finding is indicated by the following markers:

| Marker | Meaning |
|---|---|
| 【OMISSION】 | Defined in the RFC or mandatory requirement but absent from the implementation. |
| 【DEFICIENCY】 | Implementation exists but is defective: does not work, is incorrect, unreachable, or of the wrong shape. |
| 【RFC-DESIGN-DEFECT】 | When RFC-ROOT.md itself is proven to carry a design defect conflicting with a requirement or **mandatory feature**. |
| 【CONTRADICTION】 | The `src` implementation has behavior, shape, or defaults that contradict the RFC. |
| 【WIRED-DEAD】 | The implementation exists but is not called from production (dead code) and does not work. |

---

## 2. Methodology

- **Target**: `RFC-ROOT.md` (all 3763 lines; 202 sections) and all `.rs` files under `src/`.
- **Procedure**: three stages
  1. **Mechanical scan**: `grep -rn` for `[STUB::]`, `todo!`, `unimplemented!`, `panic!`, `unreachable!`, `#[allow(...)]`, `cfg(target_os)`, `cfg(feature=...)` — covering all sources.
  2. **Feature-by-feature deep dive**: the 12 mandatory features cross-referenced against the corresponding RFC sections and `src` files (first wave: 9 agents).
  3. **Baseline-layer deep dive**: errors, shutdown, panic policy, config conformance, security/build/platform, model/state layers, observability (second wave: 4 agents plus mechanical scan).
- **No touch**: this investigation changed no code at all.
- **Terminology**: "production path" means the actual runtime path that is not covered by `#[cfg(test)]` or `#[cfg(any())]` tests/samples.

**Mechanical scan results (determinative facts)**:

| Scan item | Result |
|---|---|
| `[::STUB::]` markers | **0** (across `src/`; only historical `[::STUB::] P0-3/P0-5` remain in Cargo.toml comments) |
| `todo!` / `unimplemented!` | **0** |
| `panic!` (production branches) | Although production `panic!` is not permitted as an operating practice, `unreachable!()` exists at `handle.rs:152-209` and `pj_str.rs:79` (defensive guards for genuinely unreachable cases; deemed acceptable) |
| `#[allow(...)]` warning suppressions | **0** |
| `#[cfg(target_os)]` / `cfg(unix)` / `cfg(windows)` | **0** → no platform branching (§6.2) |
| `#[cfg(feature=...)]` | Only the `metrics` gate (observability_metrics.rs). **`pjsua-native`, `tls`, `srtp` are never switched in code** |
| `MockBackend` references | reactor.rs / backend.rs / command.rs / shutdown_specification.rs / standalone_server_config.rs / public_api_design.rs / error/m20_runtime_command_error.rs / tests/* |

---

## 3. The Three Most Root Pathologies

Most of the individual findings below can be traced back to these three root causes. Reading this first provides the whole picture.

### 3.1 【DEFICIENCY】 The reactor creates `MockBackend` unconditionally; real PJSIP is never selected

`src/runtime/reactor.rs:74-75`:

```rust
// MockBackend is used until PjsuaBackend is implemented.
let mut backend: Box<dyn SipBackend> = Box::new(MockBackend::new());
```

- **There is no** `#[cfg(feature="pjsua-native")]` alternative (e.g. `PjsuaBackend`). There is no path at all that connects to real PJSIP.
- `PjsuaBackend` is defined (`src/runtime/backend.rs:406-474`) but **instantiated only inside unit tests**; when the feature is off, its internal methods return `Err("...requires the pjsua-native feature")` (`backend.rs:538-565` etc.).
- The **default features** (`default = ["serde","tls"]`, Cargo.toml:11) do not include `pjsua-native`. Furthermore, even enabling `pjsua-native` cannot currently build (see §6.1).
- Consequence: this crate **does nothing against a real SIP network**. Even if `make_call` returns a "successful ID," it is an ID generated by the Mock; no REGISTER/INVITE leaves the wire.

### 3.2 【DEFICIENCY】 Two event buses exist, and the bus the app receives from is not connected to the sending side

- Client side: `SipClient::new` (`src/client.rs:110-112`) creates its own `EventBus` and returns its Receiver to the caller.
- Reactor side: `CoreReactor::new` (`src/runtime/reactor.rs:88-96`) creates a **different** `EventBus` and has a `client_event_buses` map (left empty).
- Events are published only on the reactor side bus (`reactor.rs:537-557, 574-634`), and **there is no code that forwards them to the client-side bus**.
- Consequence: the only event the app can ever receive is the single `ClientInitialized` published directly inside `SipClient::new` (`client.rs:132-138`). Registration/call/DTMF/audio events never arrive.
- Only via the undocumented bypass `client.handle().default_event_bus()` (`handle.rs:92`) can the reactor-side events be touched, but this is undocumented and raw-SIP events do not arrive either.

### 3.3 【DEFICIENCY】 What is needed is "only types"

Many things defined in the RFC and declared as public API have **only the data types, event definitions, and signatures—with no production wiring that actually drives anything**. Typical examples (see sections for details):

- `AsyncAudioSource` / `AudioMixer` / `AudioPipeline`: `AudioWorkerTask` is never spawned in production (see F9/F11).
- `register_on_start` / `allow_outbound_without_register`: never read at runtime (dead config, distinct from §3.1).
- `ShutdownSpec` / `ShutdownCommandRouter` / `PanicPolicy`: tests only; unused from production (§6.4, §6.5).
- `m20_runtime_command_error` converter group: tests only (§6.3).
- `MetricsRegistry` / `ClientCapabilities`: declarations only (§6.7).
- REST API: of the 18 endpoint constants, only 2 are registered in the router (F12).

To fix these pathologies, the path to full implementation is adding "real wiring," not more "types."

---

## 4. Determination of the Mandatory Features (table)

| # | Mandatory feature | Determination | Summary |
|---|---|---|---|
| F1 | Multiple SIP accounts | ⚠ **DEFICIENCY** | Structure (BTreeMap × add_account) is OK. Real network registration only runs on Mock, does not work |
| F2 | Event subscribe / receive | ❌ **DEFICIENCY** | Two buses disconnected (critical). Only `ClientInitialized` received |
| F3 | Multiple STUN/TURN | ❌ **DEFICIENCY** (does not meet the mandatory need) | Real API is single-value; TURN typed as STUN — a type bug. RFC `Vec` spec is dead |
| F4 | Register method | ❌ **OMISSION** (auto-registration) + DEF | `register_on_start` unconsumed; `set_registration` no-op; "Registered" hard-coded |
| F5 | Start without Register | ⚠ structure acceptable / not reachable | `allow_outbound_without_register` unread. Receive-only has zero event source |
| F6 | Making and answering calls | ❌ **outbound**: type OK but zero events / **inbound**: `answer` API absent | |
| F7 | DTMF sending | ❌ **OMISSION** (fails mandatory feature) | `SipCall::send_dtmf` validation-only; reactor send path is dead |
| F8 | SIP event reception | ❌ **partially only** | Only ~16 of 36 variants actually fire |
| F9 | Audio L/R retrieval | ❌ **API contract only** | Zero production calls to `AudioTapSender::push`; `recv()` blocks forever |
| F10 | Audio ⇄ event tracing | ❌ **unimplemented** + shadow | `seq` field absent; `SequenceGenerator` unwired |
| F11 | IN/OUT audio injection | ❌ **disconnected** | Source can be added but never played. Call-scoped routing lost |
| F12 | REST API | ❌ **not startable + spec violation** | `run_server` always returns `Err(NotConfig)`; `server` feature present in siprs (violates RFC §52.1) |

**Refer to §5 for details.** F1–F12 below are the features the mandatory set itself intends to deliver; remaining unimplemented, the crate does not meet the requirements.

---

## 5. Feature-by-Feature Detail (12 mandatory items)

### F1. How to set multiple SIP accounts

**Background**
- RFC prescribes multiple accounts: "multiple `SipAccount` retained `SipAccount` simultaneously." "dynamic add/remove accounts." (RFC-ROOT.md:126-127), `add_account` / `remove_account` (RFC:778-783).
- ID design §9: "Identifiers are runtime-unique non-zero integers" (RFC-ROOT.md:374).

**Current state (src)**
- The storage structure is correct: `ClientState.accounts: BTreeMap<AccountId, AccountEntry>` (`src/runtime/state.rs:45`).
- `SipClient::add_account(config) -> Result<SipAccountHandle, SipError>` (`client.rs:219`) can be called multiple times; each handle is distinguished by `id()` (u64) and `AccountId` (NonZeroU64) (`src/api/public_api_design.rs:33-52`, `src/model/id_design_newtype.rs:64`).
- `SipClient::account(id)` to re-fetch and `remove_account` (`src/client.rs:242-302`).

**【DEFICIENCY】** The implementation structure is OK, but real-account management is merely a fake on the MockBackend (§3.1). The "how to configure" is writable, but there is no "provable working behavior."

**【Supplemental finding】** RFC §50:3067 "independent register/unregister of multiple accounts works" is unachieved.

**Corrective requirement**:
- Implement the real backend selection of §3.1 (no real network communication without the Mock).
- Integration test to actually verify registration/removal of multiple accounts without relying on the Mock (not dependent on unit tests).

### F2. How to Subscribe to and receive events

**【Background】** RFC §8.3: `subscribe()`, `subscribe_account(AccountId)`, `subscribe_raw_sip() -> Option<Receiver<RawSipMessage>>`. §15.4-15.6 (EventBus split / subscriber model), §15.5 `AccountEventReceiver`.

**【src】** `subscribe()` (`src/client.rs:165`), `subscribe_account()` (`src/client.rs:174`), `subscribe_raw_sip()` (`src/client.rs:186`), `subscribe_audio()` (`src/client.rs:349`). `AccountEventReceiver::new/recv/try_recv` (`src/api/eventbus_receiver.rs:121-160`).

**【DEFICIENCY】（equivalent to §3.2）**
- The Receiver returned by `subscribe()` comes from `self.events` (`src/client.rs:166`), but **`ClientInitialized` published inside `SipClient::new` is the only event ever published on that bus**.
- `subscribe_account()` filters on `meta.account_id`, but the published event always has `account_id=None`, so it receives 0 events (contradicting the intent: filtered-to-death).
- `subscribe_raw_sip()` always returns `None` because `EventBus::new(DEFAULT_EVENT_BUS_CAPACITY, None)` passes `None` (contradicts RFC §15.6 "only when disabled is None").
- `recv()` chooses `Lagged(n)` through-layer (RFC §15.7 conformance) — this is correct.

**【RFC-DESIGN-DEFECT】** none (the RFC's description of the subscribe API itself is correct).

**Fix**:
- Register the reactor publish destination `ClientEventBus` with the bus held by `SipClient` (§15.6's `subscribe() → subscribe_control()`).
- Use `RawSipEventConfig.enabled` (default true, `client_config_spec.rs:81-97`) to actually pass `raw_sip_event_capacity` to `EventBus::new`.

### F3. Setting up multiple STUN/TURN servers

**【RFC】** §13 mandates multiple: `pub stun_servers: Vec<pendix>`** (RFC-ROOT.md:400-401), the mandatory feature "multiple STUN/TURN settings" (RFC-ROOT.md:132). Shapes: `StunServerConfig{uri:String}` / `TurnServerConfig{uri,username:Option,password:Option,transport}` (RFC §13:596-605).

**【src】**
- `config.rs:152` `pub stun_server: Option<String>` (**single**)
- `config.rs:154` `pub turn_server: Option<StunServerConfig>` (**single and a type bug**: TURN typed as the STUN type)
- `config.rs:157` `pub ice_enabled: bool`
- Meanwhile, the RFC-Appendix-compliant `client_config_spec.rs:153-157` has `stun_servers: Vec`, `turn_servers: Vec`, `ice: IceConfig`, but **not re-exported in lib.rs and never read anywhere** (dead).

**【DEFICIENCY】** A way to configure multiple STUN/TURN does not exist today. Moreover, STUN/TURN/ICE are **never referenced from runtime/FFIs** (§3.1 same dead-config situation).

**【CONTRADICTION】** `StunServerConfig {host,port}` is defined twice in `config.rs:71` and `transport_ice_spec.rs:143` (type duplication within a single crate).

**Fix**:
- Adopt `client_config_spec::ClientConfig` as the public API `ClientConfig` (re-export in lib.rs) and delete the legacy config.rs variant.
- Type `turn_server` correctly as `TurnServerConfig` and make it `Vec`.
- Unify `StunServerConfig` / `TurnServerConfig` into one location.
- Reflect the config onto PJSIP in the real backend of §3.1 (stun_srv / turn_cfg; ICE via `media_ice` in `pjsua_acc_config`).

### F4. Register method

**【RFC】** §11 `register_on_start: bool`, §17 states (Disabled/Idle/Registering/Registered/Unregistering/Failed/Expired), RFC §50:3067 independent register/unregister behavior, §41.2 example (explicit `register()`).

**【src】**
- `register` (`public_api_design.rs:56`) / `unregister` (:76) / `set_registration_enabled` (:96) / `registration_state` (:120)are present.
- `AccountConfig.register_on_start: bool` (`account_config_spec.rs:171`, default true) is **read from nowhere in the runtime** → no auto-registration.

**【OMISSION】** No consumer of `register_on_start` (auto-registration) exists.

**【DEFICIENCY】**
- `MockBackend::set_registration` (`backend.rs:232-238`) is a no-op: just returns `Ok(())`, changes no state.
- **Fake state display**: `MockBackend::add_account` hard-codes `registration: "Registered"` (`backend.rs:206`). This contradicts RFC §17's initial `Disabled` → `registration_state()` reports accounts as "Registered" even when not registered.
- `examples/account_register.rs:63-64` timeout message: self-records "reactor NativeEvent dispatch pending P12-7".

**Fix**:
- In the reactor `AddAccount` arm, if `register_on_start == true` call `backend.set_registration(acc, true)`.
- Make conversion from the real backend emit `NativeEvent::RegistrationStateChanged` and publish registration events via the P0 mapping (`state/m20_registr_cmd_pat.rs`).
- Change the Mock hard-coded `Registered` to `Disabled` / `Idle` (RFC §17 processing).

### F5. Starting without Register

**【RFC】** §11.1 note: even with `register_on_start == false`, outbound is possible when `allow_outbound_without_register == true`; §17 invariant "make_call is always possible without registration."

**【src】** Startup is possible without an account via `SipClient::new` (Mock, §3.1). `allow_outbound_without_register` (`account_config_spec.rs:173`) is **not read at runtime** (dead).

**【DEFICIENCY】** Behavior is "in-memory simulation." Receive-only (waiting for calls) is impossible because the real event source (PjsuaBackend callback) is not built.

**【Constitution】**: Matches §3.1 for state. Force or clarify the meaning of `allow_outbound_without_register` (permission to place calls while unregistered) in the `make_call` path.

### F6. Making and receiving calls

#### Outgoing
**【RFC】** §19: `account.make_call` returns `u64` CallId; §18.1 state transitions; §41.3 procedure (wait for Ringing→Connected).

**【src】**: `SipAccountHandle::make_call(OutgoingCallRequest) -> Result<u64, SipError>` (`public_api_design.rs:142-156`) → `handle.rs:303` `DispatchCommand::MakeCall` → `handle_make_call` (`reactor.rs:701-721`) → `backend.make_call`. Returns u64; OK.

**【DEFICIENCY)**: **no outbound event is published at all**.
- `handle_make_call` only registers a CallEntry and returns the id; it publishes no `SipEventPayload` (`OutgoingCallStarted`, etc.).
- `MockBackend::make_call` (`backend.rs:241`) only returns an incremented id. The RFC §15.1 event series (Trying→Ringing→Connected) is never generated on the real path.
- → **In the default configuration, "outbound" merely returns a type and ID; no actual INVITE leaves the wire.**

#### Inbound
**【RFC】** §19 mandates `answer` (on SipClient)、§19.1 answer semantics（180/183/200/486/603）、§37 `IncomingCall` data structure + auto-reject timer、§18 `.Incoming→Connecting`（answer(200)）transition.

**【src】**
- `SipEventPayload::IncomingCall (IncomingCallInfo)` (`event_model_payload_bus.rs:338`) is **declaration only**. The `on_incoming_call` callback of `PjsuaBackend` is where it should be generated, but that backend is not selected (§3.1).
- **`SipClient::answer(...)` does not exist**. `SipCall::answer(code)` (`src/call.rs:147-157`) performs only a local state transition (not sent to reactor/wire).
- `SipCall` doc (`call.rs:33-34`) says it is created by "`SipClient::make_call()` or `SipClient::answer_call()`", but **neither exists** (`make_call` is on `SipAccountHandle`; `answer_call` does not exist) → **documentation lie**.

**【Core OMISSION】** The public API `answer` (inbound answer) does not exist; the **receive→answer** flow is impossible.

**【DEFICIENCY】** Moreover, operations other than answer (reject, hold, etc.) are also not covered by the public API; the RFC §19/§18 transitions (Incoming→Connecting, Incoming→Disconnecting, etc.) are SipCall-local validation only and do not reach the wire.

**Fix**:
- Add `SipClient::answer(call_id, code)` / `reject` to the public API (consider §19.1 codes 100-199/200/486/603; 486/603 are decline answers).
- Provide a means to obtain a `SipCall` (a public API equivalent to `SipClient::make_call`, or a subscription that returns the `SipCall` on inbound).
- Publish `IncomingCall` via the Reactor in the real backend of §3.1.

### F7. DTMF sending

**【RFC】** §20 `DtmfMethod {Inband, SipInfo, Rfc4733}` + DtmfPolicy、§19 `SipClient::send_dtmf`、M20 supplement "DtmfSent fires in two phases + 500ms timeout" `DtmfConfig::sent_timeout_ms`.

**【src】**
- DtmfPolicy / DtmfMethod / DtmfConfig: `account_config_spec.rs:35-47`, `config.rs:108-125`（Method = {Rfc2833, Rfc4733, Info, Inband} — matches the RFC's `Info` for `SipInfo`）. Events `DtmfSentInfo`（`m20_dtmfsent_twophase.rs:35-44`）and `DtmfRequiredInfo`.
- **The two-phase reactor implementation is complete**: `DispatchCommand::SendDtmf` → `handle_send_dtmf`（`reactor.rs:725-756`）calls `backend.send_dtmf` and launches `spawn_dtmf_sent_timeout`（`reactor.rs:744`）per digit, publishing `DtmfSent{Err(Timeout)}` after 500ms.
- But **there is no path from public API to submit `SendDtmf`**: `SipCall::send_dtmf(digits, method)`（`call.rs:185-195`）is validation only（`validate_dtmf_digits` / `validate_dtmf_send_method`）and does not call the backend. No wrapper in `handle.rs`.

**【OMISSION】** The mandatory DTMF-sending feature is not achievable. The two-phase machinery (DtmfSent firing, timeout) is fully engineered, but the **public interface that drives it (`SipClient::send_dtmf`) is not implemented**.

**Fix**:
- Implement `SipClient::send_..(call_id, digits, method)` (RFC §19 signature) and submit `RuntimeCommand::SendDtmf`（`command.rs:273`）.
- Change `SipCall::send_dtmf` to actually send through the reactor and monitor the timeout after validation.

### F8. Receiving SIP-related events

**【RFC】** §15.1 lists the full `SipEventPayload` variants; §15.1-15.3 structure. §4.1/§50 "all enumerated events fire" (§50:3017), M20 conversion table（P0/P1/P2 class）。

**【src】**` SipEventPayload` has 36 variants `#[non_exhaustive]`（`event_model_payload_bus.rs:290-387`）、variants names match RFC fully.
- Approximately **16** variants are actually generated（`ClientInitialized`, `RegistrationStarted/..ucceeded/Failed`, `IncomingCall`, `OutgoingCallStarted/Trying/Ringing`, `CallConnected/Disconnected`, `CallHeld`, `MediaActive/MediaError`, `DtmfReceived`, `DtmfSent{Err(Timeout) or Ok}`, `Error`).
- Among them, `OutgoingCallStarted → OutgoingCallTrying → OutgoingCallRinging → CallConnected` are classified only by `CONNECTING` in `convert_call_state`（`m20_callstate_mapping.rs:76-120`）; though the variants exist, **they are never actually produced on the live path**.
- **P1/P2**（Transport, ICE, CallTsxStateChanged, CallRedirected, TransferStatus, CallReplaced, NatDetected, ReferReceived, TransferReceived, TransferCompleted, RegistrationExpired, Unregistration*, MediaStopped, etc.）are **converted to `None`**, so they never fire.

**【OMISSION】** of the 36 variants, only ~16 can fire — "all enumerated events fire" is not achievable. The `#[non_exhaustive]` design matches RFC §15.1（OK）。

**Fix**:
- Implement `Some()` cases for P1（Transport/ICE/Refer/Media/Account/Lifecycle）in the M20 converter.
- Provide complete handling for DTMF `Method` `Info`/`Inband` states.
- Add `[::STUB::]` or a deferred marker for variants that are intentionally not published（current "declaration-only" is unsustainable）.

---


### F9. Audio Stream L/R Pair Reception and Retrieval

**【RFC】** §21 `AudioFormat { sample_rate, bit_depth, channel_layout, frame_ms }`, `ChannelLayout::StereoInOut` (L=IN, R=OUT), §22 Audio subscription API `subscribe_audio(...) -> AudioTapHandle`, `AudioChunkPair { call_id, account_id, timestamp, in_chunk, out_chunk }` (RFC §21.1). §22.1 backpressure (Realtime drops oldest / Lossless blocks producer).

**【src】**: the types are an **exact match**:
- `ProcessedFrame { stereo_interleaved: Vec<i16>, negotiated_codec, timestamp }` (`audio/pipeline.rs:163-171`)
- `AudioChunkPair { call_id, account_id, timestamp, in_chunk, out_chunk }` (`model/audio_format_chunkpair.rs:215-226`)
- `AudioChunk::I16 / F32` (`:181`), `ChannelLayout::StereoInOut` = L=IN/R=OUT (`model/audio_format_chunkpair.rs:87-96`)
- `SipClient::subscribe_audio(call_id, format, capacity, mode) -> Result<AudioTapHandle, SipError>` (`client.rs:349-368`)
- `AudioTapHandle::recv() -> Option<AudioChunkPair>` (`audio_subscribe_bp.rs:113-123`)
- backpressure: `AudioTapSender::push` (`audio_subscribe_bp.rs:172-214`) implements Realtime evict-oldest / Lossless await-space behavior, unit-tested.

**【DEFICIENCY / WIRED-DEAD】（core of the non-functioning path）**
- `SipClient::subscribe_audio` creates a local `tap_channel(capacity, mode)` and stores the `AudioTapSender` in `client.tap_senders`; there is **no production code that calls `AudioTapSender::push(...)`**.
- RFC §22 M20 (Reactor `SubscribeAudio` → `conf_connect` → tap task) is **not implemented**. `RuntimeCommand::ConfConnect` (`command.rs:178`) exists but is only instantiated from shutdown/error-path tests.
- Result: `recv()` blocks forever on `frame_available`; `AudioChunkPair` frames are never produced. **The API contract exists, but the data path is cut.**

**Fix**:
- Add an async tap/drain task that calls `AudioTapSender::push` from the media backend (`PjsuaBackend`) media callbacks (`on_call_media_state` / `put_frame` from the conf port).
- Add `RuntimeCommand::SubscribeAudio` and implement the procedure by which the reactor establishes `conf_connect` (RTP) (§22 M20）。

### F10. Tracing the Correlation Between Audio L/R Pairs and Events

**【RFC]** §54.5 "Guarantee of event-audio temporal correlation (design decision)" requires `SipEvent.seq: u64` and `AudioChunkPair.first_seq/last_seq` (RFC-ROOT.md:3325-3344). It also mentions "timestamp fallback."

**【src】**
- `SipEvent { meta, payload }` — **`seq` field absent** (`event_model_payload_bus.rs:397-401`).
- `AudioChunkPair` has **no `first_seq`/`last_seq`** (`audio_format_chunkpair.rs:215-226`).
- `SequenceGenerator` (`http_ws_protocol.rs:202-241`, monotonic `AtomicU64`) exists but is **used nowhere** (demo only in tests). `AudioFrameHeader` (WS wire) also has `sequence_number`, but is not connected to the EventBus.

**【RFC-DESIGN-DEFECT】** §54.5 reads as "appending" fields to the §21/§22 definitions afterward; the RFC itself never states that "the seq addition of §54.5 supersedes/updates the §21/§22 definitions." → **RFC self-contradiction** (also registered in §7).

**【EMISSION】** Zero E2E implementation of event-audio correlation. The join key can "in design" be obtained via `AudioChunkPair.call_id` and `EventMeta.call_id` (same `CallId`), but seq-based deterministic tracing is impossible.

**Fix**:
- Treat RFC §54.5 as authoritative and add `SipEvent.seq` and `AudioChunkPair.first_seq/last_seq`.
- Share a single `SequenceGenerator` between the reactor and the tap task, stamping both published events and audio frames with the same counter.
- Add a temporal-correlation test (seq monotonically increasing event→frame under the same call).

### F11. Injecting arbitrary audio (file/stream/microphone) into the IN/OUT channels of a call

**【RFC】** §23 `AsyncAudioSource`（`async fn next_chunk(buf: &mut [i16]) -> usize`）、`SyncSourceAdapter`（file/tone）、§24 AudioMixer（per-call mixer）、
§24.1-24.3 worker / mix / gain、§24.4 `SipClient::add_audio_source(call_id, source)`（register a source per call）、§40 `open_default_microphone_source`（cpal-input）。

**【F)**: the API exists:
- `AsyncAudioSource` trait（`runtime/audio_worker.rs:24-31`）
- `AudioMixer::add_source/set_gain/mute`（`audio_worker.rs:186-227`）
- `RuntimeHandle::submit_add_audio_source`（`handle.rs:367-387`, `RuntimeCommand::AddAudioSource` has **no `call_id`**（`command.rs:193`））
- `open_default_microphone_source`（`#[cfg(feature="cpal-input")]`，`asyncaudiosrc_adapter.rs:174-179`）
- `SyncSourceAdapter`（`asyncaudiosrc_adapter.rs:100-144`）
- `examples/tts_source.rs`（mpsc→source injection）、`examples/audio_tap.rs`（tap display）

**【DEFICIENCY: the route is cut】**
1. `AudioWorkerTask::spawn`（`audio_worker.rs:265-310`）is **never called from production**（neither reactor at startup nor client spawns a worker）。
2. `AudioMixer` is created by the reactor（`reactor.rs:79`）and populated by the audio dispatch commands（`reactor.rs:175-207`）… but **with no worker running, frames never accumulate in `out_queue`**, and **`in_queue` is never drained**。
3. `AudioPipeline`（`pipeline.rs:210-247`）is fully pure and has **zero production callers**。
4. **Per-call mixer semantics are lost**: the implementation is **one global AudioMixer**（`reactor.rs:79`）; `add_source` is unrelated to any call。RFC §24.4's per-call scope is dropped。
5. IN vs OUT routing: the design has the RT callback filling `in_queue` and the worker mixing into `out_queue`, but **nothing pushes `in_queue`**。So both "getting the IN channel (peer audio) for tap" and "playing a file on OUT" have **no actual media path**。
6. Microphone: `open_default_microphone_source` compiles behind non-default `cpal-input`; it is never connected to the real `pjsua` input device。

**【CONTRADICTION】** The RFC §24.4 per-call API（`SipClient::add_audio_source(call_id, source)`）conflicts with the call-less `submit_add_audio_source` signature in the implementation。

**Fix**:
- Implement `SipClient::add_audio_source(rcall_id, source)`（RFC §24.4 public form）and add `call_id` to the command。
- Spawn `AudioWorkerTask` at client init and connect the mixer to the PJSUA conference port（`conf_connect`）。
- Wire an E2E path that opens the cpal-input device as an `AsyncAudioSource`。
- Implement IN-channel（peer receive）and OUT-channel（mix & transmit）**as independent pathways**。

### F12. REST API documentation

**【RFC）**
- §52.1 decision：**split `siprs-server` as a separate crate**（"Do not add any HTTP dependency such as Axum to siprs itself." "Do not define the 'server' feature on siprs either" RFC-ROOT.md:3099-3100）。
- §53.1 startup：`ServerConfig::from_args()` → `SipClient::new(client_config)` → router etc.
- §54.1 REST endpoint list（18）§54.2 WS 2、§54.3 Axum Router、§54.4 WS messages（text/binary）、§55 JWT（POST /auth/token、claims sub/username/domain/exp/scope）、**§56 SQLite（sea-orm）**、§57 Layer5 tests。

**【src】**
- **RFC violation**：`server = ["dep:axum","dep:tower-http"]` and `cli = ["dep:clap"]` features exist in `siprs`（Cargo.toml:22-24, 69-71）。This breaks RFC §52.1（"siprs needs no Axum"）。
- `crates/siprs-server/` exists but is a **P4-3 STUB**：`src/routes.rs` empty、`main.rs` prints "ready (stub)"、`auth.rs` hard-coded 401、rusqlite/sea-orm in its Cargo.toml are commented out。**No `migrations/` directory**（§56.2）。
- `standalone_server_config.rs` `build_router`（`:334-339`）registers only `/api/v1/health`（GET）and `/api/v1/shutdown`（POST）。The endpoint constants **18**（`http_ws_protocol.rs:21-55`）match RFC exactly, but the implementation has only 2 routes。
- `run_server`（`:364-440`）**hard-codes `ClientConfig::default()`**; with default `sip_proxy_host=""` → `validate()` returns `Err(InvalidConfig)` → **not startable** (test `standalone_server_config.rs:1132-1143` freezes this failure).
- JWT：`auth_jwt_middleware.rs` `JwtValidator` / `Claims` exist, but the token endpoint is **not registered** on the production router. Token issuance exists only in the test harness（`siprs-server/tests/common/harness.rs`）。
- WS binary `AudioFrameHeader`（30 bytes）vs RFC §54.4（the "24 bytes total" description）: **the RFC's own field-size sum is 30**, contradicting its own description. The implementation's 30 bytes is correct（RFC-DESIGN-DEFECT：§7）。

**【OMISSION / DEFICIENCY】**
- 16 of the 18 REST endpoints return 404; WS also has no handler。
- ClientConfig construction via `config_file`（§53.2）is unimplemented; the server never actually starts。
- `siprs-server` remains a STUB（P4-3）; there is no runnable server。
- Production JWT routes, `find_account` check, and `expires_in` response are missing。

**Fix**： complete the implementation of §52-57（realize the siprs-server crate; make run_server read an actual client_config; implement the 18 endpoints + WS; add JWT enforcement）。Since this scope is about the "substance of the implementation," this fix is mandatory。

**Summary of §5 defense**: Most of F1-F12 *have the public API signatures and types*, but "the reactor uses **MockBackend**, the real backend（PJSIP）is not selected, the event bus is split, and the media path is unwired"—so they "do not work." §6 below enumerates the additional baseline-layer gaps behind this.

---

---

## 6. Additional Baseline Layer Gaps (Second-Wave Investigation)

Chapter 5 showed the surface-level gaps of the 12 mandatory features. This chapter enumerates, with evidence, the additional gaps of the **baseline layer** behind them (build, FFI, errors, shutdown, panic, config, observability, security, model/state).

### 6.1 【DEFICIENCY】 The `pjsua-native` feature cannot currently build; the FFI path does not hold

Build/FFI failures make 3.1 "the real backend is never selected" even more unsafe to rely on.

**(a) No `expose_secret()` method** — `src/ffi/backend_strategy.rs:87,135` calls `config.password.expose_secret()`, but `SecretString` (`src/security/security_platform_diffs.rs`) has no such method (only `as_str()` is public). With the feature off the function is out of the compilation target and passes, but **enabling the feature causes a compile error**.

**(b) The bindgen-generated constant names do not match the stub** — the stub (`src/ffi/bindings.rs:90-101`) defines C enums in Rust "module" form (`pjsua_call_media_status::ACTIVE`, etc.), but bindgen 0.69's default output is flat constants (`pjsua_call_media_status_PJSUA_CALL_MEDIA_ACTIVE`). The in-references (`m20_native_event_conv.rs:166,298,312,332` and `reactor.rs:1083+`) assume module form; **with the feature enabled, name resolution breaks**. build.rs has no workaround such as `constified_enum_module()`.

**(c) Link specification is contradictory** — build.rs (`build.rs:144-150`) emits `cargo:rustc-link-lib=static=pjsua2`, but the FFI binds **the C API (`pjsua_*`)**, against `libpjsua` (C) / `libpjsua2` (C++); `libpjsua2` alone cannot resolve it. The library selection is off behind the scenes (§28.4 OS-specific -l/system-framework list is not emitted).

**(d) Prebuilt library detection always fails** — `resolve_prebuilt_lib_dir()` (`build.rs:117-127`) looks for `vendor/prebuilt/{TARGET}/lib`, but on disk the real entity is `vendor/prebuilt/aarch64-apple-darwin/lib.bak/` (with `*.a` inside), not `vendor/.../lib/`. → always `None` → `cargo:warning=PJSIP not found` (`build.rs:34-36`). The M1 Mac prebuilt never activates.

**(e) No source build** — RFC §28.2's `build_pjsip_from_source` (CMake invocation) is not implemented (`src/build/build_strategy_os_deps.rs:210-232` only checks `vendor/pjsip/CMakeLists.txt` exists; the probe reports "Present" just from the flag). No code in the repository invokes cmake/make.

**Corrective requirement**:
- Implement `expose_secret()` on `SecretString` (or replace with `as_str()`).
- Fix bindgen's enum generation with `constified_enum_module()` to the same module form as the stub (or update the in-references to flat constants).
- Implement OS-specific linker selection in build.rs (per §28.4) and resolution of the `pjsip`/`pjsua` binaries themselves.
- Review the prebuilt path from `lib/` to `lib.bak/` (or make the probe judge by actual file existence).
- Implement the CMake/source-build fallback. 

### 6.2 【OMISSION】 Platform differences (§36) are completely absent in code

- Across all of `src/` and `build.rs` **`#[cfg(target_os)]` / `cfg(unix)` / `cfg(windows)` count is 0** (confirmed by mechanical scan).
- RFC §36 (lines 2431-2435) requires emitting build-script directives ("Windows MSVC prebuilt / macOS system framework / Linux system libs") for each OS, §50 says "build OK on all 3 supported OSes".
- Reality: only a `docs` comment (`security_platform_diffs.rs:28-31`), `os_dependency_hint` strings (`build_strategy_os_deps.rs:162-168`), CI matrix (`cicd_docker_prebuilt.rs:25-117`), and ARM-endianness `platform_clang_defines` (`build_script_bindgen.rs:173-191`). **No platform branch code or OS-specific library-linking path exists**.

**Fix**: implement `#[cfg(target_os)]` and `-framework`/`-l` branch in build.rs so each OS has its own audio/FFI compile choices.

### 6.3 【DEFICIENCY】 Error design (§14) inconsistency and disconnection from production

(a) **Number of variants diverges from RFC**: RFC §14 (RFC-ROOT.md:626-643) has 23 variants. The implementation (`error_design_siperror.rs:49-99`) has **24** (added `InvalidArgument`). An invariant comment/test asserting "24" exists (lines :45, :696-728), but no test compares against the RFC's enumeration, so it never surfaces.

(b) **Converters unused in production**:
- `convert_conf_*` / `convert_get_account_info_error` in `m20_runtime_command_error.rs` (which convert to `InvalidState` / `AccountNotFound` as M20 mandates) are **used only inside `#[cfg(test)]`**.
- The reactor's `ConfConnect`/`GetAccountInfo` (`reactor.rs:175-236`) pass backend results straight through without going through the M20 converters, so semantic mappings like "unresolved conf port → InvalidState" never surface.

(c) **`native_status` is lost in the conversion path**: `backend.rs::map_pjsua_status` (389-391) embeds the status in a string, and `From<ReactorError>` (`error.rs:299-307`) sets `native_status=None` when creating `NativeError`. → **the numeric status is discarded everywhere**. The m20 helper `native_error_with_status()` retains the number but is unused in production.

(d) **No conversion of SIP 4xx-6xx → InviteFailed / RegistrationFailed**: grep finds zero places in production that construct it. `RegistrationFailed` exists only as an event payload. `convert_pj_status` (`error.rs:322-330`) is dead code that maps everything to NativeError.

**Fix**: implement the RFC §14.1 mapping table (native device: `pj_status != success → NativeError`; 4xx-6xx → Invite/RegistrationFailed; transfer to supplemental) in the reactor path and retain `native_status`. Call the M20 converters from the reactor. Decide whether the 24-vs-23 variance is made explicit on the RFC side or `InvalidArgument` is accepted as an RFC extension.

### 6.4 【DEFICIENCY】 Shutdown does not pass through the full procedure on the real path

- RFC §32: `shutdown()` is idempotent; sequence BYE/CANCEL all calls → account unregister → audio drain → pjsua_destroy.
- Implementation: `src/state/shutdown_specification.rs` (`ShutdownPhase` 63-71, `execute_sequence` 178-212, per-phase timeout) is verified by unit tests (C044) but is **not called from the production `client.shutdown()` path**. The reactor's Shutdown arm (`reactor.rs:460-468`) only calls `backend.shutdown()` and `terminated=true; break`.
- **M20 shutdown routing (appendix to §32) is also dead**: `ShutdownCommandRouter::classify` (`src/error/m20_shutdown_routing.rs:68-86`) has exact branches, but the reactor loop has no `is_shutting_down` gate. Commands enqueued after shutdown are dropped without routing (oneshot sender dropped).
- Only OK: idempotency (via `is_terminated` + ReactorDown→Ok) is achieved. §32.1 cancellation safety (dropping the oneshot reply on the receiving side is ignored on the sender side; reactor continues) is correct.

**Fix**: call `ShutdownSpec.execute_sequence(...)` (BYE/unregister/drain) from the reactor's shutdown arm; connect `ShutdownCommandRouter` to the command receive loop.

### 6.5 【DEFICIENCY】 Panic policy §46 is not implemented

- RFC §46: `catch_unwind` is mandatory at the FFI callback boundary. §46.1: set the dependent entity to Stopping and perform async cleanup in a separate `catch_unwind`; the reactor keeps running.
- Implementation: `ffi/callback.rs` (extern "C" callbacks) has **no `catch_unwind`** — unwinding a panic across the C ABI is UB.
- On a panic inside a DispatchCommand arm, the reactor sets `terminated=true; break` (`reactor.rs:46-47,132-157`) — the opposite of RFC §46.1's "set entity to Stopping and continue".
- `PanicPolicy` (`challenges_panic_policy.rs`) is a policy document that simply returns true; `catch_unwind_mandatory()` returns `const true` with no enforcement.
- Other: `unreachable!()` in `handle.rs:152-209` and `pj_str.rs:79` are trusted-defensive (accepted).

**Fix**: (1) wrap each `extern "C"` callback in `ffi/callback.rs` with `catch_unwind` (e.g. `std::panic::catch_unwind(AssertUnwindSafe(...))`, record the panic and return a harmless value). (2) make the reactor's dispatch transition the entity to Stopping, publish `SipEventPayload::Error`, and continue.

### 6.6 【DEFICIENCY】 Large divergence in the configuration area

**(a) Two `ClientConfig`** (the most important config issue):
- **Public API `config::ClientConfig` (`src/config.rs:141-170`)** is a P0-3 legacy: `sip_proxy_host/port`, `credentials: Option<AuthCredentials>`, `stun_server: Option<String>`, `turn_server: Option<StunServerConfig>` (the type bug above), `ice_enabled: bool`, `log_level`. It does not include RFC §10 fields (`max_calls`, `event_bus_capacity`, `transports: Vec`, `stun/turn_servers: Vec`, `timeouts`).
- RFC-compliant **`config::client_config_spec::ClientConfig` (`client_config_spec.rs:137-162)`** matches fields exactly, but is **not re-exported in lib.rs and unused from production** (dead).
- `SipClient::new` takes the former. → RFC §10's spec is "irrelevant to the public API".
- `IceConfig` defaults diverge (RFC: enabled=true / aggressive_nomination=true / max_host_candidates=16 (usize); impl false/false/5 (u8))ually 5). `StunServerConfig` / `TurnServerConfig` shape (RFC `uri` vs impl `host+port`). `ClientConfigBuilder::build()` **panics** when host is unset (`config.rs:327`).

**(b) Registration-related**: `registrar_uri` auto-derivation (§11.1, `sip:{domain}`) is documented in rustdoc but **not derived in code** (`account_config_spec.rs:162` docs, `validate()` doesn't do it).

**Fix**: switch the public `ClientConfig` to the RFC-compliant RFC type from `client_config_spec` (re-export in lib.rs); align ICE/STUN/TURN shape & defaults with RFC §13; change `builder().build()`'s panic into `Result`.

### 6.7 【DEFICIENCY】 Observability (metrics/capability) is declarations only

- RFC §34.2's 8 counters/gauges (`audio_tap_overflows_total`, `dtmf_sent_total`, `dtmf_received_total`, `ice_failures_total`, `transport_reconnects_total`, `raw_sip_messages_total`, plus `active_calls` and `registered_accounts`) exist in `observability_metrics.rs` **in name only**.
- The `metrics` feature is not default (Cargo.toml:11 default is serde/tls) and **nobody increments the `MetricsRegistry`**. Reactor never updates `active_calls` etc.
- **There are two `ClientCapabilities`**: the `ClientCapabilities` of `observability_metrics.rs:44-159` (RFC §34.3's 20 fields; values are hardcoded safe defaults) and the minimal type in `runtime/state.rs:19-23`. The event payload uses the former; reactor state uses the latter. E2E nowhere does actual detection results (e.g. stun_supported) get in.

**Fix**: implement metric updates from reactor/backend (tap overflow, DTMF send/receive, ICE, transport reconnect, raw SIP) and actual capability detection (`ClientCapabilities`) .

### 6.8 【DEFICIENCY】 Defects related to security §35

- **§35 violation**: `src/api/call_types.rs:42` `AuthOverride::Credentials { username: String, password: String }` — **password is a plain String**. With `Debug` derive, `{:?}` leaks the plain text. SecretString is used only in the account / TURN / AuthCredential slots (`account_config_spec.rs:159`, `transport_ice_spec.rs:168`, `config.rs:64`).
- **Plain text leaks through serde**: `SecretString`'s unconditional `Serialize` outputs raw, and `security_platform_diffs.rs:306-318` **freezes in a test** that "the plain text appears in serialized JSON". Credentials go cleartext in JSON logs and server persistence.
- **zeroize is off by default**: `zeroize = ["dep:zeroize"]` (Cargo.toml:27) is not in `default=["serde","tls"]`, so the password stays in the heap.
- **`sqlite_schema.rs:256`** keeps the password as `Vec<u8>` ("encrypted" comment is not substantiated — it's actually plaintext).
- However `Debug` output is `[REDACTED]` (`security_platform_diffs.rs:78-91`), TLS verify default true (`transport_ice_spec.rs:98-109`), and Authorization-header redaction is implemented (`raw_sip_message_spec.rs:166`).

**Fix**: change `AuthOverride::Credentials.password` to `SecretString`; add redaction config to `SecretString`'s Serialize; make `zeroize` default or warn explicitly; add an encryption layer for DB credential storage.

### 6.9 【DEFICIENCY】 Additional gaps in the model/state layer

- **No serde on domain types**: `serde` is a default feature, yet `AccountId`/`CallId` and event payload structs (e.g. `ConnectedCallInfo`) have no `Serialize` at all. → JSON event delivery (§54's requirement) is simply impossible.
- `RawSipMessage::redact_authorization` representation differs from RFC (`***REDACTED***`) vs impl (`[REDACTED]`) (RFC-ROOT.md:1068 vs `raw_sip_message_spec.rs:28`; mismatch if a consumer relies on the wire text).
- **Runtime state stays as String**: `AccountEntry.registration: String` (`state.rs:66-68`), `CallEntry.state: String` / `media: String` (`state.rs:75-86`) — RFC §33 requires typed (`RegistrationState`/`CallState`). The typed newtypes exist but storage is String. RFC §17's initial `Disabled` is replaced by Mock's `"Registered"` (see F4).
- `max_calls` (§18.2) is only validated `> 0` in config; **never enforced** at `make_call` time (`reactor.rs:701-717` has no capacity check).
- Codec setting (§29): `configure_codecs` (`backend_calls.rs:235-257`) has an FFI implementation but **is not called at initialization** (§50 "PCMU/Opus only negotiation" unachieved). Including `NegotiatedCodec` in `CallConnected`'s `ConnectedCallInfo` (RFC §29) is also unimplemented (`event_model_payload_bus.rs:128-132` only 3 fields).
- `SipCall::answer`: `is_valid_answer_code` (`call.rs:127-142`) allows 100-199/200, rejects RFC §19.1's 486/603 (decline) → decline responses cannot be expressed.
- `DtmfMethod` is duplicated in three places (account_config_spec / observability_metrics / RFC: `SipInfo` vs impl `Info`/`Rfc2833`).
- §16 `RawSipMessage` structure matches RFC's 17-field exactly (OK). `CallState` 13 variants + 20 edges + `CallMediaState` are correct.

**Fix**: add serde (ID + event structs), typed runtime state (`RegistrationState`/`CallState`), enforce `max_calls`, set up codecs at init, accept 486/603, and unify `DtmfMethod`.

### 6.10 【DEFICIENCY】 TLS / SRTP / ICE never reach the actual media configuration

- The (`TlsConfig` (`transport_ice_spec.rs:79-110`) is exported, but **consumers are zero**: `create_transport()` in `backend_calls.rs:55-62` calls `pjsua_transport_create(NULL, ...)` with no TLS settings; the reactor TLS arm (`reactor.rs:402-413`) only records `("tls", port)` in state.
- SRTP: `SrtpPolicy` is **duplicated in 2 places** (`account_config_spec.rs:44` and `srtp_transport_reconnect.rs:27-42`). `.validate()` is never called from either in production; the SRTP feature is `[]` (Cargo.toml) and there is no `#[cfg(feature="srtp")]` code; no path sets `srtp_enable`/`media_srtp` on `pjsua_acc_config` (violates §37's requirement order).
- **§59.1 TLS certificate notifications are unimplemented**: `NativeEvent::TlsCertificateInfo` (fingerprint/subject/issuer/expiry/verified) and `DnsResolutionResult` **do not exist even as variants**. And `TlsCertInfo` (`semver_sip_networking.rs:49-61`) is a 3-field config struct (ca_cert_path, client_cert_path, verify_server), not the RFC's "notification payload".

**Fix**: wire TLS transport settings into PJSIP and SRTP's SDP settings (`srtp_use`/`media_srtp`) into `add_account`; add §59.1 TLS/DNS events to `NativeEvent` and publish them from the PJSIP TLS callback.

---

## 7. RFC Design Defects (RFC-DESIGN-DEFECT)

The following are not implementation defects but **RFC-ROOT.md's own design/description contradictions**; fixing requires first aligning the RFC and the mandatory features.

| # | RFC location | Content | Classification |
|---|---|---|---|
| RD-1 | M20 supplement error table (RFC-ROOT.md:664-671) | `InternalError` / **`NotFound`** named as targets for `ConfConnect` failure do not exist in §14's `SipErrorKind` (23 variants). RFC internal self-contradiction; the implementation substituted with `NativeError` etc. (§6.3). | RFC-internal contradiction |
| RD-2 | §54.5 (RFC-ROOT.md:3316-3346) | `SipEvent.seq` and `AudioChunkPair.first_seq/last_seq` (monotonic uid) are required, but §21/§22's structure definitions lack them; no supersede/append ordering is stated, so the same-named structs change shape within the document. The implementation adopted the old definition and dropped seq. | RFC-internal contradiction (spec-append defect) |
| RD-3 | §54.4 (RFC-ROOT.md:3317-3318) | WS binary `AudioFrameHeader` described as "24 bytes total" but the RFC's own field list (u64+u64+u16+u8+u8+u32+[uchar4]) sums to **30 bytes**. The implementation's 30 is correct. | RFC-internal arithmetic error |
| RD-4 | §16 (RFC-ROOT.md:1068) | Redaction literal specified as `***REDACTED***` while implementation uses `[REDACTED]` (frozen by test) — possibly compatible in intent, but confuses wire consumers. Should unify default. | specification-literal mismatch |
| RD-5 | §13 vs §10 | ICE defaults (default in §10 `IceConfig::default()`) and §13's defaults don't agree (enabled / aggressive_nomination / max_host_candidates differ between §10 and §13). If the implementation followed §10, it contradicts §13. | RFC-internal inconsistency |

> **Meta judgment**: an RFC that conflicts with a mandatory feature is deemed an RFC design defect (per user instruction). RD-2's seq correlation is intertwined with mandatory feature F10 and can be made compatible by aligning RFC §21/22 and adding seq to the implementation. RD-1 — bring variants back to defined or explicitly extend.

---

## 8. Fix Plan for Full Implementation

### Phase 0 — Make it build (highest priority)
1. Add `expose_secret()` to `SecretString` or change `backend_strategy.rs` to `as_str()`.
2. Unify the bindgen enum output in build.rs to the same module form as the stub (or update problem references).
3. Align build.rs's link line to the actual library for the C API; emit OS-specific framework/lib per §28.4.
4. Review `resolve_prebuilt_lib_dir` to appropriate paths from actual `vendor/prebuilt/{TARGET}/lib/` etc. (or make probe judge by real file existence).
5. Implement the `build_pjsip_from_source` (CMake) fallback.

### Phase 1 — reactor → real backend
6. Add `#[cfg(feature="pjsua-native")] PjsuaBackend` / mock toggle in `reactor.rs:74-75`.
7. Make the event bus one (route `dispatch_event` of reactor to the client's bus, per §15.6).

### Phase 2 — wire up events & API
8. Connect the public APIs for outbound, inbound, registration, DTMF, and audio directly to reactor commands (see F1-F12); create production-reachable paths for the 36 event variants (F8).
9. Expose `SipClient::answer` / `send_dtmf` (F6, F7).
10. Wire the media path (tap / AudioWorkerTask, `conf_connect`, F9/F11).

### Phase 3 — audio & trace
11. Spawn `AudioWorkerTask` at initialization; wire the mixer with PJSUA conf (F9, F11).
12. Implement `seq` (SipEvent / AudioChunkPair) and a unified SequenceGenerator (F10).

### Phase 4 — baseline/config/observability
13. Switch `ClientConfig` to RFC §10-compliant `client_config_spec::ClientConfig`, make STUN/TURN/ICE Vec (F3).
14. Align errors to §14's 23 variants (or explicitly extend); retain `native_status`; add 4xx-6xx conversion (§6.3).
15. Make shutdown sequence, §4 routing, and panic handling effective in the reactor (§6.4, §6.5).
16. Update Metrics/ClientCapabilities (§6.7), apply `SecretString` & zeroize default (§6.8), domain serde (§6.9), TLS/SRTP wiring & `TlsCertificateInfo` (§6.10).

### Phase 5 — REST & server
17. Realize `siprs-server` (18+2 endpoints, WS handlers, `run_server` config reading), JWT production route (F12).
18. Add E2E tests for all 12 mandatory features.

---

## 9. Verification Method

Fix follows TDD "1. create failing test (RED) → 2. minimal implementation (GREEN) → 3. refactor (REFACTOR)" (do not violate the user's implementation-order instruction).

**Corresponding to each finding's fix**:
- Unit test: `make test` (via Makefile).
- Confirm the `cargo test --features pjsua-native` feature-ON build **compiles** (Phase-0 check).
- Add public API signatures in a way that existing tests don't break.
- The default build without `pjsua-native` stays green as before.

**Severity rank (Priority table)**:
- **P0**: build-impossible (6.1, 3.1)
- **P1**: effective behavior of the public API (F1-F12, events, DTMF, answer)

Background/evidence of each finding is recorded in the corresponding section. If the implementation changes the premises of an existing test, do not change the test; first align with RFC and mandatory requirements, then implement.

---

## 10. Appendix: Evidence File Index

| File | Related to the main findings |
|---|---|
| `src/runtime/reactor.rs` | 3.1 (Mock selection), 3.2 (bus split), outbound events absent, DTMF 8, shutdown arm, etc. |
| `src/runtime/backend.rs` | Mock hardcode (Registered), `set_registration` no-op, `map_pjsua_status` |
| `src/runtime/state.rs` | accounts BTreeMap; registration/call typed string; the two ClientCapabilities |
| `src/runtime/command.rs` | ConfConnect/AddAudioSource, SendDtmf (test), Answer absent |
| `src/runtime/handle.rs` | `submit_add_audio_source`, `default_event_bus`, `enqueue_native_event` (test only) |
| `src/client.rs` | new returns a tuple & ClientInitialized, subscribe set, simplified shutdown |
| `src/config.rs` | ClientConfig single-value, builder panic |
| `src/config/client_config_spec.rs` | RFC §10 ClientConfig (not exported) |
| `src/config/account_config_spec.rs` | DtmfMethod/DtmfPolicy, `register_on_start`, `allow_outbound_without_register` |
| `src/config/transport_ice_spec.rs` | STUN/ICE/TURN shape & duplication; TlsConfig unconsumed |
| `src/ffi/backend_calls.rs` | configure_codecs, pjsua calls, `expose_secret` call |
| `src/ffi/bindings.rs` | stub module-form enums |
| `src/ffi/callback.rs` | missing catch_unwind |
| `src/model/audio_format_chunkpair.rs` | AudioChunkPair/ChannelLayout (types match) |
| `src/api/audio_subscribe_bp.rs` | AudioTapHandle / push unwired |
| `src/api/event_model_payload_bus.rs` | 36 variants not dispatched; some Info structs incomplete |
| `src/api/call_types.rs` | OutgoingCallRequest (types match), AuthOverride password String |
| `src/api/standalone_server_config.rs` | build_router only 2 routes; run_server InvalidConfig |
| `src/api/http_ws_protocol.rs` | SequenceGenerator unwired; AudioFrameHeader 30B |
| `src/security/security_platform_diffs.rs` | SecretString Debug redaction, serde plaintext leak |
| `src/error/**` | 24 vs 23, convert dead, ShutdownRouter dead |
| `src/state/shutdown_specification.rs` | 5-phase (test only) |

---
*Generation: 2026-08-16. Evidence derived from RFC-ROOT.md and all of src/. Based on wave 1 (feature-scope agents) plus wave 2 (baseline-layer agents + mechanical scan).*
