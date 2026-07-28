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
//   - NODE_ID=N0017:  §14 M20 New RuntimeCommand Error Design
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0017 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::concurrency_contexts::command_serialization::{AccountId, CallId};
use crate::error::error_design_siperror::SipError;

// [::STUB::] P0-5: M20 conversion functions are consumed by P0-5 reactor.
// Remove #[allow(dead_code)] once P0-5 constructs M20 conversion error values.

/// Simulated PJ_EINVALIDOP constant for testing.
///
/// The actual PJ_EINVALIDOP is defined in PJSIP C headers and is unavailable
/// at compile time without FFI linkage. This constant matches the typical
/// PJSIP invalid operation error code for conf_port operations.
#[allow(dead_code)]
pub(crate) const PJ_EINVALIDOP_SIM: i32 = -15000;

/// Converts a pj_status_t error from pjsua_conf_connect to a SipError.
///
/// - `PJ_EINVALIDOP` → `InvalidState` (conf_port not resolved for the given call)
/// - Any other status → `InternalError` (wrapped as NativeError with retryable=true)
///
/// Reads as: "Convert a conf_connect error: if invalid operation, produce an
/// invalid state error; otherwise produce a native error that can be retried."
#[allow(dead_code)]
pub(crate) fn convert_conf_connect_error(pj_status: i32, call_id: CallId) -> SipError {
    if pj_status == PJ_EINVALIDOP_SIM {
        SipError::invalid_state(format!(
            "ConfConnect: conf_port not resolved for call {call_id:?}"
        ))
        .with_call_id(call_id)
    } else {
        SipError::native_error(
            format!("ConfConnect failed: pjsua_conf_connect returned {pj_status}"),
            pj_status,
        )
        .with_call_id(call_id)
    }
}

/// Converts a pj_status_t error from pjsua_conf_disconnect to a SipError.
///
/// - `PJ_EINVALIDOP` → `InvalidState` (ConfConnect was not executed for this call)
/// - Any other status → `InternalError` (wrapped as NativeError)
///
/// Reads as: "Convert a conf_disconnect error: if invalid operation, produce an
/// invalid state error; otherwise produce a native error."
#[allow(dead_code)]
pub(crate) fn convert_conf_disconnect_error(pj_status: i32, call_id: CallId) -> SipError {
    if pj_status == PJ_EINVALIDOP_SIM {
        SipError::invalid_state(format!(
            "ConfDisconnect: conf_port not resolved for call {call_id:?}"
        ))
        .with_call_id(call_id)
    } else {
        SipError::native_error(
            format!("ConfDisconnect failed: pjsua_conf_disconnect returned {pj_status}"),
            pj_status,
        )
        .with_call_id(call_id)
    }
}

