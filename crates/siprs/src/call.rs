// [::TICKET::] P0-3: SipCall type placeholder.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
//
// [::STUB::] P9-3: SipCall lifecycle and fields are placeholders; call API semantics are deferred (covers call.rs:4,12) -- Implement SipCall with private fields and accessors and call lifecycle methods (make, answer, hangup, hold, transfer, send_dtmf) per the Call API & Answer Semantics spec (NODE_ID=N0027)

/// Represents a single SIP call session.
///
/// Each `SipCall` tracks the call state, media state, and owning account.
/// It is created by `SipClient::make_call()` or accepted via
/// `SipClient::answer_call()`.
///
#[derive(Debug, Clone)]
pub struct SipCall {
    /// Placeholder for `CallId` newtype — replaced in P5-1.
    pub id: u64,
    /// The account this call belongs to.
    pub account_id: u64,
    /// Placeholder for `CallState` — replaced in P4-1.
    pub state: String,
    /// Placeholder for media state — replaced in P1+.
    pub media_state: String,
}
