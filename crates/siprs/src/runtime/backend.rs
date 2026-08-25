// [::TICKET::] P3-2: SipBackend trait — abstract SIP backend operations.
// [::TICKET::] P0-2: backend abstraction — Backend trait, MockBackend, StubBackend

#[cfg(any(test, feature = "test-util"))]
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::error_design_siperror::SipError;
use crate::ffi::bindings;
#[cfg(any(test, feature = "test-util"))]
use crate::model::AccountId;
use crate::runtime::command::ReactorError;
use crate::runtime::state::{AccountEntry, CallEntry};

/// Shared `subscribe_audio` tap producer registry (§62.6).
///
/// Each entry pairs the call's `AccountId` with its tap producer so
/// `push_media_frame` can build a real `AudioChunkPair`. The `SipClient` owns
/// the registry and shares a clone with the backend at reactor boot.
pub(crate) type AudioTapRegistry = Arc<
    Mutex<HashMap<crate::model::CallId, (crate::model::AccountId, crate::api::audio_subscribe_bp::AudioTapSender)>>,
>;

// [::TICKET::] P0-5: re-export needed for SipBackend::get_account_info
use crate::state::m20_registr_cmd_pat::AccountInfoSnapshot;

/// Abstract interface for SIP operations that the reactor dispatches.
///
/// The reactor's event loop calls `SipBackend` trait methods — not raw FFI.
/// This allows:
/// 1. Unit-testing the reactor with `TestBackend`
/// 2. Swapping the real `PjsuaBackend` without changing reactor code
/// 3. Encapsulating `conf_port_id` management inside the backend
pub trait SipBackend: Send {
    /// Initialize the SIP stack with the given configuration.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn initialize(&mut self, config: &crate::config::ClientConfig) -> Result<(), ReactorError>;

    /// Create a SIP transport (UDP/TCP/TLS).
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn create_transport(
        &mut self,
        config: &crate::config::transport_ice_spec::TransportConfig,
    ) -> Result<(), ReactorError>;

    /// Register a SIP account.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn add_account(
        &mut self,
        config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(i32, AccountEntry), ReactorError>;

    /// Remove a previously registered account.
    // [::TICKET::] P3-2, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-3) --for-spec --no-implementation-order`.
    fn remove_account(&mut self, native_acc_id: i32) -> Result<(), ReactorError>;

    /// Update the configuration of a previously registered account.
    ///
    /// The `config` is the merged, validated result of `AccountConfigPatch::apply`
    /// (P10-3) — the backend replaces its stored config, never a partial patch.
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn update_account(
        &mut self,
        native_acc_id: i32,
        config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(), ReactorError>;

    /// Enable or disable SIP registration for an account.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn set_registration(&mut self, native_acc_id: i32, enabled: bool) -> Result<(), ReactorError>;

    /// Place an outgoing call.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn make_call(
        &mut self,
        native_acc_id: i32,
        request: &crate::api::call_types::OutgoingCallRequest,
    ) -> Result<(i32, CallEntry), ReactorError>;

    /// Answer an incoming call with the given response code.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn answer_call(&mut self, native_call_id: i32, code: u16) -> Result<(), ReactorError>;

    /// Hang up an active call.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn hangup(&mut self, native_call_id: i32) -> Result<(), ReactorError>;

    /// Send DTMF digits on an active call.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn send_dtmf(
        &mut self,
        native_call_id: i32,
        method: &crate::config::account_config_spec::DtmfMethod,
        digits: &str,
    ) -> Result<(), ReactorError>;

    /// Configure codec preferences.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn configure_codecs(&mut self) -> Result<(), ReactorError>;

    /// Transfer an active call to a target URI.
    // [::TICKET::] P3-2, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-11) --for-spec --no-implementation-order`.
    fn transfer_call(&mut self, native_call_id: i32, target: &str) -> Result<(), ReactorError>;

    /// Put an active call on hold (`pjsua_call_set_hold`).
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn hold(&mut self, native_call_id: i32) -> Result<(), ReactorError>;

    /// Resume a held call (`pjsua_call_reinvite` with default media).
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn unhold(&mut self, native_call_id: i32) -> Result<(), ReactorError>;

    /// Shut down the SIP stack.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn shutdown(&mut self) -> Result<(), ReactorError>;

    /// Resolve `conf_port_id` for a given native call id.
    ///
    /// conf_port_id is **never** stored in `CallEntry` — it lives here.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn resolve_conf_port(&self, native_call_id: i32) -> Result<i32, ReactorError>;

    /// Get account info for registration state retrieval.
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn get_account_info(&self, native_acc_id: u32) -> Result<AccountInfoSnapshot, ReactorError>;

    /// Connect a call's media to the conference bridge.
// [::TICKET::] P3-2, P11-10, P11-11, P15-3, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11|P15-3|P15-7) --for-spec --no-implementation-order`.
    fn conf_connect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;

    /// Disconnect a call's media from the conference bridge.
// [::TICKET::] P3-2, P7-2, P8-1, P10-1, P11-6, P11-10, P11-11, P12-1, P15-3, P15-5, P15-6, P15-7, P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P7-2|P8-1|P10-1|P11-6|P11-10|P11-11|P12-1|P15-3|P15-5|P15-6|P15-7|P15-9) --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;

    /// Push a processed media frame into the call's audio tap (subscribe_audio).
    ///
    /// §62.6 tap push (OMISSIONS F9 resolution): the backend media callback
    /// drives the tap with real data. `call_id` is the public `CallId` value
    /// (not the native id). Implementations must be non-blocking — this is
    /// invoked from the RT media callback context.
// [::TICKET::] P15-7, P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-7|P15-9) --for-spec --no-implementation-order`.
    fn push_media_frame(
        &mut self,
        call_id: u64,
        frame: crate::audio::pipeline::ProcessedFrame,
    ) -> Result<(), ReactorError>;
}

// ---------------------------------------------------------------------------
// TestBackend — deterministic canned responses for reactor unit tests
// ---------------------------------------------------------------------------

