// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0027:  §19 Call API & Answer Semantics
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0027 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::call::HangupReason;
use crate::config::account_config_spec::{DtmfMethod, DtmfPolicy};
use crate::error::SipError;
use crate::state::call_state_model::CallState;

/// Characters valid in a DTMF digit string (RFC 4733).
///
/// Digits 0-9, letters A-D, and the tone keys `#` and `*`. Lowercase input is
/// accepted and normalised to uppercase by `validate_dtmf_digits`.
const DTMF_ALPHABET: &str = "0123456789ABCD*#";

/// Call lifecycle contract (RFC §19, N0027).
///
/// Implemented by [`crate::call::SipCall`]. Every method validates the current
/// call state against the RFC §18 transition table before mutating state; an
/// illegal transition returns `SipErrorKind::InvalidState` (C028) and leaves
/// the call state unchanged.
pub trait CallApiSemantics {
    /// Answer an incoming call with the given SIP code (RFC §19.1).
    ///
    /// Only valid while the call is `CallState::Incoming` (C028); the call
    /// transitions to `CallState::Connecting`.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn answer(&mut self, code: u16) -> Result<(), SipError>;
    /// Hang up the call with the given reason.
    ///
    /// Valid from any non-terminal state; the call transitions to
    /// `CallState::Disconnecting`.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hangup(&mut self, reason: HangupReason) -> Result<(), SipError>;
    /// Place the call on hold. Valid only from `CallState::Active`.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hold(&mut self) -> Result<(), SipError>;
    /// Resume a held call. Valid only from `CallState::Held`.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn unhold(&mut self) -> Result<(), SipError>;
    /// Blind-transfer the call to the given target URI.
    ///
    /// Valid only from `CallState::Active`; the call transitions to
    /// `CallState::Transferring` and records the target (C049).
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn transfer(&mut self, target: String) -> Result<(), SipError>;
    /// Send DTMF digits out-of-band. Valid only from `CallState::Active`.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn send_dtmf(&mut self, digits: &str, method: DtmfMethod) -> Result<(), SipError>;
    /// Return the current signalling state.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn call_state(&self) -> CallState;
}

/// Validate a DTMF digit string: non-empty and composed only of DTMF-valid
/// characters (`0-9`, `A-D`, `#`, `*`; lowercase `a-d` is accepted).
pub fn validate_dtmf_digits(digits: &str) -> Result<(), SipError> {
    if digits.is_empty() {
        return Err(SipError::invalid_argument("DTMF digits must not be empty"));
    }
    for ch in digits.chars() {
        let upper = ch.to_ascii_uppercase();
        if !DTMF_ALPHABET.contains(upper) {
            return Err(SipError::invalid_argument(format!(
                "invalid DTMF digit: {ch}"
            )));
        }
    }
    Ok(())
}

/// Validate a DTMF send method against the account [`DtmfPolicy`].
///
/// The method must be listed in `policy.send_methods`; otherwise the send is
/// rejected with `SipErrorKind::InvalidArgument`.
pub fn validate_dtmf_send_method(method: DtmfMethod, policy: &DtmfPolicy) -> Result<(), SipError> {
    if policy.send_methods.contains(&method) {
        Ok(())
    } else {
        Err(SipError::invalid_argument(format!(
            "DTMF method {method:?} is not allowed by the account policy"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::call::SipCall;
    use crate::error::SipErrorKind;
    use crate::model::{AccountId, CallId};
    use crate::state::m20_callstate_mapping::CallMediaState;

    /// Build a minimal `SipCall` fixture in the given signalling state.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn sip_call(state: CallState) -> Result<SipCall, Box<dyn std::error::Error>> {
        Ok(SipCall::new(
            AccountId::from_u64(1)?,
            CallId::from_u64(1)?,
            state,
            CallMediaState::Active,
        ))
    }

    /// @verifies C028
    #[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn sip_call_implements_call_api_semantics() -> Result<(), Box<dyn std::error::Error>> {
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
        fn assert_trait<T: CallApiSemantics>() {}
        assert_trait::<SipCall>();
        let mut call = sip_call(CallState::Incoming)?;
        assert!(call.answer(200).is_ok());
        assert_eq!(call.call_state(), CallState::Connecting);
        Ok(())
    }

    /// @verifies C028
    #[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn validate_dtmf_digits_accepts_valid_alphabet() {
        assert!(validate_dtmf_digits("123#*ABCD").is_ok());
        assert!(validate_dtmf_digits("1").is_ok());
        assert!(validate_dtmf_digits("abcd").is_ok());
    }

    /// @verifies C028
    #[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn validate_dtmf_digits_rejects_empty_and_invalid() {
        assert_eq!(
            validate_dtmf_digits("")
                .expect_err("empty digits must fail")
                .kind,
            SipErrorKind::InvalidArgument
        );
        assert_eq!(
            validate_dtmf_digits("1x2")
                .expect_err("non-DTMF char must fail")
                .kind,
            SipErrorKind::InvalidArgument
        );
    }

    /// @verifies C028
    #[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn validate_dtmf_send_method_rejects_disallowed_method() {
        let policy = DtmfPolicy {
            send_methods: vec![DtmfMethod::Info],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Info,
        };
        assert!(validate_dtmf_send_method(DtmfMethod::Info, &policy).is_ok());
        assert_eq!(
            validate_dtmf_send_method(DtmfMethod::Rfc4733, &policy)
                .expect_err("method outside send_methods must fail")
                .kind,
            SipErrorKind::InvalidArgument
        );
    }

    /// @verifies C028
    #[test]
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hangup_reason_flows_through_trait() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;
        assert!(call.hangup(HangupReason::RemoteHangup).is_ok());
        assert_eq!(call.state(), CallState::Disconnecting);
        Ok(())
    }
}
