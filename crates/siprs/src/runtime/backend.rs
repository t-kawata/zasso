// [::TICKET::] P3-2: SipBackend trait — abstract SIP backend operations.
// [::TICKET::] P0-2: backend abstraction — Backend trait, MockBackend, StubBackend

use std::collections::BTreeMap;

use crate::model::AccountId;
use crate::runtime::command::ReactorError;
use crate::runtime::state::{AccountEntry, CallEntry};

// [::TICKET::] P0-5: re-export needed for SipBackend::get_account_info
use crate::state::m20_registr_cmd_pat::AccountInfoSnapshot;

/// Abstract interface for SIP operations that the reactor dispatches.
///
/// The reactor's event loop calls `SipBackend` trait methods — not raw FFI.
/// This allows:
/// 1. Unit-testing the reactor with `MockBackend`
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
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn transfer_call(&mut self, native_call_id: i32, target: &str) -> Result<(), ReactorError>;

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
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn conf_connect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;

    /// Disconnect a call's media from the conference bridge.
// [::TICKET::] P3-2, P7-2, P8-1, P10-1, P11-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P7-2|P8-1|P10-1|P11-6) --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;
}

// ---------------------------------------------------------------------------
// MockBackend — canned responses for reactor unit tests
// ---------------------------------------------------------------------------

/// Mock implementation of `SipBackend` for testing reactor command dispatch.
///
/// All methods return deterministic canned responses without side effects.
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
pub struct MockBackend {
    pub initialized: bool,
    /// Configurable result for `get_account_info`. `Some` short-circuits the
    /// registry lookup so tests can inject failures or canned snapshots.
    pub get_account_info_result: Option<Result<AccountInfoSnapshot, ReactorError>>,
    /// Configurable result for `send_dtmf` (P11-6). `Some` short-circuits the
    /// default `Ok(())` so tests can inject a backend failure and prove the
    /// reactor SendDtmf handler spawns no timeout timer on error.
    pub send_dtmf_result: Option<Result<(), ReactorError>>,
    /// Account registry keyed by native_acc_id — the source from which
    /// `get_account_info` derives its snapshot (P10-1).
    pub accounts: BTreeMap<i32, AccountEntry>,
    /// Next logical/native id assigned by `add_account` (first = 1).
    next_id: i32,
    /// Recorded `(source, sink)` pairs from every `conf_connect` invocation.
    pub conf_connect_calls: Vec<(i32, i32)>,
    /// Recorded `(source, sink)` pairs from every `conf_disconnect` invocation.
    pub conf_disconnect_calls: Vec<(i32, i32)>,
}

impl MockBackend {
    pub fn new() -> Self {
        Self::default()
    }
}

// [::TICKET::] P8-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-3) --for-spec --no-implementation-order`.
impl SipBackend for MockBackend {
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