/// Deterministic implementation of `SipBackend` for driving reactor command
/// dispatch in tests (Layer 2 — §43.2). Test-only: compiled for unit tests and
/// for the `test-util` feature that integration tests enable.
///
/// All methods yield deterministic canned responses without side effects.
/// The `initialized` flag tracks whether `initialize()` was called.
///
/// [::TICKET::] P7-2: O-001 — `get_account_info_result` lets tests configure the
/// RegistrationStateChanged flow (Ok(200) by default, or Err to exercise the
/// failure publication path).
///
/// [::TICKET::] P8-1: O-001 — `conf_connect_calls` / `conf_disconnect_calls` record
/// every `(source, sink)` invocation so tests can prove the from_runtime_command
/// closure actually dispatched to the backend (a backend method with no observable
/// side effect is untestable).
#[derive(Default)]
#[cfg(any(test, feature = "test-util"))]
pub struct TestBackend {
    pub initialized: bool,
    /// Configurable result for `get_account_info`. `Some` short-circuits the
    /// registry lookup so tests can inject failures or canned snapshots.
    pub get_account_info_result: Option<Result<AccountInfoSnapshot, ReactorError>>,
    /// Configurable result for `send_dtmf` (P11-6). `Some` short-circuits the
    /// default `Ok(())` so tests can inject a backend failure and prove the
    /// reactor SendDtmf handler spawns no timeout timer on error.
    pub send_dtmf_result: Option<Result<(), ReactorError>>,
    /// Configurable result for `make_call` (P12-1). `Some` short-circuits the
    /// default incrementing-id path so tests can inject a canned
    /// `(native_call_id, CallEntry)` pair or a backend failure.
    pub make_call_result: Option<Result<(i32, CallEntry), ReactorError>>,
    /// Account registry keyed by native_acc_id — the source from which
    /// `get_account_info` derives its snapshot (P10-1).
    pub accounts: BTreeMap<i32, AccountEntry>,
    /// Registration state keyed by native_acc_id, kept in lockstep with
    /// `accounts[id].registration` (§62.2 TestBackend semantics).
    pub registrations: BTreeMap<i32, crate::state::registr_state_machine::RegistrationState>,
    /// Next logical/native id assigned by `add_account` (first = 1).
    next_id: i32,
    /// Next logical/native call id assigned by `make_call` (first = 1).
    next_call_id: i32,
    /// Recorded `(source, sink)` pairs from every `conf_connect` invocation.
    pub conf_connect_calls: Vec<(i32, i32)>,
    /// Recorded `(source, sink)` pairs from every `conf_disconnect` invocation.
    pub conf_disconnect_calls: Vec<(i32, i32)>,
    /// Recorded native call ids from every `hold` invocation (P11-11).
    pub hold_calls: Vec<i32>,
    /// Recorded native call ids from every `unhold` invocation (P11-11).
    pub unhold_calls: Vec<i32>,
    /// Recorded `(native_call_id, code)` pairs from every `answer_call` (P15-6).
    pub answer_calls: Vec<(i32, u16)>,
    /// Recorded native call ids from every `hangup` invocation (P15-6).
    pub hangup_calls: Vec<i32>,
    /// Recorded `(native_call_id, target)` pairs from every `transfer_call` (P15-6).
    pub transfer_calls: Vec<(i32, String)>,
    /// Recorded `(call_id, frame)` pairs from every `push_media_frame` (P15-7).
    pub push_media_frame_calls: Vec<(u64, crate::audio::pipeline::ProcessedFrame)>,
}

#[cfg(any(test, feature = "test-util"))]
// [::TICKET::] P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-5) --for-spec --no-implementation-order`.
impl TestBackend {
    pub fn new() -> Self {
        Self::default()
    }

    /// The registration state tracked for `native_acc_id`, if the account exists.
    ///
    /// Exposes the §62.2 registration transitions to tests so they can assert
    /// the state machine edges (`Disabled` → `Registering`/`Unregistering`)
    /// without round-tripping through the reactor.
    pub fn registration_state(
        &self,
        native_acc_id: i32,
    ) -> Option<crate::state::registr_state_machine::RegistrationState> {
        self.registrations.get(&native_acc_id).copied()
    }

    /// Advance the account to `Registered` so tests can exercise the success
    /// shape (`get_account_info` → status 200) of the registration flow.
    ///
    /// The full `Registering` → `Registered` transition on a native success
    /// response is production-wired by P15-5 (§62.4); this helper lets tests
    /// set up the post-success state directly.
    pub fn mark_registered(&mut self, native_acc_id: i32) {
        if let Some(entry) = self.accounts.get_mut(&native_acc_id) {
            entry.registration =
                crate::state::registr_state_machine::RegistrationState::Registered;
        }
        self.registrations
            .insert(native_acc_id, crate::state::registr_state_machine::RegistrationState::Registered);
    }
}

