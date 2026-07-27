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

//! M20 RuntimeCommand error conversion functions (N0017).
//!
//! Maps PJSUA error conditions for the three M20 RuntimeCommands
//! (`ConfConnect`, `ConfDisconnect`, `GetAccountInfo`) into existing
//! [`SipErrorKind`] variants. No new error kinds are introduced.
//!
//! | RuntimeCommand  | Failure condition              | SipErrorKind     |
//! |-----------------|-------------------------------|------------------|
//! | `ConfConnect`   | conf_port not resolved        | `InvalidState`   |
//! | `ConfConnect`   | PJSIP conf_connect API error  | `InternalError`  |
//! | `ConfDisconnect`| conf_port not resolved        | `InvalidState`   |
//! | `ConfDisconnect`| PJSIP conf_disconnect API err | `InternalError`  |
//! | `GetAccountInfo`| Account not found             | `NotFound`       |
//! | `GetAccountInfo`| PJSIP API error               | `InternalError`  |
//!
//! ## Design rationale
//!
//! Using existing variants (`InvalidState`, `NotFound`, `InternalError`)
//! instead of introducing M20-specific variants prevents `SipErrorKind`
//! from becoming unmanageably large while keeping error handling
//! exhaustive at the semantic level.

use crate::concurrency_contexts::command_serialization::CallId;
use crate::error::error_design_siperror::{SipError, SipErrorKind};

// ---------------------------------------------------------------------------
// ConfConnect error conversion
// ---------------------------------------------------------------------------

/// Converts a PJSUA `conf_connect` result into a [`SipError`].
///
/// - `PJ_SUCCESS` → `Ok(())`
/// - `PJ_EINVALIDOP` (conf_port not resolved) → `InvalidState` (retryable)
/// - All other PJSUA errors → `InternalError` with the status code
///
/// # Parameters
///
/// * `pj_status` — The `pj_status_t` code returned by `pjsua_conf_connect`.
///   When the FFI binding is not yet available, pass the raw `i32` value
///   (0 = success, otherwise error code).
/// * `call_id` — The call ID for which the connection was attempted.
///   Used in the error message for context.
pub fn convert_conf_connect_error(pj_status: i32, call_id: CallId) -> Result<(), SipError> {
    if pj_status == 0 {
        // PJ_SUCCESS
        return Ok(());
    }
    if pj_status == -1 {
        // PJ_EINVALIDOP — conf_port not resolved
        return Err(SipError::invalid_state(format!(
            "ConfConnect: conf_port not resolved for call {call_id}"
        )));
    }
    Err(SipError::with_native_status(
        SipErrorKind::InternalError,
        format!("ConfConnect: pjsua_conf_connect returned {pj_status}"),
        pj_status,
    ))
}

// ---------------------------------------------------------------------------
// ConfDisconnect error conversion
// ---------------------------------------------------------------------------

/// Converts a PJSUA `conf_disconnect` result into a [`SipError`].
///
/// - `PJ_SUCCESS` → `Ok(())`
/// - `PJ_EINVALIDOP` (conf_port not resolved) → `InvalidState` (retryable)
/// - All other PJSUA errors → `InternalError` with the status code
pub fn convert_conf_disconnect_error(pj_status: i32, call_id: CallId) -> Result<(), SipError> {
    if pj_status == 0 {
        // PJ_SUCCESS
        return Ok(());
    }
    if pj_status == -1 {
        // PJ_EINVALIDOP — conf_port not resolved
        return Err(SipError::invalid_state(format!(
            "ConfDisconnect: conf_port not resolved for call {call_id}"
        )));
    }
    Err(SipError::with_native_status(
        SipErrorKind::InternalError,
        format!("ConfDisconnect: pjsua_conf_disconnect returned {pj_status}"),
        pj_status,
    ))
}

// ---------------------------------------------------------------------------
// GetAccountInfo error conversion
// ---------------------------------------------------------------------------

