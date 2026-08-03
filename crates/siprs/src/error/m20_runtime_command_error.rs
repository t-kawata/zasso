// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.

// [::TICKET::] P3-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-2 --for-spec --no-implementation-order`.

// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.

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

use crate::error::error_design_siperror::{SipError, SipErrorKind};

// ---------------------------------------------------------------------------
// PJSUA error code constants (shared with error_design_siperror)
//
// [::TICKET::] P3-2: ffi::bindings provides PJ_SUCCESS, PJ_EUNKNOWN via FFI type aliases.
// [::STUB::] P4-2: pj_status_t constants hand-coded (PJ_EINVALIDOP, PJ_EBUSY) -- Replace with bindgen-generated constants from pjsua.h once FFI is enabled
// ---------------------------------------------------------------------------

/// PJ_SUCCESS — no error.
const PJ_SUCCESS: i32 = 0;
/// PJ_EINVALIDOP — invalid operation.
const PJ_EINVALIDOP: i32 = 150002;

// ---------------------------------------------------------------------------
// M20 RuntimeCommand error converters
// ---------------------------------------------------------------------------

/// Build a `NativeError` `SipError` that preserves the PJSUA diagnostic code.
///
/// Unlike `SipError::internal_error()` (which leaves `native_status` as `None`),
/// this constructor keeps the FFI status in `native_status` so callers can log
/// the exact PJSUA code. FFI errors are treated as retryable (`retryable=true`)
/// because most PJSUA failures are transient (resource contention, network).
// [::TICKET::] P6-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-2 --for-spec --no-implementation-order`.
fn native_error_with_status(pj_status: i32, message: impl Into<String>) -> SipError {
    SipError {
        kind: SipErrorKind::NativeError,
        message: message.into(),
        native_status: Some(pj_status),
        retryable: true,
        account_id: None,
        call_id: None,
    }
}

/// Convert the result of a `ConfConnect` PJSIP operation into a `SipError`.
///
/// Failure conditions (per RFC §14 N0017):
/// - `PJ_EINVALIDOP`: `conf_port` not resolved for the given `call_id`
///   → `InvalidState` (media not active for this call)
/// - Other PJSIP error: generic `NativeError` with diagnostic message
///
/// # Returns
/// - `Ok(())` if `pj_status == PJ_SUCCESS`
/// - `Err(SipError)` with appropriate kind otherwise
pub fn convert_conf_connect_error(pj_status: i32, call_id: u64) -> Result<(), SipError> {
    if pj_status == PJ_SUCCESS {
        return Ok(());
    }
    // conf_port unresolved is detected via PJ_EINVALIDOP
    if pj_status == PJ_EINVALIDOP {
        return Err(SipError::invalid_state(format!(
            "ConfConnect: conf_port not resolved for call {call_id}"
        )));
    }
    Err(native_error_with_status(
        pj_status,
        format!("ConfConnect failed: pjsua_conf_connect returned {pj_status}"),
    ))
}

/// Convert the result of a `ConfDisconnect` PJSIP operation into a `SipError`.
///
/// Failure conditions (per RFC §14 N0017):
/// - `PJ_EINVALIDOP`: `conf_port` not resolved (ConfConnect was not called)
///   → `InvalidState`
/// - Other PJSIP error: generic `NativeError` with diagnostic message
///
/// # Returns
/// - `Ok(())` if `pj_status == PJ_SUCCESS`
/// - `Err(SipError)` with appropriate kind otherwise
pub fn convert_conf_disconnect_error(pj_status: i32, call_id: u64) -> Result<(), SipError> {
    if pj_status == PJ_SUCCESS {
        return Ok(());
    }
    if pj_status == PJ_EINVALIDOP {
        return Err(SipError::invalid_state(format!(
            "ConfDisconnect: conf_port not resolved for call {call_id}"
        )));
    }
    Err(native_error_with_status(
        pj_status,
        format!("ConfDisconnect failed: pjsua_conf_disconnect returned {pj_status}"),
    ))
}