// [::TICKET::] P8-1, P10-3, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-3|P11-11) --for-spec --no-implementation-order`.
#[cfg(any(test, feature = "test-util"))]
// [::TICKET::] P15-3, P15-6, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-6|P15-7) --for-spec --no-implementation-order`.
impl SipBackend for TestBackend {
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn initialize(&mut self, _config: &crate::config::ClientConfig) -> Result<(), ReactorError> {
        self.initialized = true;
        Ok(())
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn create_transport(
        &mut self,
        _config: &crate::config::transport_ice_spec::TransportConfig,
    ) -> Result<(), ReactorError> {
        Ok(())
    }

// [::TICKET::] P3-2, P10-1, P10-3, P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-1|P10-3|P15-3|P15-5) --for-spec --no-implementation-order`.
    fn add_account(
        &mut self,
        config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(i32, AccountEntry), ReactorError> {
        // Assign incrementing logical/native ids (first = 1) so the registry and
        // the reactor's ClientState stay in lockstep for multi-account tests.
        let id = self.next_id + 1;
        self.next_id = id;
        let entry = AccountEntry {
            id: id as u64,
            native_id: id,
            config: config.clone(),
            // §62.2/§62.4: a freshly added account starts with registration Disabled.
            registration: crate::state::registr_state_machine::RegistrationState::Disabled,
        };
        self.accounts.insert(id, entry.clone());
        self.registrations
            .insert(id, crate::state::registr_state_machine::RegistrationState::Disabled);
        Ok((id, entry))
    }

    // [::TICKET::] P3-2, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-1) --for-spec --no-implementation-order`.
    fn remove_account(&mut self, native_acc_id: i32) -> Result<(), ReactorError> {
        self.accounts.remove(&native_acc_id);
        Ok(())
    }

    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn update_account(
        &mut self,
        native_acc_id: i32,
        config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(), ReactorError> {
        let entry = self.accounts.get_mut(&native_acc_id).ok_or_else(|| {
            ReactorError::BackendError(format!("unknown native account id: {native_acc_id}"))
        })?;
        entry.config = config.clone();
        Ok(())
    }

// [::TICKET::] P3-2, P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3|P15-5) --for-spec --no-implementation-order`.
    fn set_registration(
        &mut self,
        native_acc_id: i32,
        enabled: bool,
    ) -> Result<(), ReactorError> {
        // §62.2: enabling registration enters Registering, disabling enters
        // Unregistering. The pending states are observable via the
        // `registration_state` accessor and the stored AccountEntry.
        let next = if enabled {
            crate::state::registr_state_machine::RegistrationState::Registering
        } else {
            crate::state::registr_state_machine::RegistrationState::Unregistering
        };
        if let Some(entry) = self.accounts.get_mut(&native_acc_id) {
            entry.registration = next;
        }
        self.registrations.insert(native_acc_id, next);
        Ok(())
    }

    // [::TICKET::] P3-2, P4-1, P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P4-1|P12-1) --for-spec --no-implementation-order`.
    fn make_call(
        &mut self,
        native_acc_id: i32,
        _request: &crate::api::call_types::OutgoingCallRequest,
    ) -> Result<(i32, CallEntry), ReactorError> {
        // Test injection path (P12-1): a canned result short-circuits the
        // default incrementing-id assignment so tests can exercise the reactor's
        // error/panic handling without a real PJSUA call.
        if let Some(result) = self.make_call_result.take() {
            return result;
        }
        let id = self.next_call_id + 1;
        self.next_call_id = id;
        let account_id = crate::model::AccountId::from_u64(native_acc_id as u64).map_err(|e| {
            ReactorError::BackendError(format!("make_call: invalid account id: {e}"))
        })?;
        let entry = CallEntry {
            id: id as u64,
            native_id: id,
            account_id,
            state: "Calling".into(),
            media: "none".into(),
        };
        Ok((id, entry))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-6: record every answer_call invocation so integration tests
    // can prove the reactor Answer handler dispatched to the backend.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn answer_call(&mut self, native_call_id: i32, code: u16) -> Result<(), ReactorError> {
        self.answer_calls.push((native_call_id, code));
        Ok(())
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-6: record every hangup invocation so integration tests can
    // prove the reactor Hangup handler dispatched to the backend.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn hangup(&mut self, native_call_id: i32) -> Result<(), ReactorError> {
        self.hangup_calls.push(native_call_id);
        Ok(())
    }

    // [::TICKET::] P3-2, P11-6, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-6|P11-11) --for-spec --no-implementation-order`.
    fn send_dtmf(
        &mut self,
        _native_call_id: i32,
        _method: &crate::config::account_config_spec::DtmfMethod,
        _digits: &str,
    ) -> Result<(), ReactorError> {
        self.send_dtmf_result.take().unwrap_or(Ok(()))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn configure_codecs(&mut self) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    // [::TICKET::] P15-6: record every transfer_call invocation (native id + target)
    // so integration tests can prove the reactor Transfer handler dispatched.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn transfer_call(&mut self, native_call_id: i32, target: &str) -> Result<(), ReactorError> {
        self.transfer_calls.push((native_call_id, target.to_string()));
        Ok(())
    }

    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn hold(&mut self, native_call_id: i32) -> Result<(), ReactorError> {
        self.hold_calls.push(native_call_id);
        Ok(())
    }

    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn unhold(&mut self, native_call_id: i32) -> Result<(), ReactorError> {
        self.unhold_calls.push(native_call_id);
        Ok(())
    }

    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn shutdown(&mut self) -> Result<(), ReactorError> {
        self.initialized = false;
        Ok(())
    }

    fn resolve_conf_port(&self, _native_call_id: i32) -> Result<i32, ReactorError> {
        // Return a fixed conf_port_id for testing
        Ok(1)
    }

// [::TICKET::] P4-1, P7-2, P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-1|P7-2|P10-1|P15-3) --for-spec --no-implementation-order`.
    fn get_account_info(&self, native_acc_id: u32) -> Result<AccountInfoSnapshot, ReactorError> {
        // [::TICKET::] P7-2: O-001 — tests can inject a failure via get_account_info_result.
        // P10-1: without an injected result, derive the snapshot from the registry.
        match &self.get_account_info_result {
            Some(result) => result.clone(),
            None => {
                let entry = self.accounts.get(&(native_acc_id as i32)).ok_or_else(|| {
                    ReactorError::BackendError(format!(
                        "TestBackend::get_account_info: unknown native_acc_id {native_acc_id}"
                    ))
                })?;
                account_entry_to_snapshot(entry)
            }
        }
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    // [::TICKET::] P8-1: O-001 — record the invocation so dispatch-path tests can
    // assert the backend method was actually reached.
    // [::TICKET::] P8-1, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-1) --for-spec --no-implementation-order`.
    fn conf_connect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError> {
        self.conf_connect_calls.push((source, sink));
        Ok(())
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    // [::TICKET::] P8-1: O-001 — record the invocation so dispatch-path tests can
    // assert the backend method was actually reached.
    // [::TICKET::] P8-1, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-1) --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError> {
        self.conf_disconnect_calls.push((source, sink));
        Ok(())
    }

// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
    fn push_media_frame(
        &mut self,
        call_id: u64,
        frame: crate::audio::pipeline::ProcessedFrame,
    ) -> Result<(), ReactorError> {
        self.push_media_frame_calls.push((call_id, frame));
        Ok(())
    }
}

/// Derive an `AccountInfoSnapshot` from a stored `AccountEntry`.
///
/// `Registered` maps to the PJSIP success shape (status 200, 1h expiry, online);
/// every other registration state maps to the unregistered shape (0, None, offline).
/// The `uri` is the entry's config (the mock stores the account username there).
// [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
#[cfg(any(test, feature = "test-util"))]
// [::TICKET::] P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-5) --for-spec --no-implementation-order`.
fn account_entry_to_snapshot(entry: &AccountEntry) -> Result<AccountInfoSnapshot, ReactorError> {
    let account_id = AccountId::from_u64(entry.id).map_err(|_| {
        ReactorError::BackendError(format!(
            "TestBackend: account entry has invalid id {}",
            entry.id
        ))
    })?;
    let registered =
        entry.registration == crate::state::registr_state_machine::RegistrationState::Registered;
    Ok(AccountInfoSnapshot {
        acc_id: account_id,
        registration_status: if registered { 200 } else { 0 },
        registration_expires: if registered { Some(3600) } else { None },
        online_status: registered,
        uri: format!("sip:{}@{}", entry.config.username, entry.config.domain),
    })
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// PjsuaBackend — real PJSUA FFI-backed implementation
// ---------------------------------------------------------------------------

/// Map a PJSUA `pj_status_t` to a `SipError` via the unified §14.1 mapper.
///
/// Reads as prose: classify the status into a semantic kind, then build a
/// `SipError` that preserves the native status as a structured field (not a
/// string-embedded diagnostic).
// [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
pub(crate) fn map_native_error(status: i32, detail: &str) -> SipError {
    let kind = crate::error::m20_runtime_command_error::classify(status);
    SipError::with_status(kind, detail, status)
}

/// Map a PJSUA `pj_status_t` to a `ReactorError`, preserving the diagnostic.
///
/// `PJ_SUCCESS` (0) maps to `Ok`; any non-zero status produces
/// `Err(ReactorError::NativeError)` carrying the raw code as a structured field.
/// A canned `Ok(())` for an unexecuted FFI call is prohibited (C111).
// [::TICKET::] P11-10, P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-10|P15-9) --for-spec --no-implementation-order`.
pub(crate) fn map_pjsua_status(status: i32, operation: &str) -> Result<(), ReactorError> {
    if status == bindings::PJ_SUCCESS {
        Ok(())
    } else {
        let detail = format!("PjsuaBackend::{operation} failed");
        let err = map_native_error(status, &detail);
        Err(ReactorError::NativeError {
            message: err.message,
            native_status: status,
        })
    }
}

/// Real PJSUA-backed SipBackend implementation.
///
/// Every method invokes the corresponding bindgen FFI symbol under
/// `#[cfg(feature = "pjsua-native")]` and maps the `pj_status_t` through
/// [`map_pjsua_status`]. Without the feature the backend cannot drive PJSUA and
/// each method returns a clear precondition error — the crate still compiles
/// (RFC §28, C058) and tests use the deterministic `TestBackend`.
///
/// `audio_taps` is the shared `subscribe_audio` producer registry (§62.6): the
/// media callback pushes a frame into the call's tap via `push_media_frame`.
/// Each entry carries the call's `AccountId` so a pushed frame can build an
/// `AudioChunkPair` with real account context.
pub struct PjsuaBackend {
    /// Shared tap producer registry keyed by public `CallId`.
    audio_taps: AudioTapRegistry,
}

// [::TICKET::] P3-2, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-7) --for-spec --no-implementation-order`.
impl PjsuaBackend {
    pub fn new() -> Self {
        Self {
            audio_taps: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Construct the backend sharing a `subscribe_audio` tap registry.
    ///
    /// `SipClient` owns the registry and hands a clone to the backend at
    /// reactor boot so `push_media_frame` can drive the subscribed taps.
    /// The production path constructs `PjsuaBackend` under `pjsua-native`;
    /// test builds use it to exercise the tap-push wiring on Layer 2.
    #[cfg(any(test, feature = "pjsua-native"))]
    pub(crate) fn with_taps(audio_taps: AudioTapRegistry) -> Self {
        Self { audio_taps }
    }
}

// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
impl Default for PjsuaBackend {
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::new()
    }
}

// [::TICKET::] P3-2, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-3) --for-spec --no-implementation-order`.
// [::TICKET::] P3-2, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-3) --for-spec --no-implementation-order`.
// [::TICKET::] P3-2, P10-3, P11-11, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-3|P11-11|P15-7) --for-spec --no-implementation-order`.
impl SipBackend for PjsuaBackend {
    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn initialize(&mut self, _config: &crate::config::ClientConfig) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(crate::ffi::backend_calls::initialize(), "initialize")
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::initialize requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn create_transport(
        &mut self,
        _config: &crate::config::transport_ice_spec::TransportConfig,
    ) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            let (status, _transport_id) = crate::ffi::backend_calls::create_transport();
            map_pjsua_status(status, "create_transport")
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::create_transport requires the pjsua-native feature".into(),
            ))
        }
    }

// [::TICKET::] P3-2, P10-1, P10-3, P11-10, P11-11, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-1|P10-3|P11-10|P11-11|P15-5) --for-spec --no-implementation-order`.
    fn add_account(
        &mut self,
        _config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(i32, AccountEntry), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            let (status, _native_acc_id) = crate::ffi::backend_calls::add_account(_config);
            map_pjsua_status(status, "add_account")?;
            let entry = AccountEntry {
                id: _native_acc_id as u64,
                native_id: _native_acc_id,
                config: _config.clone(),
                // §62.4: a freshly added account starts with registration Disabled.
                registration:
                    crate::state::registr_state_machine::RegistrationState::Disabled,
            };
            Ok((_native_acc_id, entry))
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::add_account requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P10-3, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-3|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn remove_account(&mut self, _native_acc_id: i32) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::remove_account(_native_acc_id),
                "remove_account",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::remove_account requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn set_registration(
        &mut self,
        _native_acc_id: i32,
        _enabled: bool,
    ) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::set_registration(_native_acc_id, _enabled),
                "set_registration",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::set_registration requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P10-3, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn update_account(
        &mut self,
        _native_acc_id: i32,
        _config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::update_account(_native_acc_id, _config),
                "update_account",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::update_account requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn make_call(
        &mut self,
        _native_acc_id: i32,
        _request: &crate::api::call_types::OutgoingCallRequest,
    ) -> Result<(i32, CallEntry), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            let (status, call_id) =
                crate::ffi::backend_calls::make_call(_native_acc_id, &_request.target_uri);
            map_pjsua_status(status, "make_call")?;
            let account_id = AccountId::from_u64(_native_acc_id as u64).map_err(|e| {
                ReactorError::BackendError(format!("make_call: invalid account id: {e}"))
            })?;
            let entry = CallEntry {
                id: call_id as u64,
                native_id: call_id,
                account_id,
                state: "Calling".into(),
                media: "none".into(),
            };
            Ok((call_id, entry))
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::make_call requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn answer_call(&mut self, _native_call_id: i32, _code: u16) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::answer_call(_native_call_id, _code),
                "answer_call",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::answer_call requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn hangup(&mut self, _native_call_id: i32) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::hangup_call(_native_call_id),
                "hangup",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::hangup requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn send_dtmf(
        &mut self,
        _native_call_id: i32,
        _method: &crate::config::account_config_spec::DtmfMethod,
        _digits: &str,
    ) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::send_dtmf(_native_call_id, _digits),
                "send_dtmf",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::send_dtmf requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn configure_codecs(&mut self) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::configure_codecs(),
                "configure_codecs",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::configure_codecs requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn transfer_call(&mut self, _native_call_id: i32, _target: &str) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::transfer_call(_native_call_id, _target),
                "transfer_call",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::transfer_call requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn hold(&mut self, _native_call_id: i32) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::hold_call(_native_call_id),
                "hold",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::hold requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn unhold(&mut self, _native_call_id: i32) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::unhold_call(_native_call_id),
                "unhold",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::unhold requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn shutdown(&mut self) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(crate::ffi::backend_calls::shutdown(), "shutdown")
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::shutdown requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn resolve_conf_port(&self, _native_call_id: i32) -> Result<i32, ReactorError> {
        // backend_calls::resolve_conf_port is available in both modes (the stub
        // pjsua_call_get_info under the default build, the real symbol under
        // pjsua-native), so this needs no cfg gate.
        let (status, conf_slot) = crate::ffi::backend_calls::resolve_conf_port(_native_call_id);
        map_pjsua_status(status, "resolve_conf_port")?;
        Ok(conf_slot)
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn get_account_info(&self, _native_acc_id: u32) -> Result<AccountInfoSnapshot, ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            let (status, reg_last_err, online, uri) =
                crate::ffi::backend_calls::get_account_info(_native_acc_id);
            map_pjsua_status(status, "get_account_info")?;
            let acc_id = AccountId::from_u64(_native_acc_id as u64).map_err(|e| {
                ReactorError::BackendError(format!("get_account_info: invalid account id: {e}"))
            })?;
            Ok(AccountInfoSnapshot {
                acc_id,
                registration_status: if reg_last_err == 0 { 200 } else { reg_last_err },
                registration_expires: None,
                online_status: online,
                uri,
            })
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::get_account_info requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn conf_connect(&mut self, _source: i32, _sink: i32) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::conf_connect(_source, _sink),
                "conf_connect",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::conf_connect requires the pjsua-native feature".into(),
            ))
        }
    }

    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, _source: i32, _sink: i32) -> Result<(), ReactorError> {
        #[cfg(feature = "pjsua-native")]
        {
            map_pjsua_status(
                crate::ffi::backend_calls::conf_disconnect(_source, _sink),
                "conf_disconnect",
            )
        }
        #[cfg(not(feature = "pjsua-native"))]
        {
            Err(ReactorError::BackendError(
                "PjsuaBackend::conf_disconnect requires the pjsua-native feature".into(),
            ))
        }
    }

