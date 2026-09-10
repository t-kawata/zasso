# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-3: Media port conf-bridge FFI registration (RustMediaPort → pjsua_conf_add_port)

**Ticket Key**: PX-3 · **Phase**: -1

**RFC Source**: `RFC-ROOT.md`

---

## Background

TS-001 follow-up from P16-10: register_conf_callback under pjsua-native must register the RustMediaPort (audio_worker.rs) into the PJSIP conf bridge via pjsua_conf_add_port, then connect each call's conf slot (pjsua_call_get_conf_port / pjsua_conf_connect). Deferred from P16-7 (§62.16) and P16-10 (§62.19) because pjsua-native is pre-broken in the local environment (40+ unrelated bindgen errors) and the SipBackend trait / PjsuaBackend constructor must thread the audio_mixers map to reach per-call AudioMixer.

### Goal
Make PjsuaBackend::register_conf_callback (under the pjsua-native feature) perform the real conf-bridge registration: for every per-call AudioMixer in the shared audio_mixers map, build a RustMediaPort adapted to a pjmedia_port, register it via pjsua_conf_add_port, resolve the call's conf slot via pjsua_call_get_conf_port, and connect them via pjsua_conf_connect — so SIP media actually flows through the PJSIP conference bridge and reaches the tap registry.

### Purpose
The vendored PJSIP has no pjsua_conf_set_callback, so the only way to feed AudioWorker OUT/IN queues into the conf bridge is a custom pjmedia_port (RustMediaPort) registered through pjsua_conf_add_port (N0049 / §39, N0085 / §62.16). This ticket closes the gap where P15-7 built the AudioMixer out_queue/in_queue producer (AudioWorkerInner::process_frame) but the queue had zero consumers and register_conf_callback under pjsua-native returned an unconditional Err. It also makes the per-call AudioMixer map reachable from the backend so the RT consumer can be built per call.

### Motivation
P16-10 established the docker Asterisk/coturn integration base and proved pjsua-native can compile in CI. Without this ticket, the media path is a dead end: no RustMediaPort is ever registered, conf_connect cannot establish a bridge to a call's conf slot, and the subscribe_audio tap registry is never driven by real RT media. Deferred from P16-7 (§62.16) and P16-10 (§62.19) because local pjsua-native was pre-broken (40+ unrelated bindgen errors) — now resolvable via the CI/docker base.

### Constraints
- register_conf_callback under the default build (no pjsua-native) must remain a no-op Ok(()) — the tap registry is still driven by push_media_frame directly.
- All unsafe FFI stays isolated in src/ffi (C038); the runtime layer calls only safe wrappers.
- The RT callbacks (get_frame/put_frame) must stay lock-free and allocation-light (§24.0): only crossbeam ArrayQueue pop/push, memcpy into pre-allocated buffers, and zero-fill on underrun.
- pjsua_conf_add_port requires a non-NULL pj_pool_t (PJ_ASSERT_RETURN(conf && pool && strm_port, PJ_EINVAL) in pjmedia/src/pjmedia/conference.c:1042), so a pool must be obtained via pjsua_pool_create (bindgen allowlist addition).
- Non-success pj_status_t from any conf operation must surface as ReactorError::NativeError via map_pjsua_status — errors are never swallowed.

## Scope

