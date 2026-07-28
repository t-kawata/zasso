// [::TICKET::] P0-3: SipAccount type placeholder.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
//
// [::STUB::] P3-1: Full SIP account management implementation (N0025, N0026).
// This file currently provides the structural type skeleton. Account
// registration, authentication, and lifecycle management are deferred
// to P3-1 (Public API Surface & Account/Transport Configuration) when
// the FFI layer (P3-2) is available to drive pjsua_acc_* APIs.

/// Represents a SIP account on the PJSUA stack.
///
/// Each `SipAccount` maps to a logical SIP identity (AOR) registered
/// with a SIP proxy. It carries authentication credentials, registration
/// state, and a reference to its owning `SipClient`.
///
/// [::STUB::] P3-1: Replace `pub` fields with proper `get_*` accessors
/// and add account lifecycle methods (register, unregister, modify).
#[derive(Debug, Clone)]
pub struct SipAccount {
    /// Placeholder for `AccountId` newtype — replaced in P0-7.
    pub id: u64,
    /// Placeholder for `AccountConfig` — replaced in P0-7.
    pub config: String,
    /// Registration state — placeholder for `RegistrationState`.
    pub registration_state: String,
}