    /// Push a processed frame into the call's subscribed tap, if any.
    ///
    /// Looks up the shared `subscribe_audio` registry by public `CallId`, builds
    /// an `AudioChunkPair` (IN = left, OUT = right of the stereo frame) using the
    /// stored `AccountId`, and pushes it synchronously via
    /// `AudioTapSender::try_push` (Realtime, never blocks). An unsubscribed call
    /// is a no-op — the RT callback must never block or error (§62.6 tap push).
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
    fn push_media_frame(
        &mut self,
        call_id: u64,
        frame: crate::audio::pipeline::ProcessedFrame,
    ) -> Result<(), ReactorError> {
        let call_id = crate::model::CallId::from_u64(call_id)
            .map_err(|_| ReactorError::BackendError(format!("invalid CallId {call_id}")))?;
        let taps = self
            .audio_taps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some((account_id, tap)) = taps.get(&call_id) {
            let pair = crate::model::AudioChunkPair::from_processed_frame(
                call_id,
                *account_id,
                &frame,
            );
            tap.try_push(pair);
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::error_design_siperror::SipErrorKind;

    // ── SipBackend trait ──────────────────────────────────────────

    #[test]
    // @verifies C038, C039
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn sip_backend_trait_object_is_object_safe() {
        // Box<dyn SipBackend> must be constructable (object-safe).
        let _backend: Box<dyn SipBackend> = Box::new(TestBackend::new());
        // Compile-time verification: Box<dyn SipBackend> is constructable.
    }

    // ── TestBackend — §62.2 registration semantics ────────────────

    #[test]
    // @verifies C083
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn test_backend_add_account_assigns_ids_from_one() {
        let mut backend = TestBackend::default();
        let config = crate::config::account_config_spec::AccountConfig::default();
        let (first, _) = backend.add_account(&config).unwrap();
        let (second, _) = backend.add_account(&config).unwrap();
        assert_eq!(first, 1, "first native id is 1");
        assert_eq!(second, 2, "ids increment monotonically");
    }

    #[test]
    // @verifies C083
// [::TICKET::] P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-5) --for-spec --no-implementation-order`.
    fn test_backend_add_account_starts_disabled() {
        let mut backend = TestBackend::default();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let (id, entry) = backend.add_account(&config).unwrap();
        assert_eq!(
            entry.registration,
            crate::state::registr_state_machine::RegistrationState::Disabled,
            "RFC §62.2 Disabled initial"
        );
        assert_eq!(
            backend.registration_state(id),
            Some(crate::state::registr_state_machine::RegistrationState::Disabled)
        );
    }

    #[test]
    // @verifies C083
// [::TICKET::] P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-5) --for-spec --no-implementation-order`.
    fn test_backend_set_registration_transitions_registration_map() {
        let mut backend = TestBackend::default();
        let config = crate::config::account_config_spec::AccountConfig::default();
        let (id, _) = backend.add_account(&config).unwrap();
        backend.set_registration(id, true).unwrap();
        assert_eq!(
            backend.registration_state(id),
            Some(crate::state::registr_state_machine::RegistrationState::Registering)
        );
        assert_eq!(
            backend.accounts[&id].registration,
            crate::state::registr_state_machine::RegistrationState::Registering
        );
        backend.set_registration(id, false).unwrap();
        assert_eq!(
            backend.registration_state(id),
            Some(crate::state::registr_state_machine::RegistrationState::Unregistering)
        );
        assert_eq!(
            backend.accounts[&id].registration,
            crate::state::registr_state_machine::RegistrationState::Unregistering
        );
    }

    #[test]
    // @verifies C083
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn test_backend_mark_registered_yields_200_snapshot() {
        let mut backend = TestBackend::default();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            domain: "example.com".into(),
            ..Default::default()
        };
        let (id, _) = backend.add_account(&config).unwrap();
        backend.mark_registered(id);
        let snapshot = backend.get_account_info(id as u32).unwrap();
        assert_eq!(snapshot.registration_status, 200);
        assert_eq!(snapshot.registration_expires, Some(3600));
        assert!(snapshot.online_status);
        assert_eq!(snapshot.uri, "sip:alice@example.com");
    }

    #[test]
    // @verifies C083
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn test_backend_get_account_info_unknown_id_returns_error() {
        let backend = TestBackend::default();
        let result = backend.get_account_info(99);
        assert!(result.is_err(), "unknown native id must return Err, not a canned snapshot");
    }

    #[test]
    // @verifies C083
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn test_backend_update_account_unknown_id_returns_error() {
        let mut backend = TestBackend::default();
        let result = backend.update_account(99, &crate::config::account_config_spec::AccountConfig::default());
        assert!(result.is_err(), "update of an unknown account must return Err");
    }

    // ── map_pjsua_status (C111) ───────────────────────────────────

    #[test]
    // @verifies C111
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn map_pjsua_status_success_is_ok() {
        let result = map_pjsua_status(crate::ffi::bindings::PJ_SUCCESS, "hangup");
        assert!(result.is_ok(), "PJ_SUCCESS must map to Ok(())");
    }

    #[test]
    // @verifies C111
    // [::TICKET::] P11-10, P11-11, P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-10|P11-11|P15-9) --for-spec --no-implementation-order`.
    fn map_pjsua_status_error_preserves_diagnostic() {
        let err = map_pjsua_status(crate::ffi::bindings::PJ_EUNKNOWN, "hangup").unwrap_err();
        match err {
            ReactorError::NativeError {
                message,
                native_status,
            } => {
                assert!(
                    message.contains("hangup"),
                    "message must name the operation: {message}"
                );
                assert_eq!(
                    native_status, crate::ffi::bindings::PJ_EUNKNOWN,
                    "native_status must preserve the code as a structured field"
                );
            }
            _ => panic!("expected NativeError, got {err:?}"),
        }
    }

    #[test]
    // @verifies C090
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn map_native_error_preserves_status_via_classify() {
        // C090 postcondition: map_native_error calls classify + with_status and
        // produces a SipError carrying native_status = Some(status).
        let err = map_native_error(crate::ffi::bindings::PJ_EBUSY, "conf_connect failed");
        assert_eq!(err.native_status(), Some(crate::ffi::bindings::PJ_EBUSY));
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.message, "conf_connect failed");
        assert!(err.retryable);
    }

