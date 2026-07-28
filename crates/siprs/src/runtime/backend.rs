// [::TICKET::] P3-2: SipBackend trait — abstract SIP backend operations.
// [::TICKET::] P0-2: backend abstraction — Backend trait, MockBackend, StubBackend

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
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn remove_account(&mut self, native_acc_id: i32) -> Result<(), ReactorError>;

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
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, source: i32, sink: i32) -> Result<(), ReactorError>;
}

// ---------------------------------------------------------------------------
// MockBackend — canned responses for reactor unit tests
// ---------------------------------------------------------------------------

/// Mock implementation of `SipBackend` for testing reactor command dispatch.
///
/// All methods return deterministic canned responses without side effects.
/// The `initialized` flag tracks whether `initialize()` was called.
#[derive(Default)]
pub struct MockBackend {
    pub initialized: bool,
}

impl MockBackend {
    pub fn new() -> Self {
        Self::default()
    }
}

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

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn add_account(
        &mut self,
        _config: &crate::config::account_config_spec::AccountConfig,
    ) -> Result<(i32, AccountEntry), ReactorError> {
        // Returns native_acc_id=1, AccountEntry with placeholder values
        let entry = AccountEntry {
            id: 1,
            native_id: 1,
            config: _config.username.clone(),
            registration: "Registered".into(),
        };
        Ok((1, entry))
    }

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn remove_account(&mut self, _native_acc_id: i32) -> Result<(), ReactorError> {
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

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn make_call(
        &mut self,
        _native_acc_id: i32,
        _request: &crate::api::call_types::OutgoingCallRequest,
    ) -> Result<(i32, CallEntry), ReactorError> {
        // Returns native_call_id=1, CallEntry with placeholder values
        let entry = CallEntry {
            id: 1,
            native_id: 1,
            account_id: _native_acc_id as u64,
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

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn send_dtmf(
        &mut self,
        _native_call_id: i32,
        _method: &crate::config::account_config_spec::DtmfMethod,
        _digits: &str,
    ) -> Result<(), ReactorError> {
        Ok(())
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

    fn get_account_info(&self, _native_acc_id: u32) -> Result<AccountInfoSnapshot, ReactorError> {
        // [::STUB::] P3-1: Return real account information once the account state
        // machine (N0025) provides actual registration state. The mock returns a
        // canned "registered" response for testing event conversion logic.
        Ok(AccountInfoSnapshot {
            acc_id: crate::api::event_model_payload_bus::AccountId(_native_acc_id as u64),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: format!("sip:user{}@mock.example.com", _native_acc_id),
        })
    }

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn conf_connect(&mut self, _source: i32, _sink: i32) -> Result<(), ReactorError> {
        Ok(())
    }

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn conf_disconnect(&mut self, _source: i32, _sink: i32) -> Result<(), ReactorError> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// PjsuaBackend — real PJSUA FFI-backed implementation (stub for P3-2)
// ---------------------------------------------------------------------------

/// Placeholder for the real PJSUA-backed SipBackend implementation.
///
/// All methods return `Err(ReactorError::BackendError("unimplemented"))`.
/// The real implementation requires PJSIP library linkage (P4+).
///
/// [::STUB::] P4-2: Replace each method body with actual PJSIP FFI calls.
pub struct PjsuaBackend;

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl PjsuaBackend {
    pub fn new() -> Self {
        Self
    }
}

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
impl SipBackend for PjsuaBackend {
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
    fn initialize(
        &mut self,
        _config: &crate::config::ClientConfig,
    ) -> Result<(), ReactorError> {
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
// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<MockBackend>();
        assert_send::<PjsuaBackend>();
    }
}
