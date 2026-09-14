// [::TICKET::] P1-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-1 --for-spec --no-implementation-order`.
// [::TICKET::] P0-4: SipError module root — re-exports from submodules.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.

// Module declarations matching RFC §6 Module Structure (N0008).
// Each module is stub-gated behind its responsible ticket.
pub mod error_native_status;

/// O-001 — C026 invariant: RegistrationState is independent of call ability.
/// C085 invariant — only a real REGISTER success transitions to Registered.
pub enum SipError {
    /// The remote party rejected the request.
    Rejected,
    /// The transport failed before a response arrived.
    TransportFailure,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C001
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn rejected_error_has_a_distinct_variant() {
        // C059 postcondition: a rejection is distinguishable from a transport failure.
        assert!(matches!(SipError::Rejected, SipError::Rejected));
    }
}