    #[test]
    // @verifies C090
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn map_pjsua_status_non_zero_produces_native_error_with_status() {
        // C090 invariant: a non-zero status always yields an error — a canned
        // Ok for an unexecuted FFI call is prohibited (C111).
        let err = map_pjsua_status(crate::ffi::bindings::PJ_EUNKNOWN, "answer_call").unwrap_err();
        match err {
            ReactorError::NativeError { native_status, .. } => {
                assert_eq!(native_status, crate::ffi::bindings::PJ_EUNKNOWN);
            }
            _ => panic!("expected NativeError, got {err:?}"),
        }
        assert!(map_pjsua_status(crate::ffi::bindings::PJ_SUCCESS, "answer_call").is_ok());
    }

    #[test]
    // @verifies C111
    // [::TICKET::] P11-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-10 --for-spec --no-implementation-order`.
    fn map_pjsua_status_non_zero_never_ok() {
        // A canned Ok for an unexecuted FFI call is prohibited (C111 invariant):
        // every non-zero pj_status_t must yield Err.
        assert!(map_pjsua_status(70001, "answer_call").is_err());
        assert!(map_pjsua_status(70013, "conf_connect").is_err());
        assert!(map_pjsua_status(70007, "make_call").is_err());
    }

    // ── TestBackend ──────────────────────────────────────────────

