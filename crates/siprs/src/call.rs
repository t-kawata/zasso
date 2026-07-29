// [::TICKET::] P0-3: SipCall type placeholder.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
//
// [::STUB::] P5-1: Call lifecycle methods (make, answer, hangup, hold, transfer) deferred -- Implement SipCall methods for call lifecycle management

/// Represents a single SIP call session.
///
/// Each `SipCall` tracks the call state, media state, and owning account.
/// It is created by `SipClient::make_call()` or accepted via
/// `SipClient::answer_call()`.
///
// [::STUB::] P5-1: SipCall fields are pub placeholder -- Add private fields with accessors and lifecycle methods (answer, hangup, hold, transfer, send_dtmf)
#[derive(Debug, Clone)]
pub struct SipCall {
    /// Placeholder for `CallId` newtype — replaced in P0-7.
    pub id: u64,
    /// The account this call belongs to.
    pub account_id: u64,
    /// Placeholder for `CallState` — replaced in P4-1.
    pub state: String,
    /// Placeholder for media state — replaced in P1+.
    pub media_state: String,
}
