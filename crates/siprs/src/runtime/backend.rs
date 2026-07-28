// [::TICKET::] P0-2: backend abstraction — Backend trait, MockBackend, StubBackend

use crate::runtime::command::ReactorError;
use crate::runtime::state::{AccountEntry, CallEntry};

/// Abstract interface for the PJSIP operations that the reactor dispatches.
///
/// The reactor's event loop calls `Backend` trait methods — not raw FFI.
/// This allows:
/// 1. Unit-testing the reactor with `MockBackend`
/// 2. Swapping the real `PjsuaBackend` (P0-6) without changing reactor code
/// 3. Encapsulating `conf_port_id` management inside the backend
pub trait Backend: Send {
    /// Initialize the PJSUA library with the given configuration.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn initialize(&mut self) -> Result<(), ReactorError>;
    /// Create a SIP transport (UDP/TCP/TLS).
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn create_transport(&mut self) -> Result<(), ReactorError>;
    /// Register a SIP account.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn add_account(&mut self, config: &str) -> Result<AccountEntry, ReactorError>;
    /// Remove a previously registered account.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn remove_account(&mut self, account_id: u64) -> Result<(), ReactorError>;
    /// Enable or disable SIP registration for an account.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn set_registration(&mut self, account_id: u64, enabled: bool) -> Result<(), ReactorError>;
    /// Place an outgoing call.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn make_call(&mut self, account_id: u64, request: &str) -> Result<CallEntry, ReactorError>;
    /// Answer an incoming call.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn answer_call(&mut self, call_id: u64) -> Result<(), ReactorError>;
    /// Hang up an active call.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn hangup(&mut self, call_id: u64) -> Result<(), ReactorError>;
    /// Place a call on hold.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn hold(&mut self, call_id: u64) -> Result<(), ReactorError>;
    /// Take a call off hold.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn unhold(&mut self, call_id: u64) -> Result<(), ReactorError>;
    /// Send DTMF digits on an active call.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn send_dtmf(&mut self, call_id: u64, digits: &str) -> Result<(), ReactorError>;
    /// Shut down the PJSUA library.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn shutdown(&mut self) -> Result<(), ReactorError>;

    /// Resolve `conf_port_id` for a given native call id.
    ///
    /// conf_port_id is **never** stored in `CallEntry` — it lives here.
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn resolve_conf_port(&self, native_call_id: i32) -> Result<i32, ReactorError>;
}

// [::STUB::] P0-6: MockBackend provides canned responses for reactor unit tests.
//                    Full FFI-backed implementation in PjsuaBackend (P0-6).
#[derive(Default)]
pub struct MockBackend {
    pub initialized: bool,
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl MockBackend {
    pub fn new() -> Self {
        Self::default()
    }
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl Backend for MockBackend {
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn initialize(&mut self) -> Result<(), ReactorError> {
        self.initialized = true;
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn create_transport(&mut self) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn add_account(&mut self, _config: &str) -> Result<AccountEntry, ReactorError> {
        Ok(AccountEntry {
            id: 1,
            native_id: 1,
            config: _config.to_string(),
            registration: "Registered".into(),
        })
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn remove_account(&mut self, _account_id: u64) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn set_registration(&mut self, _account_id: u64, _enabled: bool) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn make_call(&mut self, _account_id: u64, _request: &str) -> Result<CallEntry, ReactorError> {
        Ok(CallEntry {
            id: 1,
            native_id: 1,
            account_id: _account_id,
            state: "Calling".into(),
            media: "none".into(),
        })
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn answer_call(&mut self, _call_id: u64) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn hangup(&mut self, _call_id: u64) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn hold(&mut self, _call_id: u64) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn unhold(&mut self, _call_id: u64) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn send_dtmf(&mut self, _call_id: u64, _digits: &str) -> Result<(), ReactorError> {
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn shutdown(&mut self) -> Result<(), ReactorError> {
        self.initialized = false;
        Ok(())
    }

    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn resolve_conf_port(&self, _native_call_id: i32) -> Result<i32, ReactorError> {
        // Return a fixed conf_port_id for testing
        Ok(1)
    }
}