    #[test]
    // @verifies C038
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_initialize_sets_flag() {
        let mut backend = TestBackend::new();
        let config = crate::config::ClientConfig::default();
        let result = backend.initialize(&config);
        assert!(result.is_ok(), "TestBackend::initialize must succeed");
        assert!(backend.initialized, "initialized flag must be true");
    }

    #[test]
    // @verifies C038
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_shutdown_clears_flag() {
        let mut backend = TestBackend::new();
        let config = crate::config::ClientConfig::default();
        backend.initialize(&config).unwrap();
        assert!(backend.initialized);

        let result = backend.shutdown();
        assert!(result.is_ok(), "TestBackend::shutdown must succeed");
        assert!(!backend.initialized, "initialized flag must be cleared");
    }

    #[test]
    // @verifies C038
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_conf_connect_disconnect_returns_ok() {
        let mut backend = TestBackend::new();
        assert!(backend.conf_connect(1, 2).is_ok());
        assert!(backend.conf_disconnect(1, 2).is_ok());
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P8-1: O-001 — conf_connect must record the (source, sink) pair so
    // tests can prove the from_runtime_command closure actually invoked it.
// [::TICKET::] P8-1, P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_conf_connect_records_invocation() {
        let mut backend = TestBackend::new();
        backend.conf_connect(3, 4).unwrap();
        backend.conf_connect(5, 6).unwrap();
        assert_eq!(
            backend.conf_connect_calls,
            vec![(3i32, 4i32), (5i32, 6i32)],
            "conf_connect must record each (source, sink)"
        );
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P8-1: O-001 — conf_disconnect must record the (source, sink) pair.
// [::TICKET::] P8-1, P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_conf_disconnect_records_invocation() {
        let mut backend = TestBackend::new();
        backend.conf_disconnect(7, 8).unwrap();
        assert_eq!(
            backend.conf_disconnect_calls,
            vec![(7i32, 8i32)],
            "conf_disconnect must record each (source, sink)"
        );
    }

    #[test]
    // [::TICKET::] P15-7: push_media_frame records (call_id, frame) on TestBackend.
// [::TICKET::] P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-7 --for-spec --no-implementation-order`.
    fn test_backend_push_media_frame_records_invocation() {
        let mut backend = TestBackend::new();
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![1i16, 2],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        backend.push_media_frame(42, frame.clone()).unwrap();
        assert_eq!(backend.push_media_frame_calls.len(), 1);
        assert_eq!(backend.push_media_frame_calls[0].0, 42);
        assert_eq!(backend.push_media_frame_calls[0].1, frame);
    }

    #[test]
    // [::TICKET::] P15-7: push_media_frame on an unsubscribed call is a no-op Ok.
// [::TICKET::] P15-7, P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-7|P15-9) --for-spec --no-implementation-order`.
    fn pjsua_push_media_frame_unsubscribed_call_is_noop() {
        let mut backend = PjsuaBackend::new();
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![1i16, 2],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        // No tap registered — must yield Ok(()) without panicking (RT safety).
        assert!(backend.push_media_frame(42, frame).is_ok());
    }

    #[tokio::test]
    // [::TICKET::] P15-7: tap push drives subscribe_audio's AudioTapHandle with a
    // real AudioChunkPair (OMISSIONS F9 resolution, §62.6).
    async fn push_media_frame_drives_subscribed_tap() -> Result<(), Box<dyn std::error::Error>> {
        let registry: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
        let mut backend = PjsuaBackend::with_taps(registry.clone());
        let (sender, mut handle) =
            crate::api::audio_subscribe_bp::tap_channel(4, crate::api::audio_subscribe_bp::AudioTapMode::Realtime);
        registry
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(
                crate::model::CallId::from_u64(42)?,
                (crate::model::AccountId::from_u64(1)?, sender),
            );
        let frame = crate::audio::pipeline::ProcessedFrame {
            stereo_interleaved: vec![1i16, 2, 3, 4],
            negotiated_codec: crate::config::codec_policy_fallback::NegotiatedCodec::Pcmu,
            timestamp: std::time::Instant::now(),
        };
        backend.push_media_frame(42, frame)?;
        let pair = handle.recv().await.expect("tap must receive the pushed pair");
        assert_eq!(pair.in_chunk, crate::model::AudioChunk::I16(vec![1, 3]));
        assert_eq!(pair.out_chunk, crate::model::AudioChunk::I16(vec![2, 4]));
        Ok(())
    }