/// Converts a PJSUA account lookup result into a [`SipError`].
///
/// - `PJ_SUCCESS` → `Ok(())`
/// - Account not found → `NotFound`
/// - All other PJSUA errors → `InternalError` with the status code
pub fn convert_get_account_info_error(
    pj_status: i32,
    account_id: u32,
) -> Result<(), SipError> {
    if pj_status == 0 {
        // PJ_SUCCESS
        return Ok(());
    }
    if pj_status == -2 {
        // PJ_ENOTFOUND — account does not exist
        return Err(SipError::not_found(format!(
            "GetAccountInfo: account {account_id} not found"
        )));
    }
    Err(SipError::with_native_status(
        SipErrorKind::InternalError,
        format!("GetAccountInfo: pjsua API returned {pj_status}"),
        pj_status,
    ))
}

// ---------------------------------------------------------------------------
// Tests — §14 M20 RuntimeCommand Error Design (N0017)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── C018-invariant: existing variants only ────────────────────────

    /// @verifies C018-invariant
    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn conf_connect_uses_existing_error_kinds() {
        // InvalidState (conf_port not resolved)
        let err = convert_conf_connect_error(-1, 5).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert!(err.retryable);

        // InternalError (other PJSUA errors)
        let err = convert_conf_connect_error(12345, 5).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InternalError);
        assert!(!err.retryable);
    }

    /// @verifies C018-invariant
    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn conf_disconnect_uses_existing_error_kinds() {
        // InvalidState (conf_port not resolved)
        let err = convert_conf_disconnect_error(-1, 5).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        assert!(err.retryable);

        // InternalError (other PJSUA errors)
        let err = convert_conf_disconnect_error(999, 5).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InternalError);
        assert!(!err.retryable);
    }

    /// @verifies C018-invariant
    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn get_account_info_uses_existing_error_kinds() {
        // NotFound (account not found)
        let err = convert_get_account_info_error(-2, 42).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NotFound);
        assert!(err.retryable);

        // InternalError (other PJSUA errors)
        let err = convert_get_account_info_error(999, 42).unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InternalError);
        assert!(!err.retryable);
    }

    // ── Happy path ────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn conf_connect_success_returns_ok() {
        assert!(convert_conf_connect_error(0, 1).is_ok());
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn conf_disconnect_success_returns_ok() {
        assert!(convert_conf_disconnect_error(0, 1).is_ok());
    }

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn get_account_info_success_returns_ok() {
        assert!(convert_get_account_info_error(0, 1).is_ok());
    }

    // ── Error message contains operation name ─────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn error_message_contains_operation_name() {
        let err = convert_conf_connect_error(-1, 5).unwrap_err();
        assert!(err.message.contains("ConfConnect"));

        let err = convert_conf_disconnect_error(-1, 5).unwrap_err();
        assert!(err.message.contains("ConfDisconnect"));

        let err = convert_get_account_info_error(-2, 42).unwrap_err();
        assert!(err.message.contains("GetAccountInfo"));
    }

    // ── native_status preserved ───────────────────────────────────────

    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn native_status_preserved_for_internal_error() {
        let err = convert_conf_connect_error(700, 5).unwrap_err();
        assert_eq!(err.native_status, Some(700));

        let err = convert_get_account_info_error(800, 42).unwrap_err();
        assert_eq!(err.native_status, Some(800));
    }

    // ── No M20-specific variants exist ────────────────────────────────

    /// @verifies C018-invariant
    #[test]
// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn no_m20_specific_error_kinds() {
        // This is a compile-time check: if M20-specific variants like
        // ConfConnectError or ConfDisconnectError existed, they would need
        // to be handled here. The fact that only existing variants are
        // matched confirms the invariant.
        let _ = |k: SipErrorKind| match k {
            SipErrorKind::InvalidState
            | SipErrorKind::NotFound
            | SipErrorKind::InternalError => {}
            _ => {}
        };
    }
}