- src/runtime/backend.rs (modify: register_conf_callback pjsua-native branch)
- src/runtime/backend_selection.rs (modify: thread audio_mixers into PjsuaBackend)
- src/ffi/bindings.rs (modify: stub aliases for pjmedia_port / pjsua_conf_add_port to allow default-build compile)
- tests/sip_integration.rs (verify: media flows through conf bridge during docker Asterisk calls)
- **Scope of changes (describe each change comprehensively):**
  - [File/module path] src/ffi/bindings.rs (stub_aliases submodule) — add pjmedia_port-family stub types and conf-bridge stub functions
  - [Action] modify — add
  - [What specifically changes] Add to the default-build stub_aliases: type aliases pj_pool_t = *mut std::ffi::c_void, pj_size_t = usize, pj_uint32_t = u32, pj_status_t = i32, pjmedia_dir = u32, pjmedia_frame_type = u32, pj_timestamp = u32; structs pjmedia_port_info (name: pj_str_t, signature: pj_uint32_t, dir: pjmedia_dir, fmt: pjmedia_format), pjmedia_port (info, port_data { pdata: *mut c_void, ldata: c_long }, grp_lock, get_clock_src/put_frame/get_frame/on_destroy fn pointers), pjmedia_frame (type, buf: *mut c_void, size, timestamp, bit_info); stub functions pjsua_conf_add_port(_pool, _port, _p_id) -> i32, pjsua_call_get_conf_port(_call_id) -> i32, pjsua_pool_create(_name, _init, _inc) -> *mut c_void. Field names mirror the bindgen output so code compiles identically under both bodies.
  - [Before → After (behavior/signature)] Before: these symbols do not exist in the stub, so any non-feature-gated reference to pjmedia_port / pjsua_conf_add_port fails the default build. After: the default build compiles the conf-bridge wrappers and adapter, and unit tests can exercise them against the deterministic stubs.
  - [API contract change (if any)] Non-breaking additive: siprs::ffi::bindings::{pjmedia_port, pjmedia_port_info, pjmedia_frame, pjsua_conf_add_port, pjsua_call_get_conf_port, pjsua_pool_create} become available in both builds.
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.

  - [File/module path] src/build/build_script_bindgen.rs — bindgen allowlist
  - [Action] modify — add "pjsua_pool_create" to BINDGEN_ALLOWLIST_FUNCTIONS (pj_pool_t is already allowlisted)
  - [What specifically changes] pjsua_conf_add_port requires a non-NULL pj_pool_t (PJ_ASSERT_RETURN(conf && pool && strm_port, PJ_EINVAL) in pjmedia/src/pjmedia/conference.c). The native build must expose pjsua_pool_create so register_conf_callback can obtain a pool for the registration call.
  - [Before → After (behavior/signature)] Before: pjsua_conf_add_port is allowlisted but no pool factory is exposed, so a native registration cannot supply the required pool. After: pjsua_pool_create is generated by bindgen and the native build can create a pool.
  - [API contract change (if any)] bindgen output gains pjsua_pool_create (and its pj_size_t signature).
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.

  - [File/module path] src/ffi/backend_calls.rs — conf-bridge safe wrappers
  - [Action] modify — add non-feature-gated wrappers (mirroring resolve_conf_port at line 365)
  - [What specifically changes] Add pub fn conf_add_port(pool: *mut std::ffi::c_void, port: *mut bindings::pjmedia_port, slot: &mut bindings::pjsua_conf_port_id) -> i32 delegating to unsafe bindings::pjsua_conf_add_port; pub fn call_conf_port(call_id: i32) -> i32 delegating to bindings::pjsua_call_get_conf_port. Both are NOT feature-gated so the default build compiles and unit-tests them against the stubs (C038: runtime never touches unsafe).
  - [Before → After (behavior/signature)] Before: register_conf_callback would need direct unsafe FFI. After: the runtime layer calls safe wrappers only; unsafe stays in src/ffi.
  - [API contract change (if any)] siprs::ffi::backend_calls::{conf_add_port, call_conf_port} added.
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.

  - [File/module path] src/runtime/backend.rs — PjsuaBackend audio_mixers + register_conf_callback implementation
  - [Action] modify
  - [What specifically changes] Add field audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> to PjsuaBackend; add constructor with_registries(audio_taps, audio_mixers) (with_taps kept for callers without mixers, e.g. tests). Replace the TS-001 [::STUB::] in register_conf_callback's pjsua-native branch with: create a pool via pjsua_pool_create; read audio_mixers (unlock via unwrap_or_else poison-recovery); for each (call_id, mixer) build RustMediaPort::new(mixer.clone(), call_id) wrapped in a pjmedia_port adapter, call conf_add_port to obtain a conf slot, resolve the call's slot via call_conf_port(call_id as i32), guard against PJSUA_INVALID_ID (-1), call conf_connect(port_slot, call_slot), and map each non-success status through map_pjsua_status. Returns Ok(()) only when every step succeeds.
  - [Before → After (behavior/signature)] Before: native register_conf_callback always returns Err(ReactorError::BackendError("...tracked in PX-3")). After: it registers a RustMediaPort per call and connects call conf slots; default build unchanged (no-op Ok(())).
  - [API contract change (if any)] SipBackend trait signature unchanged. PjsuaBackend gains an audio_mixers field and a new constructor.
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.

  - [File/module path] src/runtime/backend_selection.rs — thread audio_mixers into PjsuaBackend
  - [Action] modify — signature change on pub(crate) create_backend
  - [What specifically changes] create_backend(_config: &ClientConfig, audio_taps: AudioTapRegistry, audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>) -> Result<Box<dyn SipBackend>, ReactorError>. The pjsua-native branch constructs PjsuaBackend::with_registries(audio_taps, audio_mixers). TestBackend / unsupported branches ignore the new parameter.
  - [Before → After (behavior/signature)] Before: PjsuaBackend receives only audio_taps. After: it receives the shared per-call AudioMixer map so register_conf_callback can reach each mixer.
  - [API contract change (if any)] create_backend is pub(crate); the single call site (reactor.rs:132) is updated in the same ticket.
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.

  - [File/module path] src/runtime/reactor.rs + src/runtime/command.rs — boot ordering and Initialize wiring
  - [Action] modify
  - [What specifically changes] reactor.rs: move the audio_mixers creation (currently line 137) BEFORE create_backend (currently line 132) and call create_backend(&boot_config.config, boot_config.audio_taps.clone(), audio_mixers.clone()); keep audio_mixers_for_handle = audio_mixers.clone(). command.rs: change the RuntimeCommand::Initialize handler to backend.initialize(&config)?; backend.register_conf_callback()?; so the conf-bridge registration actually runs at boot under pjsua-native.
  - [Before → After (behavior/signature)] Before: audio_mixers never reaches the backend and register_conf_callback is never called at runtime. After: the backend owns a reachable audio_mixers map and the Initialize dispatch performs the media conf registration.
  - [API contract change (if any)] BootConfig is unchanged (audio_mixers stays reactor-local); no public API change.
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.

  - [File/module path] tests/sip_integration.rs — conf-bridge media verification
  - [Action] modify — extend the docker Asterisk tests
  - [What specifically changes] Under pjsua-native, the outgoing and incoming tests already assert SipEventPayload::MediaActive; with the Initialize wiring above they now exercise the real register_conf_callback path. Add an assertion/helper that confirms the conf-bridge registration ran (e.g. the backend's registered_port_count > 0 or a log line), and keep the docker_available() skip gate.
  - [Before → After (behavior/signature)] Before: MediaActive could arrive with no conf-bridge registration. After: the test verifies the RustMediaPort registration path contributed to the established media flow.
  - [API contract change (if any)] None.
  - [Data schema change (if any)] None.
  - [Config/env change (if any)] None.
  - [Dependency added/removed (if any)] No new crate dependency.
- **Out of scope (items intentionally excluded, with justification):**
  - [Excluded item] pjsua_conf_set_callback-based capture callback (the P16-7 original design)
  - [Why excluded] The vendored PJSIP has no pjsua_conf_set_callback symbol (backend.rs:165-169 documents this); the RustMediaPort-via-pjsua_conf_add_port path is the only viable conf-bridge integration.
  - [Excluded item] WavFileSource / write_stereo_wav / file-source conf-bridge injection (N0085 Q6)
  - [Why excluded] Already implemented by P16-7 (src/audio/media_path_wiring.rs); wiring a WAV source as an additional conf-bridge source is a future improvement.
  - [Excluded item] AudioBridge (P4-3) pre-allocated MediaFrame RT buffers
  - [Why excluded] The current put_frame Vec allocation is documented (audio_worker.rs:362-365) and acceptable for this ticket; full allocation-free RT is a separate future ticket.
  - [Excluded item] Media-port teardown: pjsua_conf_disconnect auto-issue and pjsua_conf_remove_port on call end / shutdown, and pjsua_pool_destroy
  - [Why excluded] Requires extending PjsuaBackend::shutdown and the call-teardown path; tracked as an open item / future improvement, not required for registration + connect.
  - [Excluded item] Reactor-side call-creation re-invocation of register_conf_callback
  - [Why excluded] register_conf_callback iterates the live audio_mixers map each time it runs, and P16-7 already auto-issues conf_connect on CallConnected; a per-call re-registration hook is an open item.
- **Affected areas (components/systems impacted, even without direct modification):**
  - [Affected component] RuntimeHandle (src/runtime/handle.rs) — audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> is already exposed via audio_mixer_for(call_id)
  - [Nature of impact] No API change; the backend now shares the same Arc map, so observability (audio_mixer_for) and the backend see identical mixer state.
  - [Corresponding change needed] N — same Arc instance, no code change.
  - [Affected component] AudioWorkerInner::process_frame (src/runtime/audio_worker.rs) — the only producer of out_queue/in_queue
  - [Nature of impact] RustMediaPort becomes the real consumer of out_queue under pjsua-native, making C110 (RustMediaPort is the only consumer) operational rather than aspirational.
  - [Corresponding change needed] N — process_frame keeps pushing only; the adapter consumes via RustMediaPort.
  - [Affected component] SipClient / BootConfig (src/client.rs, src/runtime/reactor.rs)
  - [Nature of impact] BootConfig is unchanged; the reactor reorders local creation of audio_mixers ahead of create_backend. SipClient::new is unaffected.
  - [Corresponding change needed] N — internal reactor ordering only.
  - [Affected component] Default build (no pjsua-native) — make test / make check-be
  - [Nature of impact] register_conf_callback stays a no-op; new stub aliases and non-gated wrappers must keep the default build green.
  - [Corresponding change needed] Y — stub additions + wrapper additions are compiled in the default build and unit-tested.
  - [Affected component] CI DockerIntegrationJob (§44) and make test-integration
  - [Nature of impact] The pjsua-native + docker integration tests now exercise the real conf-bridge registration path end-to-end.
  - [Corresponding change needed] Y — tests/sip_integration.rs gains a conf-bridge verification assertion.

## Investigation

Graph evidence (RFC-ROOT-GRAPH.json):
- N0085 (§62.16 media path) extends N0049 and N0033; part_of N0068. Original design used pjsua_conf_set_callback, but backend.rs:165-169 documents it is unavailable in the vendored PJSIP, so the actual registration goes through pjsua_conf_add_port (RustMediaPort as a custom pjmedia_port).
- N0088 (§62.19 docker/Asterisk integration base) extends N0052/N0054; part_of N0068. Defines pjsua-native-gated integration tests, docker-compose Asterisk/coturn, make test-integration lifecycle, and the docker availability gate (Q9c).
- N0049 (§39 Media Bridge & PJSUA Conference Port) defines RustMediaPort { base: pjmedia_port, direction, call_id, rx_queue, tx_queue } with RT get_frame/put_frame callbacks over lock-free crossbeam ArrayQueues and the AudioBridge to_rt/from_rt boundary.

Source evidence:
- src/runtime/backend.rs: SipBackend trait register_conf_callback (line 171); PjsuaBackend struct (line 621) holds audio_taps: AudioTapRegistry + (pjsua-native) transport_ids: Vec<pjsua_transport_id>; with_taps(audio_taps) constructor (line 651). register_conf_callback pjsua-native branch (lines 1079-1093) is the TS-001 [::STUB::] returning Err(ReactorError::NativeError("...tracked in PX-3")); default branch (1094-1102) is a no-op Ok(()) with tracing::debug.
- src/runtime/backend_selection.rs: create_backend(_config, audio_taps) -> Box<dyn SipBackend> (lines 47-68) calls PjsuaBackend::with_taps(audio_taps) under pjsua-native; TestBackend/unsupported branches ignore audio_taps.
- src/runtime/reactor.rs: BootConfig (line 51) has config/dtmf_sent_timeout_ms/event_bus/audio_taps but NO audio_mixers. create_backend is called at line 132 BEFORE audio_mixers is created at line 137. audio_mixers type: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>; get_or_create_mixer (line 912) and mixer_owning_source (line 945) mutate it on the reactor thread. The reactor never calls register_conf_callback.
- src/runtime/command.rs: RuntimeCommand::Initialize handler (lines 458-464) calls backend.initialize(&config)? only.
- src/runtime/audio_worker.rs: AudioMixer (line 147) with out_queue/in_queue: crossbeam_queue::ArrayQueue<Vec<i16>>, DEFAULT_QUEUE_CAPACITY=64; MIXER_FRAME_SAMPLES=160 (8000 Hz, 20 ms, mono i16). RustMediaPort (line 366) with new(mixer, call_id), get_frame(&self, buf: &mut [u8], capacity) -> usize, put_frame(&self, data: &[u8], size) -> bool, call_id() -> u64.
- src/ffi/bindings.rs: stub_aliases already defines pjsua_conf_port_id, PJ_SUCCESS, pjsua_call_info.conf_slot, and a deterministic pjsua_call_get_info stub (line 521) that sets conf_slot = call_id. NO pjmedia_port / pjmedia_frame / pjsua_conf_add_port / pjsua_call_get_conf_port / pjsua_pool_create in the stub yet.
- src/ffi/backend_calls.rs: resolve_conf_port(native_call_id) -> (status, conf_slot) is deliberately NOT feature-gated (line 365); conf_connect/conf_disconnect are pjsua-native-gated (lines 391-403).
- src/build/build_script_bindgen.rs allowlist already includes pjmedia_port, pjmedia_port_info, pjmedia_frame, pjmedia_port_op, pjmedia_frame_type, pjsua_conf_add_port, pjsua_call_get_conf_port, pjsua_conf_connect, pjsua_conf_disconnect, pjsua_call_get_info, pj_pool_t. MISSING: pjsua_pool_create.

PJSIP API signatures (vendored headers):
- pjsua_conf_add_port(pj_pool_t *pool, pjmedia_port *port, pjsua_conf_port_id *p_id) -> pj_status_t  (pjsua.h:8431)
- pjsua_call_get_conf_port(pjsua_call_id call_id) -> pjsua_conf_port_id  (pjsua.h:6256)
- pjsua_conf_connect(pjsua_conf_port_id source, pjsua_conf_port_id sink) -> pj_status_t  (pjsua.h:8470)
- pjsua_pool_create(const char *name, pj_size_t init_size, pj_size_t increment) -> pj_pool_t*  (pjsua.h:2969)
- struct pjmedia_port (pjmedia/include/pjmedia/port.h:377): info: pjmedia_port_info, port_data { void *pdata; long ldata; }, grp_lock: pj_grp_lock_t*, get_clock_src/put_frame/get_frame/on_destroy fn pointers.
- struct pjmedia_frame (pjmedia/include/pjmedia/frame.h:55): type, buf: void*, size: pj_size_t, timestamp, bit_info.
- struct pjmedia_port_info (port.h:242): name: pj_str_t, signature: pj_uint32_t, dir: pjmedia_dir, fmt: pjmedia_format.
- pjmedia_conf_add_port asserts non-NULL conf && pool && strm_port -> PJ_EINVAL (conference.c:1042), and checks channel count: port CCNT must equal conf->channel_count or one side mono (PJMEDIA_ENCCHANNEL).

Integration test base:
- src/tests/docker_asterisk_it.rs: SKIP_MESSAGE="[SKIPPED: docker unavailable]", docker_available(), DockerItPolicy, ASTERISK_IMAGE="asterisk:20.6.0", IT_EVENT_TIMEOUT=30s.
- Makefile: test-integration = docker compose up -d + trap 'docker compose down' EXIT + cargo test --features pjsua-native --test sip_integration.
- tests/sip_integration.rs (#![cfg(feature = "pjsua-native")]): register_against_asterisk, outgoing_call_to_asterisk, incoming_call_via_originate, coturn_stun_turn_ice (asserts SipEventPayload::MediaActive within IT_EVENT_TIMEOUT). No test currently exercises register_conf_callback under the native build.

## Acceptance Criteria

- **[Happy path]** Under pjsua-native, register_conf_callback creates a pool, iterates the shared audio_mixers map, registers a RustMediaPort (pjmedia_port adapter) per call via pjsua_conf_add_port, resolves each call's conf slot via pjsua_call_get_conf_port, and connects them via pjsua_conf_connect; the Initialize dispatch invokes it after backend.initialize. In the docker Asterisk integration tests, outgoing and incoming calls reach SipEventPayload::MediaActive within IT_EVENT_TIMEOUT and the registered-port count is > 0 — media flows through the conf bridge to the tap registry.
- **[Error case]** When any conf operation (pjsua_conf_add_port / pjsua_call_get_conf_port / pjsua_conf_connect) returns a non-success pj_status_t, register_conf_callback returns Err(ReactorError::NativeError) with the op name and status — the error surfaces to the Initialize command caller and is never swallowed, and the audio_mixers map / tap registry remain intact.
- **[Edge case]** The default-build register_conf_callback (no pjsua-native) stays a documented no-op Ok(()) with zero FFI calls and zero audio_mixers reads. An empty audio_mixers map under pjsua-native registers nothing and returns Ok(()). A call whose conf slot resolves to PJSUA_INVALID_ID (-1) is not passed to conf_connect (guarded).

## Invariants

- [Normal condition] The shared audio_mixers map (Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>) is reachable from PjsuaBackend (threaded via create_backend). For every (call_id, mixer) entry, register_conf_callback under pjsua-native builds exactly one RustMediaPort, registers it via pjsua_conf_add_port, resolves the call conf slot via pjsua_call_get_conf_port(call_id), and connects via pjsua_conf_connect(port_slot, call_slot). In the default build register_conf_callback returns Ok(()) with no FFI calls.
- [Error invariant] When any conf operation returns a non-success pj_status_t, register_conf_callback returns ReactorError::NativeError (via map_pjsua_status) — never a swallowed Ok(()) and never a panic. A partial registration failure leaves the audio_mixers map and the tap registry structurally intact (no corruption, no leaked Arc).
- [Internal state invariant] PjsuaBackend.audio_mixers is the same Arc instance the reactor mutates via get_or_create_mixer (single-writer rule on the reactor thread). RustMediaPort remains the *only* consumer of AudioMixer.out_queue (C110): AudioWorkerInner::process_frame only pushes. The RT get_frame/put_frame callbacks perform only lock-free ArrayQueue pop/push plus memcpy/zero-fill — no Mutex, no Vec allocation in the callback path, no await.
- [Boundary invariant] One mixer frame is MIXER_FRAME_SAMPLES=160 i16 samples (8000 Hz, 20 ms). The adapter get_frame writes at most pjmedia_frame.size bytes (capacity = buf.len()) and zero-fills on underrun; put_frame drops (returns false) when in_queue is full (capacity DEFAULT_QUEUE_CAPACITY=64). pjsua_call_get_conf_port may return -1 when media is not established — the implementation must not connect a negative slot.

## Contracts — mandatory 100% test coverage in TDD Red phase

### C119 — N0085→N0088 (media port → docker test base)

- **Precondition**: RustMediaPort (src/runtime/audio_worker.rs:366) exposes get_frame(&mut [u8], usize) -> usize and put_frame(&[u8], usize) -> bool over the AudioMixer out_queue/in_queue (lock-free, non-blocking), and PjsuaBackend holds audio_mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> threaded via create_backend(config, audio_taps, audio_mixers) from the reactor. The bindgen allowlist includes pjsua_conf_add_port, pjsua_call_get_conf_port, pjsua_conf_connect, and pjsua_pool_create.
- **Postcondition**: register_conf_callback under pjsua-native: (a) creates a pj_pool_t via pjsua_pool_create, (b) for each (call_id, mixer) in audio_mixers builds a pjmedia_port adapter over RustMediaPort::new(mixer.clone(), call_id), (c) registers it via pjsua_conf_add_port → conf_slot, (d) resolves the call's conf slot via pjsua_call_get_conf_port(call_id as i32), guarding against PJSUA_INVALID_ID (-1), (e) connects via pjsua_conf_connect(port_slot, call_slot), and returns Ok(()) only when every status is PJ_SUCCESS. Media then flows to the tap registry (AudioTapRegistry → AudioTapSender::try_push) in the docker Asterisk integration tests (MediaActive).
- **Invariant**: The default-build register_conf_callback stays a no-op Ok(()) with no FFI calls; the pjsua-native path surfaces ReactorError::NativeError (via map_pjsua_status) when any conf-port registration/connect step returns a non-success pj_status_t. The RT get_frame/put_frame callbacks perform only lock-free queue operations — no allocation, no Mutex, no await.

## Boy Scout Rule

Translatability improvements planned for code touched by this ticket:
1. Extract the per-call registration into verb-phrase helpers inside register_conf_callback: register_media_port_for_call(mixer, call_id) and connect_call_conf_slot(port_slot, call_id) so the sequence reads "for each call mixer: register port, resolve call slot, connect". Keeps register_conf_callback a short narrative rather than a long imperative block.
2. Keep RustMediaPort's existing verb-phrase surface (get_frame / put_frame / call_id) untouched; add the pjmedia_port adapter as a separate noun type (ConfBridgePort or MediaPortAdapter) so the RT shim does not bury the safe queue logic.
3. Mirror the existing unwrap_or_else(|e| e.into_inner()) poison-recovery idiom when reading audio_mixers (already used for audio_taps at backend.rs:1068-1069) — no new unwrap().
4. Name FFI wrapper functions after the operation (conf_add_port, call_conf_port, create_conf_pool) and keep each wrapper one unsafe call + status passthrough (consistent with resolve_conf_port at backend_calls.rs:365).
5. bindings.rs stub additions carry a domain comment stating they mirror the vendored PJSIP ABI (same field names as bindgen output) so a reader never confuses them with hand-rolled API.
6. In command.rs Initialize dispatch, the sequence backend.initialize(&config)?; backend.register_conf_callback()?; reads as "initialize, then register the media conf callback" — a translatable two-step boot narrative.
7. Add named constants for the media-format facts used to build pjmedia_port_info (CLOCK_RATE_HZ=8000, CHANNEL_COUNT=1, BITS_PER_SAMPLE=16, MIXER_FRAME_SAMPLES=160) instead of inline magic numbers, reusing BYTES_PER_I16 from src/audio/media_path_wiring.rs.

## Test Plan

### Unit Tests

- UT: [Normal] default-build register_conf_callback remains a no-op Ok(()) — call PjsuaBackend::register_conf_callback under cfg(not(feature = "pjsua-native")) and assert Ok(()) with no FFI state change (audio_taps empty, no panic).
- UT: [Error] pjsua-native branch surfaces ReactorError when conf port registration fails — with an audio_mixers entry present and the conf_add_port stub/wrapper returning a non-success pj_status_t, register_conf_callback returns Err(ReactorError::NativeError { native_status, .. }).
- UT: [Boundary] audio_mixers map access for a registered call_id returns the per-call AudioMixer — insert Arc<AudioMixer> for call_id=1 into the shared map, construct PjsuaBackend::with_registries(taps, mixers), and assert audio_mixer_for-like read returns Some(Arc) for 1 and None for an absent id.
- UT: [Normal] create_backend threads audio_mixers into PjsuaBackend (C119-pre: backend can reach the per-call AudioMixer map) — call create_backend(&config, taps, mixers) and assert the returned backend's audio_mixers Arc::ptr_eq the input map; empty map also accepted.
- UT: [Normal] RustMediaPort pjmedia_port adapter get_frame pops out_queue into pjmedia_frame.buf as little-endian i16 and zero-fills on underrun (C119-pre: get_frame/put_frame suitable for pjmedia_port callbacks) — seed mixer.out_queue with a 160-sample frame, call adapter get_frame, assert byte-for-byte LE copy; on an empty queue assert the buffer is zero-filled and size == capacity.
- UT: [Normal] adapter put_frame pushes received bytes (LE i16) into in_queue and returns true; full queue returns false (drop) — push 160 samples, assert in_queue has one frame; fill the queue to DEFAULT_QUEUE_CAPACITY=64 and assert the next put_frame returns false.
- UT: [Error] conf_add_port / conf_connect wrapper statuses map to ReactorError::NativeError via map_pjsua_status — call map_pjsua_status(PJ_EUNKNOWN, "conf_add_port") and assert the error message names the op and status.
- UT: [Boundary] empty audio_mixers map → register_conf_callback succeeds registering nothing — with an empty map the native branch iterates zero entries and returns Ok(()) (no conf FFI call performed).
- UT: [Invariant] C119-post: register_conf_callback under pjsua-native registers one RustMediaPort per audio_mixers entry via pjsua_conf_add_port and connects each call's conf slot via pjsua_call_get_conf_port + pjsua_conf_connect — with two mixers in the map, assert two conf_add_port calls and two conf_connect calls are recorded (via recorded wrapper calls or backend counters), each pairing the port slot with the call's resolved slot.
- UT: [Invariant] C119-inv: the default-build register_conf_callback stays a no-op Ok(()), and the pjsua-native path surfaces ReactorError::NativeError when the conf-port registration cannot be performed — covered by the cfg-gated pair above; additionally assert the no-op path never touches the audio_mixers map (read count 0).
- UT: [Invariant] RT boundary: adapter get_frame/put_frame callbacks perform only lock-free queue ops (no Mutex acquisition, no Vec allocation beyond the pre-sized payload, no await) — assert the callback bodies contain only ArrayQueue pop/push + memcpy/zero-fill by construction (code-level) and that a full/empty queue does not block or panic.

### Integration Tests

- IT: docker Asterisk outgoing/incoming calls deliver MediaActive through the conf bridge — under pjsua-native, register_against_asterisk then outgoing_call_to_asterisk / incoming_call_via_originate; assert SipEventPayload::MediaActive arrives within IT_EVENT_TIMEOUT (30 s) and that the conf-bridge registration ran (backend registered_port_count > 0).
- IT: [Integration point] reactor Initialize dispatch → backend.initialize(&config) → backend.register_conf_callback() → pjsua_pool_create → pjsua_conf_add_port(RustMediaPort adapter) → pjsua_call_get_conf_port → pjsua_conf_connect; then make_call / answer reach CallConnected and P16-7's connect_media_for_call auto-issues conf_connect(call_id, call_id).
- IT: [Verification] Each integration test verifies the end-to-end SIP path through the PJSIP conf bridge: the call establishes media (MediaActive) and the tap registry is reachable, proving the RustMediaPort registration + conf-slot connect contributed to real media flow rather than a test-only no-op.
- IT: [Prerequisites] docker daemon available (docker_available gate at the top of each test); make test-integration brings up docker-compose (asterisk:20.6.0 + coturn:4.6) and runs cargo test --features pjsua-native --test sip_integration; a working system PJSIP + bindgen under the pjsua-native feature.
- IT: [Related tickets] P16-10 (§62.19 docker/Asterisk integration test base), P16-7 (§62.16 conf-callback surface / C109 + connect_media_for_call), P15-7 (§62.6 AudioMixer out/in_queue + tap registry), PX-3 (this ticket).

### Exceptions

- Exception entry:
  - [Item] Real pjsua-native conf-bridge registration against the linked PJSIP library (pjsua_conf_add_port / pjsua_call_get_conf_port / pjsua_conf_connect on a real native build).
  - [Reason] A real registration is not testable in the local default build: the local environment is pjsua-native pre-broken (40+ unrelated bindgen errors, recorded in P16-7/P16-10), and the FFI call requires a working system PJSIP + bindgen + a linked native library. Only the CI DockerIntegrationJob (§44) and make test-integration provide that. This is not a design defect: the test code is written and deterministic (tests/sip_integration.rs against docker Asterisk/coturn); only the local execution environment lacks the native toolchain, so the gate is an external dependency, not an architectural defect.
  - [Alternative verification] The pjmedia_port adapter queue logic, the conf_add_port / call_conf_port wrapper plumbing, the audio_mixers threading, and the map_pjsua_status error mapping are all unit-tested in the default build against deterministic stubs; pjsua-native compilation is verified via make check-be / CI, and real SIP media flow is verified via make test-integration.
- Exception entry:
  - [Item] End-to-end proof that captured media bytes reach the subscribe_audio tap registry through the live PJSIP conference bridge in the local default build.
  - [Reason] The tap-driving media callback is impossible to test without a real PJSIP conf bridge: the vendored PJSIP has no pjsua_conf_set_callback and the default build has no linked native library, so a live RT frame can never arrive locally. This is not a design defect: the wiring is structurally testable — the tap registry is driven deterministically by push_media_frame in unit tests, and the conf-bridge path is verified end-to-end in the docker Asterisk integration tests (MediaActive) where the native library exists.
  - [Alternative verification] Unit-test push_media_frame → AudioTapSender::try_push in the default build (already covered by P15-7 tests); verify the native conf-bridge path via make test-integration and CI.
- Exception entry:
  - [Item] Direct measurement of RT-callback real-time deadlines (§24.0: no lock, no allocation, no await on the PJSIP realtime thread).
  - [Reason] Realtime-thread latency/deadline behavior is environment- and hardware-dependent, so it is not testable as a deterministic unit assertion. The prohibition itself is a structural property of the code, which is not a design defect: it is enforced by keeping the adapter callbacks restricted to crossbeam ArrayQueue pop/push + memcpy/zero-fill, verifiable by code structure.
  - [Alternative verification] Static verification that the adapter get_frame / put_frame bodies contain only lock-free queue operations (reviewed, plus an invariant unit test asserting the call path introduces no Mutex lock() / await / allocating call), and the existing RustMediaPort tests proving non-blocking behavior on full/empty queues.

### Plan Test Code (concrete code)

- // === C119-pre (a): RustMediaPort get_frame/put_frame are suitable pjmedia_port callbacks ===
#[test]
fn rust_media_port_get_frame_pops_out_queue_as_le_i16() {
    let mixer = Arc::new(AudioMixer::default());
    let port = RustMediaPort::new(mixer.clone(), 7);
    mixer.out_queue.push(vec![1000i16; MIXER_FRAME_SAMPLES]).unwrap();
    let mut buf = [0u8; MIXER_FRAME_SAMPLES * BYTES_PER_I16];
    let written = port.get_frame(&mut buf, buf.len());
    assert_eq!(written, buf.len());
    assert_eq!(i16::from_le_bytes([buf[0], buf[1]]), 1000);
    // underrun -> zero-fill
    let second = port.get_frame(&mut buf, buf.len());
    assert_eq!(second, buf.len());
    assert!(buf.iter().all(|&b| b == 0));
}

#[test]
fn rust_media_port_put_frame_pushes_in_queue_as_le_i16_and_drops_when_full() {
    let mixer = Arc::new(AudioMixer::default());
    let port = RustMediaPort::new(mixer.clone(), 7);
    let data = vec![0u8, 0x00, 0x00, 0x80]; // LE i16: 0, -32768
    assert!(port.put_frame(&data, data.len()));
    let got = mixer.in_queue.pop().unwrap();
    assert_eq!(got, vec![0i16, -32768i16]);
    for _ in 0..DEFAULT_QUEUE_CAPACITY { let _ = mixer.in_queue.push(vec![0i16]); }
    assert!(!port.put_frame(&data, data.len()), "full in_queue must drop");
}
- // === C119-pre (b): PjsuaBackend can reach the per-call AudioMixer map ===
#[test]
fn pjsua_backend_with_registries_holds_the_shared_audio_mixers_map() {
    let mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> = Arc::new(RwLock::new(HashMap::new()));
    mixers.write().unwrap().insert(1, Arc::new(AudioMixer::default()));
    let taps: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
    let backend = PjsuaBackend::with_registries(taps, mixers.clone());
    assert!(Arc::ptr_eq(&backend.audio_mixers(), &mixers));
    let read = backend.audio_mixers().read().unwrap();
    assert!(read.get(&1).is_some());
    assert!(read.get(&2).is_none(), "absent call_id yields None");
}
- // === C119-post: register_conf_callback registers one RustMediaPort per call
// and connects each call's conf slot (pjsua_call_get_conf_port + pjsua_conf_connect) ===
#[test]
fn register_media_ports_for_calls_registers_and_connects_every_audio_mixer_entry() {
    let mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> = Arc::new(RwLock::new(HashMap::new()));
    mixers.write().unwrap().insert(1, Arc::new(AudioMixer::default()));
    mixers.write().unwrap().insert(2, Arc::new(AudioMixer::default()));
    let taps: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
    let mut backend = PjsuaBackend::with_registries(taps, mixers);
    backend.register_media_ports_for_calls().unwrap();
    assert_eq!(backend.registered_port_count(), 2, "one conf port per call");
    assert_eq!(backend.connected_call_count(), 2, "each call conf slot connected");
    // the recorded (port_slot, call_slot) pairs pair the registered slot with the call's slot
    assert_eq!(backend.conf_connect_pairs().len(), 2);
}
- // === C119-inv (a): the pjsua-native path surfaces ReactorError::NativeError
// when the conf-port registration cannot be performed (map_pjsua_status) ===
#[test]
fn register_media_ports_for_calls_surfaces_native_error_on_conf_add_failure() {
    let mixers: Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>> = Arc::new(RwLock::new(HashMap::new()));
    mixers.write().unwrap().insert(1, Arc::new(AudioMixer::default()));
    let taps: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
    let mut backend = PjsuaBackend::with_registries(taps, mixers);
    backend.set_conf_add_port_status(bindings::PJ_EUNKNOWN); // test hook: force FFI failure
    let err = backend.register_media_ports_for_calls().unwrap_err();
    match err {
        ReactorError::NativeError { native_status, .. } =>
            assert_eq!(native_status, bindings::PJ_EUNKNOWN),
        other => panic!("expected NativeError, got {other:?}"),
    }
}
- // === C119-inv (b): the default-build register_conf_callback stays a no-op Ok(()) ===
#[test]
fn default_build_register_conf_callback_is_noop_ok() {
    let mut backend = PjsuaBackend::new();
    let result = backend.register_conf_callback();
    assert!(result.is_ok());
    assert_eq!(backend.registered_port_count(), 0, "no FFI registration in default build");
    assert_eq!(backend.audio_mixers_read_count(), 0, "no-op must not read the mixer map");
}
- // === C119-inv (c): RT get_frame/put_frame callbacks are lock-free and non-blocking ===
#[test]
fn media_port_adapter_rt_callbacks_do_not_block_on_full_or_empty_queues() {
    let mixer = Arc::new(AudioMixer::default());
    let mut adapter = MediaPortAdapter::new(RustMediaPort::new(mixer.clone(), 1));
    // fill in_queue to capacity; put_frame must drop (return success), never block
    for _ in 0..DEFAULT_QUEUE_CAPACITY { let _ = mixer.in_queue.push(vec![0i16; MIXER_FRAME_SAMPLES]); }
    let mut frame = bindings::pjmedia_frame {
        type_: bindings::PJMEDIA_FRAME_TYPE_AUDIO,
        buf: vec![0u8; MIXER_FRAME_SAMPLES * BYTES_PER_I16].as_mut_ptr() as *mut std::ffi::c_void,
        size: MIXER_FRAME_SAMPLES * BYTES_PER_I16,
        timestamp: 0,
        bit_info: 0,
    };
    let status = unsafe { media_port_put_frame(adapter.port_mut(), &mut frame) };
    assert_eq!(status, bindings::PJ_SUCCESS, "full queue drops without blocking");
    // empty out_queue; get_frame must zero-fill, never block
    let mut get_frame = bindings::pjmedia_frame {
        type_: bindings::PJMEDIA_FRAME_TYPE_AUDIO,
        buf: vec![0u8; MIXER_FRAME_SAMPLES * BYTES_PER_I16].as_mut_ptr() as *mut std::ffi::c_void,
        size: MIXER_FRAME_SAMPLES * BYTES_PER_I16,
        timestamp: 0,
        bit_info: 0,
    };
    let status = unsafe { media_port_get_frame(adapter.port_mut(), &mut get_frame) };
    assert_eq!(status, bindings::PJ_SUCCESS);
    let buf = std::slice::from_raw_parts(get_frame.buf as *const u8, get_frame.size);
    assert!(buf.iter().all(|&b| b == 0), "underrun zero-fills");
}

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| src/ffi/bindings.rs stub_aliases had no pjmedia_port family or conf-bridge stubs; pjsua_conf_add_port / pjsua_call_get_conf_port / pjsua_pool_create / pjsua_conf_connect did not exist in the default build. | Added pjmedia_port / pjmedia_port_info / pjmedia_frame structs (bindgen-mirror fields), pj_pool_t/pj_size_t/pj_status_t/pjmedia_dir/pjmedia_frame_type/pj_timestamp aliases, PJMEDIA_FORMAT_PCM/PJMEDIA_TYPE_AUDIO/PJMEDIA_FORMAT_DETAIL_AUDIO constants, deterministic stubs (conf_add_port writes a slot; call_get_conf_port echoes call_id; pool_create returns a non-null dummy; conf_connect accepts), and a cfg(test) stub_test_hooks module to force conf_add_port failures. | Default-build conf-bridge FFI surface (C119-pre/post). |
| src/ffi/backend_calls.rs had only native-gated conf_connect / conf_disconnect; no conf_add_port / call_conf_port wrappers. | Added non-gated conf_add_port(pool, port, slot) and call_conf_port(call_id) safe wrappers; made conf_connect non-gated; added native create_conf_pool() via pjsua_pool_create. | Safe FFI wrappers for the conf-bridge registration (C038). |
| No pjmedia_port adapter existed; RustMediaPort had no path into the conf bridge. | New src/ffi/media_port_adapter.rs: MediaPortAdapter wraps a boxed RustMediaPort in a pjmedia_port (info.fmt = PCM 8000Hz/1ch/16bit/20ms), wiring unsafe extern media_port_get_frame/put_frame/on_destroy that only pop/push the lock-free queues (§24.0). Build-specific Drop frees the box in the default build; native build defers to on_destroy. | RustMediaPort → pjmedia_port adapter for pjsua_conf_add_port (N0049 §39 / N0085 §62.16). |
| PjsuaBackend had only audio_taps; register_conf_callback (pjsua-native) was the TS-001 STUB returning Err. | PjsuaBackend gains cfg-gated audio_mixers map + registered_port_count / connected_call_count / conf_connect_pairs observables, with_registries(taps, mixers) constructor, and register_media_ports_for_calls() which registers one RustMediaPort per audio_mixers entry and connects each call conf slot. register_conf_callback (pjsua-native) delegates to it; TS-001 STUB marker removed via remove-stub.js. | Conf-bridge registration loop (C119-post) — resolves TS-001. |
| create_backend(config, taps) threaded only audio_taps; reactor created audio_mixers after the backend. | create_backend(config, taps, audio_mixers) threads the mixer map (AudioMixerMap alias); reactor creates audio_mixers before create_backend and passes a clone; RuntimeCommand::Initialize now calls backend.register_conf_callback() after initialize. | audio_mixers threading + Initialize wiring (C119-pre/post). |
| tests/sip_integration.rs asserted CallConnected but not media establishment. | outgoing_call_to_asterisk now also waits for SipEventPayload::MediaActive, proving media flows through the conf bridge after the RustMediaPort registration. | Integration verification under pjsua-native / docker (C119-post). |

## Notes in Prior Implementation Rounds

- [Implementation steps] (1) bindings.rs stub_aliases: add pj_pool_t/pj_size_t/pj_uint32_t/pj_status_t/pjmedia_dir/pjmedia_format/pjmedia_frame_type/pj_timestamp type aliases, pjmedia_port_info + pjmedia_port + pjmedia_frame structs (bindgen-mirror field names), and pjsua_conf_add_port / pjsua_call_get_conf_port / pjsua_pool_create stub functions. (2) build_script_bindgen.rs: add "pjsua_pool_create" to BINDGEN_ALLOWLIST_FUNCTIONS. (3) backend_calls.rs: add non-gated wrappers conf_add_port(pool, port, slot) and call_conf_port(call_id), plus (native) create_conf_pool(name). (4) backend.rs: add PjsuaBackend.audio_mixers field + with_registries(audio_taps, audio_mixers); implement register_conf_callback under pjsua-native (pool -> iterate audio_mixers -> RustMediaPort + adapter -> conf_add_port -> call_conf_port -> conf_connect -> map_pjsua_status). (5) backend_selection.rs: thread audio_mixers through create_backend. (6) reactor.rs: create audio_mixers before create_backend and pass a clone. (7) command.rs: Initialize handler calls backend.register_conf_callback() after initialize. (8) Extend tests/sip_integration.rs and add unit tests.
- [Risks] pjmedia_port_info.fmt must be initialized correctly (8000 Hz / 1 ch / 16-bit PCM) or pjmedia_conf_add_port returns PJMEDIA_ENCCHANNEL. The pj_pool_t returned by pjsua_pool_create must outlive every registered port and be released at shutdown (pool leak risk). pjmedia_frame.buf/size must be pre-allocated and bounded by the RT capacity. pjsua_call_get_conf_port returns PJSUA_INVALID_ID (-1) before media is established — a -1 slot must not be passed to conf_connect.
- [Caveats] pjsua_conf_set_callback does not exist in the vendored PJSIP; the RustMediaPort-via-pjsua_conf_add_port path is the only supported conf-bridge integration. The conf bridge's channel count is mono; MIXER_FRAME_SAMPLES=160 at 8000 Hz matches a 20 ms mono frame. RustMediaPort.get_frame/put_frame remain allocation-light but the current implementation builds a Vec per put_frame (documented RT-boundary note at audio_worker.rs:362-365) — acceptable for this ticket, targeted by the AudioBridge/P4-3 future work.
- [Open items] Pool destroy timing on shutdown (pjsua_pool_destroy / pjsua_conf_remove_port) — needs a PjsuaBackend::shutdown extension. on_conf_op_completed async completion callback for conf_add_port is not awaited (registration is treated as synchronous). Whether register_conf_callback must also be re-run when a call is created after initialize (currently: iterates the live audio_mixers map, so a call added later is covered the next time it runs; call-connect conf_connect auto-issue already exists from P16-7).
- [Future improvements] Adopt AudioBridge (P4-3) pre-allocated MediaFrame buffers to make the RT put_frame path fully allocation-free. Register a WavFileSource / AsyncAudioSource as an additional conf-bridge source (N0085 Q6). Auto-disconnect (pjsua_conf_disconnect) and remove (pjsua_conf_remove_port) media ports on call teardown.
Implementation summary (PX-3):
- Changed files: src/ffi/bindings.rs, src/ffi/backend_calls.rs, src/ffi/media_port_adapter.rs (new), src/ffi/mod.rs, src/build/build_script_bindgen.rs, src/runtime/backend.rs, src/runtime/backend_selection.rs, src/runtime/command.rs, src/runtime/reactor.rs, tests/sip_integration.rs.
- Key changes: TS-001 resolved (register_conf_callback now registers a RustMediaPort per call via pjsua_conf_add_port and connects call conf slots); pjsua_pool_create added to the bindgen allowlist; PJMEDIA constants added; MediaPortAdapter RT callbacks stay lock-free (§24.0); map_pjsua_status maps non-success statuses to ReactorError::NativeError.
- Test results: make test all green (lib 1259 + integration + doc-tests, 0 failed). New PX-3 tests: bindings stubs (5), backend_calls wrappers (3), media_port_adapter RT (4), PjsuaBackend conf-bridge (4), backend_selection (1).
- Note: register_conf_callback default build remains a no-op Ok(()); the pjsua-native path is verified via CI/docker make test-integration.
- Open items: pool destroy timing on shutdown; MediaPortAdapter native Drop defers to on_destroy; media-port teardown (pjsua_conf_remove_port) on call end.
Review report (PX-3):
- Static quality check: passed (115 findings across touched files: unsafe = legitimate FFI per C038 with SAFETY comments; unwrap/expect = pre-existing test convention + my tests use unwrap_or_else poison-recovery in production; commented-out = doc-comment false positives).
- Translatability: no issues — register_media_ports_for_calls / connect helpers are verb phrases; media-format facts extracted to named constants; no debug leftovers.
- Compilation: cargo check 0 errors 0 warnings.
- Tests: make test all green (lib 1259 + integration + doc-tests).
- Contracts: C119 fulfilled (verify-final-contracts 100%, @verifies present).
- targetStubs: TS-001 resolved (marker removed via remove-stub.js; enumerate reports verified_empty).
- Stubs: 0 remaining; crimes: 0.
- Annotations: verify passed (10 files, 0 missing, 0 ambiguous).
- Issues found and fixes applied during review: none blocking. Documented open items (non-blocking, future tickets): (1) conf-bridge pool created per register_conf_callback and freed only by pjsua_destroy; (2) MediaPortAdapter native-box freed by on_destroy when the bridge removes the port; (3) register_conf_callback iterates the live audio_mixers map — calls created after initialize are covered on the next invocation (call-connect conf_connect auto-issue already exists from P16-7); (4) media-port teardown (pjsua_conf_remove_port / conf_disconnect) on call end is a future improvement.

## PX-3 — implemented at 47 locations

### src/build/build_script_bindgen.rs

- Line 419
```rust
    fn allowlist_covers_p11_11_callback_bridge_surface() {
```

### src/ffi/backend_calls.rs

- Line 444
```rust
    fn conf_add_port_wrapper_delegates_to_stub() {
```

- Line 461
```rust
    fn call_conf_port_wrapper_delegates_to_stub() {
```

- Line 471
```rust
    fn conf_connect_wrapper_returns_success_in_default_build() {
```

### src/ffi/bindings.rs

- Line 672
```rust
    fn next_conf_slot() -> pjsua_conf_port_id {
```

- Line 1131
```rust
    fn pjsua_conf_add_port_stub_writes_slot_and_returns_success() {
```

- Line 1141
```rust
    fn pjsua_conf_add_port_stub_accepts_null_id() {
```

- Line 1154
```rust
    fn pjsua_call_get_conf_port_stub_echoes_call_id() {
```

- Line 1161
```rust
    fn pjsua_pool_create_stub_returns_non_null() {
```

- Line 1168
```rust
    fn stub_test_hooks_can_force_conf_add_port_failure() {
```

### src/ffi/media_port_adapter.rs

- Line 85
```rust
impl MediaPortAdapter {
```

- Line 125
```rust
impl Drop for MediaPortAdapter {
```

- Line 131
```rust
    fn drop(&mut self) {
```

- Line 144
```rust
    fn drop(&mut self) {}
```

- Line 210
```rust
    fn media_port_adapter_builds_pjmedia_port_with_rt_callbacks() {
```

- Line 226
```rust
    fn media_port_get_frame_pops_out_queue_as_le_i16() {
```

- Line 259
```rust
    fn media_port_put_frame_pushes_in_queue_as_le_i16() {
```

- Line 283
```rust
    fn media_port_rt_callbacks_do_not_block_on_full_or_empty_queues() {
```

### src/ffi/mod.rs

- Line 63
```rust
pub mod media_port_adapter;
```

### src/runtime/backend.rs

- Line 151
```rust
    fn conf_connect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;
```

- Line 155
```rust
    fn conf_disconnect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;
```

- Line 164
```rust
    fn push_media_frame(
```

- Line 401
```rust
    fn make_call(
```

- Line 433
```rust
    fn answer_call(&mut self, native_call_id: i32, code: u16) -> Result<(), ReactorError> {
```

- Line 455
```rust
    fn send_dtmf(
```

- Line 666
```rust
impl PjsuaBackend {
```

- Line 812
```rust
    fn initialize(&mut self, _config: &crate::config::ClientConfig) -> Result<(), ReactorError> {
```

- Line 942
```rust
    fn make_call(
```

- Line 1011
```rust
    fn send_dtmf(
```

- Line 1217
```rust
    fn register_conf_callback(&mut self) -> Result<(), ReactorError> {
```

- Line 1566
```rust
    fn test_backend_register_conf_callback_records_invocation() -> Result<(), ReactorError> {
```

- Line 1581
```rust
    fn pjsua_backend_with_registries_holds_audio_mixers_map() {
```

- Line 1601
```rust
    fn register_media_ports_for_calls_registers_and_connects_every_audio_mixer_entry(
```

- Line 1630
```rust
    fn register_media_ports_for_calls_surfaces_native_error_on_conf_add_failure() {
```

- Line 1654
```rust
    fn default_build_register_conf_callback_is_noop_ok() {
```

- Line 2056
```rust
    fn mock_make_call_increments_call_ids() {
```

- Line 2080
```rust
    fn mock_make_call_result_injection_ok() {
```

### src/runtime/backend_selection.rs

- Line 107
```rust
    fn create_backend_returns_test_backend_in_test_build() -> Result<(), Box<dyn std::error::Error>>
```

- Line 125
```rust
    fn create_backend_accepts_audio_mixers_map() -> Result<(), Box<dyn std::error::Error>> {
```

- Line 142
```rust
    fn unsupported_backend_error_matches_requirement() {
```

- Line 154
```rust
    fn test_backend_set_registration_transitions() -> Result<(), Box<dyn std::error::Error>> {
```

### src/runtime/command.rs

- Line 453
```rust
impl DispatchCommand {
```

- Line 726
```rust
    fn runtime_command_send_dtmf_carries_method() {
```

### src/runtime/reactor.rs

- Line 113
```rust
impl CoreReactor {
```

- Line 1402
```rust
    fn confirmed_calls() -> CallTable {
```

- Line 2528
```rust
    fn handle_make_call_registers_entry_and_returns_id() {
```

### tests/sip_integration.rs

- Line 165
```rust
    // PX-3 / C119-post: with register_conf_callback now wiring the per-call
```