    #[test]
    // @verifies C054
// [::TICKET::] P11-11, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-11|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_hold_unhold_records_invocation() {
        let mut backend = TestBackend::new();
        backend.hold(9).unwrap();
        backend.hold(10).unwrap();
        backend.unhold(9).unwrap();
        assert_eq!(
            backend.hold_calls,
            vec![9, 10],
            "hold must record each call id"
        );
        assert_eq!(
            backend.unhold_calls,
            vec![9],
            "unhold must record each call id"
        );
    }

    #[test]
    // @verifies C054
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn pjsua_backend_hold_requires_native_feature() {
        // Without pjsua-native the backend cannot drive PJSUA — a clear
        // precondition error, matching every other PjsuaBackend method.
        let mut backend = PjsuaBackend::new();
        let err = backend.hold(1).unwrap_err();
        assert!(
            err.to_string()
                .contains("requires the pjsua-native feature"),
            "unexpected error: {err}"
        );
    }

    #[test]
    // @verifies C054
    // [::TICKET::] P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P11-11 --for-spec --no-implementation-order`.
    fn pjsua_backend_unhold_requires_native_feature() {
        let mut backend = PjsuaBackend::new();
        let err = backend.unhold(1).unwrap_err();
        assert!(
            err.to_string()
                .contains("requires the pjsua-native feature"),
            "unexpected error: {err}"
        );
    }

    #[test]
    // @verifies C038
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_resolve_conf_port_returns_ok() {
        let backend = TestBackend::new();
        let port = backend.resolve_conf_port(42);
        assert!(port.is_ok(), "resolve_conf_port must succeed");
        assert_eq!(port.unwrap(), 1, "mock must return fixed port 1");
    }

    #[test]
    // @verifies C038
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_add_account_returns_entry() {
        let mut backend = TestBackend::new();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "test".into(),
            ..crate::config::account_config_spec::AccountConfig::default()
        };
        let result = backend.add_account(&config);
        assert!(result.is_ok(), "add_account must succeed");
        let (native_id, _entry) = result.unwrap();
        assert_eq!(native_id, 1, "mock native_acc_id must be 1");
    }

    #[test]
    // @verifies C039
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_configure_codecs_returns_ok() {
        let mut backend = TestBackend::new();
        assert!(backend.configure_codecs().is_ok());
    }

    // ── O-001: TestBackend::get_account_info ─────────────────────────

    /// @verifies C024
    #[test]
    // [::TICKET::] P7-2: O-001 — TestBackend::get_account_info returns the controllable snapshot shape
    // [::TICKET::] P10-1: the snapshot is now derived from the stored AccountEntry
// [::TICKET::] P7-2, P10-1, P10-3, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P10-1|P10-3|P15-3) --for-spec --no-implementation-order`.
    fn test_backend_get_account_info_derives_registered_snapshot(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            ..crate::config::account_config_spec::AccountConfig::default()
        };
        backend.add_account(&config)?;
        // [::TICKET::] P15-3: §62.2 — add_account starts Disabled; advance the
        // account to Registered so the 200 success shape is exercised.
        backend.mark_registered(1);
        let snapshot = backend.get_account_info(1)?;
        assert_eq!(snapshot.acc_id, AccountId::from_u64(1)?);
        assert_eq!(snapshot.registration_status, 200);
        assert_eq!(snapshot.registration_expires, Some(3600));
        assert!(snapshot.online_status);
        assert_eq!(
            snapshot.uri, "sip:alice@sip.example.com",
            "uri must be derived from the stored AccountConfig (P10-3 stores the full config)"
        );
        Ok(())
    }

    /// @verifies C024
    #[test]
    // [::TICKET::] P7-2: O-001 — get_account_info_result lets tests configure the Err path
// [::TICKET::] P7-2, P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P10-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_result_configurable() {
        let mut backend = TestBackend::new();
        backend.get_account_info_result =
            Some(Err(ReactorError::BackendError("mock backend down".into())));

        let result = backend.get_account_info(1);
        assert!(
            matches!(result, Err(ReactorError::BackendError(_))),
            "expected configured Err, got {:?}",
            result
        );
    }

    #[test]
    // @verifies C039
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_transfer_call_returns_ok() {
        let mut backend = TestBackend::new();
        assert!(backend.transfer_call(1, "sip:target@example.com").is_ok());
    }

    // ── PjsuaBackend ─────────────────────────────────────────────

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2, P11-10, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-10|P11-11) --for-spec --no-implementation-order`.
    fn pjsua_backend_returns_error_for_all_operations() {
        let mut backend = PjsuaBackend::new();
        let config = crate::config::ClientConfig::default();
        let result = backend.initialize(&config);
        assert!(
            result.is_err(),
            "PjsuaBackend must return error when the pjsua-native feature is off"
        );
        let err_msg = format!("{}", result.unwrap_err());
        assert!(
            err_msg.contains("pjsua-native"),
            "error must name the pjsua-native prerequisite, got: {err_msg}"
        );
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_backend_all_methods_return_unimplemented() {
        let mut backend = PjsuaBackend::new();
        use std::net::SocketAddr;
        let transport = crate::config::transport_ice_spec::TransportConfig::Udp(
            crate::config::transport_ice_spec::UdpTransportConfig {
                bind_addr: "0.0.0.0:5060".parse::<SocketAddr>().unwrap(),
            },
        );
        assert!(backend.create_transport(&transport).is_err());
        assert!(backend.remove_account(1).is_err());
        assert!(backend.hangup(1).is_err());
        assert!(backend.shutdown().is_err());
    }

    // ── Invariant ────────────────────────────────────────────────

    #[test]
    // @verifies C039
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn sip_backend_trait_methods_use_rust_types() {
        // Compile-time verification: all SipBackend method parameters
        // are Rust types (AccountConfig, OutgoingCallRequest, DtmfMethod, etc.)
        // — never bare PJSIP C types. This test passes at compile time.
        //
        // Check that Box<dyn SipBackend> does not require any PJSIP FFI types
        // at the trait boundary.
        // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
        fn _assert_object_safe<T: SipBackend + ?Sized>() {}
        _assert_object_safe::<dyn SipBackend>();
    }

    #[test]
    // @verifies C038, C039
// [::TICKET::] P3-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P15-3) --for-spec --no-implementation-order`.
    fn test_backend_is_send() {
// [::TICKET::] P3-2, P10-1, P10-3, P12-1, P15-3, P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-1|P10-3|P12-1|P15-3|P15-6) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<TestBackend>();
        assert_send::<PjsuaBackend>();
    }

    // ── P10-1: account registry derives account-info snapshots ──────────

    // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
    fn account_config(username: &str) -> crate::config::account_config_spec::AccountConfig {
        crate::config::account_config_spec::AccountConfig {
            username: username.into(),
            domain: "example.com".into(),
            ..crate::config::account_config_spec::AccountConfig::default()
        }
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P10-1, P10-3, P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3|P15-3|P15-5) --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_derives_idle_snapshot(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.add_account(&account_config("bob"))?;
        // Mutate the stored entry to Idle — the snapshot must derive the
        // unregistered shape, not a canned 200.
        let entry = backend
            .accounts
            .get_mut(&1)
            .ok_or("registry must hold the added account")?;
        entry.registration = crate::state::registr_state_machine::RegistrationState::Idle;
        let snapshot = backend.get_account_info(1)?;
        assert_eq!(snapshot.registration_status, 0);
        assert_eq!(snapshot.registration_expires, None);
        assert!(!snapshot.online_status);
        assert_eq!(
            snapshot.uri, "sip:bob@example.com",
            "uri must be derived from the stored AccountConfig AOR"
        );
        Ok(())
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_unknown_native_id_returns_err() {
        // P10-1: no canned fallback — an unknown native_acc_id is Err when no
        // injected get_account_info_result is set.
        let backend = TestBackend::new();
        let result = backend.get_account_info(99);
        assert!(
            matches!(result, Err(ReactorError::BackendError(_))),
            "expected Err for unknown native id, got {result:?}"
        );
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_add_account_assigns_incrementing_ids() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = TestBackend::new();
        let (native1, entry1) = backend.add_account(&account_config("alice"))?;
        let (native2, entry2) = backend.add_account(&account_config("bob"))?;
        assert_eq!(native1, 1, "first account native_id must be 1");
        assert_eq!(entry1.id, 1, "first account id must be 1");
        assert_eq!(native2, 2, "second account native_id must be 2");
        assert_eq!(entry2.id, 2, "second account id must be 2");
        // Both entries are stored in the registry keyed by native_acc_id.
        assert_eq!(backend.accounts.len(), 2);
        Ok(())
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P10-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_remove_account_removes_registry_entry() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = TestBackend::new();
        backend.add_account(&account_config("alice"))?;
        assert!(backend.get_account_info(1).is_ok());
        backend.remove_account(1)?;
        assert!(
            backend.get_account_info(1).is_err(),
            "after remove_account, get_account_info must be Err"
        );
        Ok(())
    }

    // ── P10-3: TestBackend::update_account + full-config storage ───────

    #[test]
    // @verifies C015
// [::TICKET::] P10-3, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_add_account_stores_full_config() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        let mut config = account_config("alice");
        config.domain = "pbx.example.com".into();
        backend.add_account(&config)?;
        let entry = backend.accounts.get(&1).ok_or("entry must be stored")?;
        assert_eq!(entry.config.username, "alice");
        assert_eq!(
            entry.config.domain, "pbx.example.com",
            "the full AccountConfig must be retained, not just the username"
        );
        Ok(())
    }

    #[test]
    // @verifies C015