    // [::TICKET::] P3-2, P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-1|P10-3) --for-spec --no-implementation-order`.
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
            registration: "Registered".into(),
        };
        self.accounts.insert(id, entry.clone());
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

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn set_registration(
        &mut self,
        _native_acc_id: i32,
        _enabled: bool,
    ) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P3-2, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P4-1) --for-spec --no-implementation-order`.
    fn make_call(
        &mut self,
        _native_acc_id: i32,
        _request: &crate::api::call_types::OutgoingCallRequest,
    ) -> Result<(i32, CallEntry), ReactorError> {
        // Returns native_call_id=1, CallEntry with placeholder values
        let entry = CallEntry {
            id: 1,
            native_id: 1,
            account_id: crate::model::AccountId::from_u64(_native_acc_id as u64)
                .expect("mock AccountId from non-zero native acc_id"),
            state: "Calling".into(),
            media: "none".into(),
        };
        Ok((1, entry))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn answer_call(&mut self, _native_call_id: i32, _code: u16) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn hangup(&mut self, _native_call_id: i32) -> Result<(), ReactorError> {
        Ok(())
    }

// [::TICKET::] P3-2, P11-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P11-6) --for-spec --no-implementation-order`.
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
    fn transfer_call(&mut self, _native_call_id: i32, _target: &str) -> Result<(), ReactorError> {
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), ReactorError> {
        self.initialized = false;
        Ok(())
    }

    fn resolve_conf_port(&self, _native_call_id: i32) -> Result<i32, ReactorError> {
        // Return a fixed conf_port_id for testing
        Ok(1)
    }

    // [::TICKET::] P4-1, P7-2, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-1|P7-2|P10-1) --for-spec --no-implementation-order`.
    fn get_account_info(&self, native_acc_id: u32) -> Result<AccountInfoSnapshot, ReactorError> {
        // [::TICKET::] P7-2: O-001 — tests can inject a failure via get_account_info_result.
        // P10-1: without an injected result, derive the snapshot from the registry.
        match &self.get_account_info_result {
            Some(result) => result.clone(),
            None => {
                let entry = self.accounts.get(&(native_acc_id as i32)).ok_or_else(|| {
                    ReactorError::BackendError(format!(
                        "MockBackend::get_account_info: unknown native_acc_id {native_acc_id}"
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
}

/// Derive an `AccountInfoSnapshot` from a stored `AccountEntry`.
///
/// "Registered" maps to the PJSIP success shape (status 200, 1h expiry, online);
/// every other registration string maps to the unregistered shape (0, None, offline).
/// The `uri` is the entry's config (the mock stores the account username there).
// [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
fn account_entry_to_snapshot(entry: &AccountEntry) -> Result<AccountInfoSnapshot, ReactorError> {
    let account_id = AccountId::from_u64(entry.id).map_err(|_| {
        ReactorError::BackendError(format!(
            "MockBackend: account entry has invalid id {}",
            entry.id
        ))
    })?;
    let registered = entry.registration == "Registered";
    Ok(AccountInfoSnapshot {
        acc_id: account_id,
        registration_status: if registered { 200 } else { 0 },
        registration_expires: if registered { Some(3600) } else { None },
        online_status: registered,
        uri: format!("sip:{}@{}", entry.config.username, entry.config.domain),
    })
}

// ---------------------------------------------------------------------------
// PjsuaBackend — real PJSUA FFI-backed implementation (stub for P3-2)
// ---------------------------------------------------------------------------

/// Placeholder for the real PJSUA-backed SipBackend implementation.
///
/// All methods return `Err(ReactorError::BackendError("unimplemented"))`.
/// The real implementation requires PJSIP library linkage (P4+).
///
// [::STUB::] P11-10: Real PJSIP FFI calls are not yet wired; canned or unimplemented values are returned -- Replace canned or unimplemented PJSIP FFI call sites (pjsua_call_get_info and other backend calls) with real bindgen-generated calls and obtain actual media_status once the pjsua-native feature and library linkage are ready
#[derive(Default)]
pub struct PjsuaBackend;

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl PjsuaBackend {
    pub fn new() -> Self {
        Self
    }
}

// [::TICKET::] P3-2, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-3) --for-spec --no-implementation-order`.
impl SipBackend for PjsuaBackend {
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn initialize(&mut self, _config: &crate::config::ClientConfig) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::initialize: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn create_transport(
        &mut self,
        _config: &crate::config::transport_ice_spec::TransportConfig,
    ) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::create_transport: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn add_account(
        &mut self,
        _config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(i32, AccountEntry), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::add_account: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn remove_account(&mut self, _native_acc_id: i32) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::remove_account: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn set_registration(
        &mut self,
        _native_acc_id: i32,
        _enabled: bool,
    ) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::set_registration: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn update_account(
        &mut self,
        _native_acc_id: i32,
        _config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::update_account: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn make_call(
        &mut self,
        _native_acc_id: i32,
        _request: &crate::api::call_types::OutgoingCallRequest,
    ) -> Result<(i32, CallEntry), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::make_call: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn answer_call(&mut self, _native_call_id: i32, _code: u16) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::answer_call: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn hangup(&mut self, _native_call_id: i32) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::hangup: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn send_dtmf(
        &mut self,
        _native_call_id: i32,
        _method: &crate::config::account_config_spec::DtmfMethod,
        _digits: &str,
    ) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::send_dtmf: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn configure_codecs(&mut self) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::configure_codecs: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn transfer_call(&mut self, _native_call_id: i32, _target: &str) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::transfer_call: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn shutdown(&mut self) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::shutdown: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn resolve_conf_port(&self, _native_call_id: i32) -> Result<i32, ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::resolve_conf_port: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn get_account_info(&self, _native_acc_id: u32) -> Result<AccountInfoSnapshot, ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::get_account_info: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn conf_connect(&mut self, _source: i32, _sink: i32) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::conf_connect: not yet implemented (P4-2)".into(),
        ))
    }

    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, _source: i32, _sink: i32) -> Result<(), ReactorError> {
        Err(ReactorError::BackendError(
            "PjsuaBackend::conf_disconnect: not yet implemented (P4-2)".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── SipBackend trait ──────────────────────────────────────────

    #[test]
    // @verifies C038, C039
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn sip_backend_trait_object_is_object_safe() {
        // Box<dyn SipBackend> must be constructable (object-safe).
        let _backend: Box<dyn SipBackend> = Box::new(MockBackend::new());
        // Compile-time verification: Box<dyn SipBackend> is constructable.
    }

    // ── MockBackend ──────────────────────────────────────────────

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_initialize_sets_flag() {
        let mut backend = MockBackend::new();
        let config = crate::config::ClientConfig::default();
        let result = backend.initialize(&config);
        assert!(result.is_ok(), "MockBackend::initialize must succeed");
        assert!(backend.initialized, "initialized flag must be true");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_shutdown_clears_flag() {
        let mut backend = MockBackend::new();
        let config = crate::config::ClientConfig::default();
        backend.initialize(&config).unwrap();
        assert!(backend.initialized);

        let result = backend.shutdown();
        assert!(result.is_ok(), "MockBackend::shutdown must succeed");
        assert!(!backend.initialized, "initialized flag must be cleared");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_conf_connect_disconnect_returns_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.conf_connect(1, 2).is_ok());
        assert!(backend.conf_disconnect(1, 2).is_ok());
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P8-1: O-001 — conf_connect must record the (source, sink) pair so
    // tests can prove the from_runtime_command closure actually invoked it.
    // [::TICKET::] P8-1, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-1) --for-spec --no-implementation-order`.
    fn mock_backend_conf_connect_records_invocation() {
        let mut backend = MockBackend::new();
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
    // [::TICKET::] P8-1, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-1) --for-spec --no-implementation-order`.
    fn mock_backend_conf_disconnect_records_invocation() {
        let mut backend = MockBackend::new();
        backend.conf_disconnect(7, 8).unwrap();
        assert_eq!(
            backend.conf_disconnect_calls,
            vec![(7i32, 8i32)],
            "conf_disconnect must record each (source, sink)"
        );
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_resolve_conf_port_returns_ok() {
        let backend = MockBackend::new();
        let port = backend.resolve_conf_port(42);
        assert!(port.is_ok(), "resolve_conf_port must succeed");
        assert_eq!(port.unwrap(), 1, "mock must return fixed port 1");
    }

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_add_account_returns_entry() {
        let mut backend = MockBackend::new();
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
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_configure_codecs_returns_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.configure_codecs().is_ok());
    }

    // ── O-001: MockBackend::get_account_info ─────────────────────────

    /// @verifies C024
    #[test]
    // [::TICKET::] P7-2: O-001 — MockBackend::get_account_info returns the controllable snapshot shape
    // [::TICKET::] P10-1: the snapshot is now derived from the stored AccountEntry
    // [::TICKET::] P7-2, P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P10-1|P10-3) --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_derives_registered_snapshot(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = MockBackend::new();
        let config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            ..crate::config::account_config_spec::AccountConfig::default()
        };
        backend.add_account(&config)?;
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
    // [::TICKET::] P7-2, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P7-2|P10-1) --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_result_configurable() {
        let mut backend = MockBackend::new();
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
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_transfer_call_returns_ok() {
        let mut backend = MockBackend::new();
        assert!(backend.transfer_call(1, "sip:target@example.com").is_ok());
    }

    // ── PjsuaBackend ─────────────────────────────────────────────

    #[test]
    // @verifies C038
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn pjsua_backend_returns_error_for_all_operations() {
        let mut backend = PjsuaBackend::new();
        let config = crate::config::ClientConfig::default();
        let result = backend.initialize(&config);
        assert!(
            result.is_err(),
            "PjsuaBackend stub must return error for initialize"
        );
        let err_msg = format!("{}", result.unwrap_err());
        assert!(
            err_msg.contains("not yet implemented"),
            "error must indicate pending implementation, got: {err_msg}"
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
    // [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn mock_backend_is_send() {
        // [::TICKET::] P3-2, P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-2|P10-1|P10-3) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<MockBackend>();
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
    // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_derives_idle_snapshot(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = MockBackend::new();
        backend.add_account(&account_config("bob"))?;
        // Mutate the stored entry to the Idle storage string — the snapshot
        // must derive the unregistered shape, not a canned 200.
        let entry = backend
            .accounts
            .get_mut(&1)
            .ok_or("registry must hold the added account")?;
        entry.registration = "Idle".into();
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
    // [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
    fn mock_backend_get_account_info_unknown_native_id_returns_err() {
        // P10-1: no canned fallback — an unknown native_acc_id is Err when no
        // injected get_account_info_result is set.
        let backend = MockBackend::new();
        let result = backend.get_account_info(99);
        assert!(
            matches!(result, Err(ReactorError::BackendError(_))),
            "expected Err for unknown native id, got {result:?}"
        );
    }

    /// @verifies C024
    #[test]
    // [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
    fn mock_backend_add_account_assigns_incrementing_ids() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = MockBackend::new();
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
    // [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
    fn mock_backend_remove_account_removes_registry_entry() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = MockBackend::new();
        backend.add_account(&account_config("alice"))?;
        assert!(backend.get_account_info(1).is_ok());
        backend.remove_account(1)?;
        assert!(
            backend.get_account_info(1).is_err(),
            "after remove_account, get_account_info must be Err"
        );
        Ok(())
    }

    // ── P10-3: MockBackend::update_account + full-config storage ───────

    #[test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn mock_backend_add_account_stores_full_config() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = MockBackend::new();
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
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn mock_backend_update_account_updates_stored_config() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut backend = MockBackend::new();
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
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn mock_backend_update_account_unknown_id_returns_err() {
        let mut backend = MockBackend::new();
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
}