/// Information about a SIP account, returned by `GetAccountInfo` on success.
///
// [::STUB::] P5-1: AccountInfo uses u64 for account_id instead of AccountId newtype -- Migrate to AccountId/CallId newtypes once P4-1 types are stable across callers
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountInfo {
    /// The account's unique identifier.
    pub account_id: u64,
    /// The display name associated with the account.
    pub display_name: String,
    /// The SIP URI of the account (e.g., "sip:alice@example.com").
    pub sip_uri: String,
    /// Whether the account is currently registered with the proxy.
    pub registered: bool,
}

/// Convert the result of a `GetAccountInfo` PJSIP operation into a typed result.
///
/// Failure conditions (per RFC §14 N0017):
/// - Account does not exist in state → `AccountNotFound` (retryable=false,
///   permanent deletion or invalid reference)
/// - PJSIP API error → `NativeError` with `native_status` set
///
/// # Returns
/// - `Ok(AccountInfo)` if the account exists and PJSIP succeeds
/// - `Err(SipError)` with appropriate kind otherwise
pub fn convert_get_account_info_error(
    account_exists: bool,
    pj_status: i32,
) -> Result<AccountInfo, SipError> {
    if !account_exists {
        // Account deletion is permanent — not retryable.
        return Err(SipError {
            kind: SipErrorKind::AccountNotFound,
            message: "GetAccountInfo: account not found in state".into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        });
    }
    if pj_status != PJ_SUCCESS {
        return Err(native_error_with_status(
            pj_status,
            format!("GetAccountInfo failed: pjsua_acc_get_info returned {pj_status}"),
        ));
    }
    // [::STUB::] P3-1: GetAccountInfo returns placeholder error -- Return real AccountInfo from reactor account state system once implemented
    Err(SipError::new(
        SipErrorKind::NativeError,
        "GetAccountInfo: account state not yet available (P3-1)".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // PJ_EBUSY is a test-only constant here: the production converters branch on
    // PJ_SUCCESS / PJ_EINVALIDOP only, so the busy sentinel lives in the test module
    // (this removes the production dead-code suppression that used to accompany it).
    const PJ_EBUSY: i32 = 150003;

    // ── ConfConnect: Normal ──────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_connect_success_returns_ok() {
        let result = convert_conf_connect_error(PJ_SUCCESS, 42);
        assert!(result.is_ok());
    }

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_connect_einval_op_returns_invalid_state() {
        let result = convert_conf_connect_error(PJ_EINVALIDOP, 42);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert!(
            err.message.contains("conf_port not resolved"),
            "Message should mention conf_port: {}",
            err.message
        );
        assert!(
            err.message.contains("42"),
            "Message should include call_id: {}",
            err.message
        );
    }

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_connect_other_error_returns_native() {
        let result = convert_conf_connect_error(PJ_EBUSY, 42);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert!(
            err.message.contains("ConfConnect failed"),
            "Message should mention ConfConnect: {}",
            err.message
        );
    }

    // ── ConfDisconnect: Normal ────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_disconnect_success_returns_ok() {
        let result = convert_conf_disconnect_error(PJ_SUCCESS, 42);
        assert!(result.is_ok());
    }

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_disconnect_einval_op_returns_invalid_state() {
        let result = convert_conf_disconnect_error(PJ_EINVALIDOP, 42);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert!(
            err.message.contains("conf_port not resolved"),
            "Message should mention conf_port: {}",
            err.message
        );
    }

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_disconnect_other_error_returns_native() {
        let result = convert_conf_disconnect_error(PJ_EBUSY, 42);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
    }

    // ── GetAccountInfo: Normal ────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn get_account_info_account_not_found_returns_account_not_found() {
        let result = convert_get_account_info_error(false, PJ_SUCCESS);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
        assert!(
            !err.retryable,
            "Account deletion is permanent — not retryable"
        );
    }

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn get_account_info_pjsip_error_returns_native() {
        let result = convert_get_account_info_error(true, PJ_EBUSY);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
    }

    // ── Error: native_status / retryable preservation (O-003) ────────

    #[test]
    // @verifies C018
    // [::TICKET::] P6-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-2 --for-spec --no-implementation-order`.
    fn conf_connect_other_error_keeps_native_status_and_retryable() {
        // ABC O-003 closure: a non-EINVALIDOP PJSIP error must preserve the FFI
        // diagnostic code in native_status and be marked retryable. This failed RED
        // before the fix because convert_conf_connect_error delegated to
        // SipError::internal_error(), which hardcodes native_status=None.
        let err = convert_conf_connect_error(PJ_EBUSY, 42).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(PJ_EBUSY));
        assert!(err.retryable);
    }

    #[test]
    // @verifies C018
    // [::TICKET::] P6-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-2 --for-spec --no-implementation-order`.
    fn conf_disconnect_other_error_keeps_native_status_and_retryable() {
        let err = convert_conf_disconnect_error(PJ_EBUSY, 42).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(PJ_EBUSY));
        assert!(err.retryable);
    }

    #[test]
    // @verifies C018
    // [::TICKET::] P6-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-2 --for-spec --no-implementation-order`.
    fn get_account_info_pjsip_error_keeps_native_status_and_retryable() {
        let err = convert_get_account_info_error(true, PJ_EBUSY).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(PJ_EBUSY));
        assert!(err.retryable);
    }

    #[test]
    // @verifies C018
    // [::TICKET::] P6-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-2 --for-spec --no-implementation-order`.
    fn m20_converter_distinguishes_state_error_from_ffi_error() {
        // Semantic boundary: an unresolved conf_port (PJ_EINVALIDOP) is a state error
        // (native_status=None, retryable=false); any other non-zero code is an FFI
        // error (native_status=Some(code), retryable=true).
        let state_err = convert_conf_connect_error(PJ_EINVALIDOP, 42).unwrap_err();
        assert_eq!(state_err.kind, SipErrorKind::InvalidState);
        assert_eq!(state_err.native_status, None);
        assert!(!state_err.retryable);

        let ffi_err = convert_conf_connect_error(-9999, 1).unwrap_err();
        assert_eq!(ffi_err.kind, SipErrorKind::NativeError);
        assert_eq!(ffi_err.native_status, Some(-9999));
        assert!(ffi_err.retryable);
    }

    // ── Error: non-standard error codes ───────────────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_connect_unknown_error_falls_back_to_native() {
        let result = convert_conf_connect_error(-9999, 1);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
    }

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_disconnect_unknown_error_falls_back_to_native() {
        let result = convert_conf_disconnect_error(-9999, 1);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
    }

    // ── Boundary: zero call_id ────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn conf_connect_with_call_id_zero() {
        let result = convert_conf_connect_error(PJ_EINVALIDOP, 0);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert!(
            err.message.contains("call 0"),
            "Message should reference call_id=0: {}",
            err.message
        );
    }

    // ── Invariant: all converters return SipError ─────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    // @verifies C018
    // [::TICKET::] P0-4, P6-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-4|P6-2) --for-spec --no-implementation-order`.
    fn m20_converters_return_sip_error_type() {
        // Type assertion: all three converters must return Result<T, SipError>
        // ABC O-004 closure: convert_get_account_info_error (Result<AccountInfo, SipError>)
        // was previously unasserted — only its error kind was checked indirectly.
        let r1: Result<(), SipError> = convert_conf_connect_error(PJ_SUCCESS, 0);
        let r2: Result<(), SipError> = convert_conf_disconnect_error(PJ_SUCCESS, 0);
        let r3: Result<AccountInfo, SipError> = convert_get_account_info_error(true, PJ_SUCCESS);
        let _ = (r1, r2, r3);
    }
}