// [::TICKET::] P10-3, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_update_account_updates_stored_config() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = TestBackend::new();
        backend.add_account(&account_config("alice"))?;
        let mut new_config = account_config("bob");
        new_config.domain = "pbx.example.com".into();
        backend.update_account(1, &new_config)?;
        let entry = backend.accounts.get(&1).ok_or("entry must exist")?;
        assert_eq!(entry.config.username, "bob");
        assert_eq!(entry.config.domain, "pbx.example.com");
        Ok(())
    }

    #[test]
    // @verifies C017
// [::TICKET::] P10-3, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P15-3) --for-spec --no-implementation-order`.
    fn mock_backend_update_account_unknown_id_returns_err() {
        let mut backend = TestBackend::new();
        assert!(
            backend.update_account(99, &account_config("x")).is_err(),
            "update_account on an unknown native id must return Err"
        );
    }

    #[test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn pjsua_backend_update_account_returns_unimplemented() {
        let mut backend = PjsuaBackend::new();
        assert!(
            backend.update_account(1, &account_config("alice")).is_err(),
            "PjsuaBackend::update_account must return Err until FFI lands (P3-2)"
        );
    }

    // ── P12-1: TestBackend::make_call assigns deterministic incrementing ids ─

    // [::TICKET::] P12-1: test helper shared by the make_call tests.
    // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
    fn test_call_request() -> crate::api::call_types::OutgoingCallRequest {
        crate::api::call_types::OutgoingCallRequest {
            target_uri: "sip:bob@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::api::call_types::CallMediaPreferences::default(),
            auto_answer_refer: false,
        }
    }

    #[test]
    // @verifies C070
// [::TICKET::] P12-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_make_call_increments_call_ids() {
        let mut backend = TestBackend::new();
        let (native_id1, entry1) = backend.make_call(1, &test_call_request()).unwrap();
        let (native_id2, entry2) = backend.make_call(1, &test_call_request()).unwrap();
        assert_eq!(native_id1, 1, "first make_call native id is 1");
        assert_eq!(entry1.id, 1, "first CallEntry.id is 1");
        assert_eq!(entry1.native_id, 1);
        assert_eq!(native_id2, 2, "second make_call native id is 2");
        assert_eq!(entry2.id, 2, "second CallEntry.id is 2");
        assert_eq!(
            entry2.account_id,
            crate::model::AccountId::from_u64(1).unwrap(),
            "CallEntry.account_id derives from the native acc id"
        );
        assert_eq!(entry2.state, "Calling", "initial call state is Calling");
    }

    #[test]
    // @verifies C070
// [::TICKET::] P12-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_make_call_result_injection_ok() {
        let mut backend = TestBackend::new();
        let entry = CallEntry {
            id: 42,
            native_id: 42,
            account_id: crate::model::AccountId::from_u64(1).unwrap(),
            state: "Calling".into(),
            media: "none".into(),
        };
        backend.make_call_result = Some(Ok((42, entry.clone())));
        let (native_id, got) = backend.make_call(1, &test_call_request()).unwrap();
        assert_eq!(native_id, 42, "injected native id is surfaced");
        assert_eq!(got.id, 42, "injected CallEntry.id is surfaced");
    }

    #[test]
    // @verifies C070
// [::TICKET::] P12-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_make_call_result_injection_err() {
        let mut backend = TestBackend::new();
        backend.make_call_result = Some(Err(ReactorError::BackendError("invite rejected".into())));
        let result = backend.make_call(1, &test_call_request());
        assert!(
            matches!(result, Err(ReactorError::BackendError(_))),
            "injected backend error must propagate"
        );
    }

    #[test]
    // @verifies C070
// [::TICKET::] P12-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P12-1|P15-3) --for-spec --no-implementation-order`.
    fn mock_make_call_zero_native_id_returns_err() {
        let mut backend = TestBackend::new();
        let result = backend.make_call(0, &test_call_request());
        assert!(
            result.is_err(),
            "AccountId::from_u64(0) is Err — make_call must map it, never expect()"
        );
    }

    // ── P15-6: answer/hangup/transfer recorders ───────────────────────

    #[test]
    // @verifies C086
    // [::TICKET::] P15-6: answer_call records every (native_call_id, code) so
    // integration tests can prove the reactor Answer handler dispatched.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn test_backend_records_answer_calls() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.answer_call(1, 200)?;
        backend.answer_call(2, 486)?;
        assert_eq!(
            backend.answer_calls,
            vec![(1, 200), (2, 486)],
            "answer_call must record (native_call_id, code) in order"
        );
        Ok(())
    }

    #[test]
    // @verifies C074
    // [::TICKET::] P15-6: hangup records the native call id.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn test_backend_records_hangup_calls() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.hangup(5)?;
        backend.hangup(6)?;
        assert_eq!(
            backend.hangup_calls,
            vec![5, 6],
            "hangup must record native call ids in order"
        );
        Ok(())
    }

    #[test]
    // @verifies C074
    // [::TICKET::] P15-6: transfer_call records (native_call_id, target).
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn test_backend_records_transfer_calls() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::new();
        backend.transfer_call(3, "sip:bob@example.com")?;
        backend.transfer_call(4, "sip:carol@example.com")?;
        assert_eq!(
            backend.transfer_calls,
            vec![
                (3, "sip:bob@example.com".to_string()),
                (4, "sip:carol@example.com".to_string()),
            ],
            "transfer_call must record (native_call_id, target) in order"
        );
        Ok(())
    }
}