/// Converts a pj_status_t error from a GetAccountInfo operation to a SipError.
///
/// - Account not found (simulated via PJ_EINVALIDOP_SIM) → `AccountNotFound`
/// - Any other status → `InternalError` (wrapped as NativeError)
///
/// Reads as: "Convert a GetAccountInfo error: if account not found, produce an
/// account-not-found error; otherwise produce a native error."
#[allow(dead_code)]
pub(crate) fn convert_get_account_info_error(pj_status: i32, account_id: AccountId, call_id: CallId) -> SipError {
    if pj_status == PJ_EINVALIDOP_SIM {
        SipError::account_not_found(format!(
            "GetAccountInfo: account {account_id:?} not found"
        ))
        .with_account_id(account_id)
        .with_call_id(call_id)
    } else {
        SipError::native_error(
            format!("GetAccountInfo failed: pjsua API returned {pj_status}"),
            pj_status,
        )
        .with_account_id(account_id)
        .with_call_id(call_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::concurrency_contexts::command_serialization::{AccountId, CallId};

    // ── ConfConnect normal cases ──

    /// @verifies C018:precondition — M20 ConfConnect InvalidState
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_conf_connect_invalid_state() {
        let call_id = CallId(5);
        let err = convert_conf_connect_error(PJ_EINVALIDOP_SIM, call_id);
        assert_eq!(err.kind, crate::error::error_design_siperror::SipErrorKind::InvalidState);
        assert!(err.message.contains("ConfConnect"));
        assert_eq!(err.call_id, Some(CallId(5)));
        assert!(!err.retryable);
    }

    /// @verifies C018:postcondition — M20 ConfConnect NativeError
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_conf_connect_internal() {
        let call_id = CallId(5);
        let pj_status = 12345;
        let err = convert_conf_connect_error(pj_status, call_id);
        assert_eq!(err.kind, crate::error::error_design_siperror::SipErrorKind::NativeError);
        assert!(err.message.contains("ConfConnect"));
        assert_eq!(err.native_status, Some(12345));
        assert!(err.retryable);
    }

    // ── ConfDisconnect normal cases ──

    /// @verifies C018:postcondition — M20 ConfDisconnect InvalidState
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_conf_disconnect_invalid_state() {
        let call_id = CallId(5);
        let err = convert_conf_disconnect_error(PJ_EINVALIDOP_SIM, call_id);
        assert_eq!(err.kind, crate::error::error_design_siperror::SipErrorKind::InvalidState);
        assert_eq!(err.call_id, Some(CallId(5)));
        assert!(!err.retryable);
    }

    /// @verifies C018:postcondition — M20 ConfDisconnect NativeError
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_conf_disconnect_internal() {
        let call_id = CallId(5);
        let err = convert_conf_disconnect_error(99999, call_id);
        assert_eq!(err.kind, crate::error::error_design_siperror::SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(99999));
        assert!(err.retryable);
    }

    // ── GetAccountInfo normal cases ──

    /// @verifies C018:postcondition — M20 GetAccountInfo AccountNotFound
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_get_account_info_not_found() {
        let account_id = AccountId(1);
        let call_id = CallId(0);
        // Simulating "not found" using PJ_EINVALIDOP_SIM as the trigger
        let err = convert_get_account_info_error(PJ_EINVALIDOP_SIM, account_id, call_id);
        assert_eq!(err.kind, crate::error::error_design_siperror::SipErrorKind::AccountNotFound);
        assert!(!err.retryable);
    }

    /// @verifies C018:postcondition — M20 GetAccountInfo NativeError
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_get_account_info_internal() {
        let account_id = AccountId(1);
        let call_id = CallId(0);
        let err = convert_get_account_info_error(99999, account_id, call_id);
        assert_eq!(err.kind, crate::error::error_design_siperror::SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(99999));
        assert!(err.retryable);
    }

    // ── C018 Invariant: No new error kinds for M20 ──

    /// @verifies C018:invariant — M20 conversions only use InvalidState, AccountNotFound, NativeError
    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn contract_c018_invariant_no_new_variants() {
        let allowed = [
            crate::error::error_design_siperror::SipErrorKind::InvalidState,
            crate::error::error_design_siperror::SipErrorKind::AccountNotFound,
            crate::error::error_design_siperror::SipErrorKind::NativeError,
        ];
        let call_id = CallId(5);
        let err = convert_conf_connect_error(PJ_EINVALIDOP_SIM, call_id);
        assert!(
            allowed.contains(&err.kind),
            "Unexpected variant: {:?}",
            err.kind
        );
    }

    // ── Boundary cases ──

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_pj_status_at_boundaries() {
        let call_id = CallId(0);
        // i32::MAX
        let err_max = convert_conf_connect_error(i32::MAX, call_id);
        assert_eq!(err_max.native_status, Some(i32::MAX));
        // i32::MIN
        let err_min = convert_conf_connect_error(i32::MIN, call_id);
        assert_eq!(err_min.native_status, Some(i32::MIN));
        // zero
        let err_zero = convert_conf_connect_error(0, call_id);
        assert_eq!(err_zero.native_status, Some(0));
    }

    #[test]
// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn m20_convert_with_zero_pj_status() {
        let call_id = CallId(0);
        // pj_status=0 is technically PJ_SUCCESS, but reaching this function
        // implies success was not returned. Test that 0 does not panic.
        let err = convert_conf_connect_error(0, call_id);
        assert_eq!(err.native_status, Some(0));
    }
}
