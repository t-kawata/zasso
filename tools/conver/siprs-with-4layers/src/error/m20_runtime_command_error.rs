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

use crate::error::error_design_siperror::{convert_pj_status, SipError, SipErrorKind};
use crate::model::AccountId;
use crate::runtime::state::AccountEntry;
use crate::state::registr_state_machine::RegistrationState;

// PJSUA status constants come from crate::ffi::constants (P18-1 §62.32),
// shared with error_design_siperror. No local duplicates.
use crate::ffi::constants::{PJ_EINVALIDOP, PJ_SUCCESS};
// [::TICKET::] P18-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-1 --for-spec --no-implementation-order`.

// ---------------------------------------------------------------------------
// M20 RuntimeCommand error converters
// ---------------------------------------------------------------------------

/// §14.1 写像の単一入口 — map a PJSUA `pj_status_t` to a semantic `SipErrorKind`.
///
/// Reads as prose: convert the status, collapsing the non-error `PJ_SUCCESS`
/// answer to `NativeError` so the mapping is total over all `i32`. Known codes
/// map per the §14.1 table; unknown codes fall back to `NativeError`.
// [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
pub(crate) fn classify(status: i32) -> SipErrorKind {
    convert_pj_status(status).unwrap_or(SipErrorKind::NativeError)
}

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
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountInfo {
    /// The account's unique identifier.
    ///
    /// `AccountId` is a NonZeroU64-backed newtype — a native `0` (PJSUA invalid
    /// sentinel) can never be stored.
    pub account_id: AccountId,
    /// The display name associated with the account.
    pub display_name: String,
    /// The SIP URI of the account (e.g., "sip:alice@example.com").
    pub sip_uri: String,
    /// Whether the account is currently registered with the proxy.
    pub registered: bool,
}

// [::TICKET::] P10-1, P10-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3|P15-5) --for-spec --no-implementation-order`.
impl AccountInfo {
    /// Build an `AccountInfo` from the reactor's authoritative `AccountEntry`.
    ///
    /// `display_name` is derived from the stored `AccountConfig`; `sip_uri` is
    /// the AOR built from `username@domain`. A zero `entry.id` maps to
    /// `AccountNotFound` — `AccountId::from_u64(0)` is Err.
    pub fn from_entry(entry: &AccountEntry) -> Result<AccountInfo, SipError> {
        let account_id = AccountId::from_u64(entry.id).map_err(|_| SipError {
            kind: SipErrorKind::AccountNotFound,
            message: format!("GetAccountInfo: account entry has invalid id {}", entry.id),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        })?;
        Ok(AccountInfo {
            account_id,
            display_name: entry.config.display_name.clone().unwrap_or_default(),
            sip_uri: format!("sip:{}@{}", entry.config.username, entry.config.domain),
            registered: entry.registration == RegistrationState::Registered,
        })
    }
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
    account: Option<&AccountEntry>,
    pj_status: i32,
) -> Result<AccountInfo, SipError> {
    let Some(entry) = account else {
        // Account deletion is permanent — not retryable.
        return Err(SipError {
            kind: SipErrorKind::AccountNotFound,
            message: "GetAccountInfo: account not found in state".into(),
            native_status: None,
            account_id: None,
            call_id: None,
            retryable: false,
        });
    };
    if pj_status != PJ_SUCCESS {
        return Err(native_error_with_status(
            pj_status,
            format!("GetAccountInfo failed: pjsua_acc_get_info returned {pj_status}"),
        ));
    }
    AccountInfo::from_entry(entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::bindings::{PJ_EBUSY, PJ_EINVALIDOP, PJ_ENOMEM, PJ_EUNKNOWN, PJ_SUCCESS};
    use crate::model::{AccountId, CallId};
    use crate::runtime::state::AccountEntry;
    use crate::state::registr_state_machine::RegistrationState;

    // A registered account entry as stored by TestBackend::add_account.
    // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
    // [::TICKET::] P15-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-5) --for-spec --no-implementation-order`.
    fn registered_entry() -> AccountEntry {
        AccountEntry {
            id: 1,
            native_id: 1,
            config: crate::config::account_config_spec::AccountConfig {
                username: "alice".into(),
                domain: "example.com".into(),
                ..Default::default()
            },
            registration: RegistrationState::Registered,
        }
    }

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
    // [::TICKET::] P0-4, P11-15, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-4|P11-15|P12-7) --for-spec --no-implementation-order`.
    fn conf_disconnect_other_error_returns_native() {
        let result = convert_conf_disconnect_error(PJ_EBUSY, 42);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
        // ABC O-002 closure: the FFI-error message must keep the operation context so a
        // future reword that drops it (e.g. a bare "pjsua error 150003") fails this test.
        assert!(
            err.message.contains("ConfDisconnect failed"),
            "Message should mention ConfDisconnect: {}",
            err.message
        );
    }

    // ── GetAccountInfo: Normal ────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-4, P9-5, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-4|P9-5|P10-1) --for-spec --no-implementation-order`.
    fn get_account_info_account_not_found_returns_account_not_found() {
        let err =
            convert_get_account_info_error(None, PJ_SUCCESS).expect_err("not-found must fail");
        // P9-5: the not-found error carries the newtype id fields — never a u64.
        let _: Option<AccountId> = err.account_id; // compile-time: Option<AccountId>
        let _: Option<CallId> = err.call_id; // compile-time: Option<CallId>
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
        assert_eq!(err.account_id, None);
        assert_eq!(err.call_id, None);
        assert!(
            !err.retryable,
            "Account deletion is permanent — not retryable"
        );
    }

    #[test]
    // [::TICKET::] P0-4, P10-1, P11-15, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-4|P10-1|P11-15|P12-7) --for-spec --no-implementation-order`.
    fn get_account_info_pjsip_error_returns_native() {
        let result = convert_get_account_info_error(Some(&registered_entry()), PJ_EBUSY);
        let err = result.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::NativeError);
        // ABC O-002 closure: the FFI-error message must keep the operation context so a
        // future reword that drops it (e.g. a bare "pjsua error 150003") fails this test.
        assert!(
            err.message.contains("GetAccountInfo failed"),
            "Message should mention GetAccountInfo: {}",
            err.message
        );
    }

    // ── P9-5: native_error_with_status preserves the i32 diagnostic ──

    #[test]
    // [::TICKET::] P9-5, P11-9, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-5|P11-9|P12-7) --for-spec --no-implementation-order`.
    fn native_error_with_status_sets_native_status_and_newtype_none_ids() {
        // P9-5: the M20 native-error constructor keeps the PJSUA i32 diagnostic
        // but leaves the id fields None of the newtype types — a u64 must never leak.
        let err = native_error_with_status(PJ_EBUSY, "ConfConnect failed");
        let _: Option<AccountId> = err.account_id; // compile-time: Option<AccountId>
        let _: Option<CallId> = err.call_id; // compile-time: Option<CallId>
        assert_eq!(err.kind, SipErrorKind::NativeError);
        assert_eq!(err.native_status, Some(PJ_EBUSY));
        assert_eq!(err.account_id, None);
        assert_eq!(err.call_id, None);
        assert!(err.retryable);
    }

    // ── P15-9: classify — unified §14.1 mapping (C077) ───────────────

    #[test]
    // @verifies C077
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn classify_maps_known_codes_to_native_error() {
        // C077 postcondition: known pj_status_t values map per the §14.1 table.
        assert_eq!(classify(PJ_EUNKNOWN), SipErrorKind::NativeError);
        assert_eq!(classify(PJ_ENOMEM), SipErrorKind::NativeError);
        assert_eq!(classify(PJ_EINVALIDOP), SipErrorKind::NativeError);
        assert_eq!(classify(PJ_EBUSY), SipErrorKind::NativeError);
    }

    #[test]
    // @verifies C077
    // [::TICKET::] P15-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-9 --for-spec --no-implementation-order`.
    fn classify_is_total_over_all_i32_values() {
        // C077 invariant: classify is total — PJ_SUCCESS, unknown codes, and the
        // i32 extremes all map deterministically to NativeError without panicking.
        assert_eq!(classify(PJ_SUCCESS), SipErrorKind::NativeError);
        assert_eq!(classify(-9999), SipErrorKind::NativeError);
        assert_eq!(classify(999_999), SipErrorKind::NativeError);
        assert_eq!(classify(i32::MIN), SipErrorKind::NativeError);
        assert_eq!(classify(i32::MAX), SipErrorKind::NativeError);
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
    // [::TICKET::] P6-2, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P6-2|P10-1) --for-spec --no-implementation-order`.
    fn get_account_info_pjsip_error_keeps_native_status_and_retryable() {
        let err = convert_get_account_info_error(Some(&registered_entry()), PJ_EBUSY).unwrap_err();
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

    // ── Invariant: all converters produce SipError ────────────────────

    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    // @verifies C018
    // [::TICKET::] P0-4, P6-2, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-4|P6-2|P10-1) --for-spec --no-implementation-order`.
    fn m20_converters_return_sip_error_type() {
        // Type assertion: all three converters must yield Result<T, SipError>
        // ABC O-004 closure: convert_get_account_info_error (Result<AccountInfo, SipError>)
        // was previously unasserted — only its error kind was checked indirectly.
        let r1: Result<(), SipError> = convert_conf_connect_error(PJ_SUCCESS, 0);
        let r2: Result<(), SipError> = convert_conf_disconnect_error(PJ_SUCCESS, 0);
        let r3: Result<AccountInfo, SipError> =
            convert_get_account_info_error(Some(&registered_entry()), PJ_SUCCESS);
        let _ = (r1, r2, r3);
    }

    #[test]
    // [::TICKET::] P9-5, P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P9-5|P10-1) --for-spec --no-implementation-order`.
    fn account_info_account_id_is_newtype() -> Result<(), Box<dyn std::error::Error>> {
        // P9-5: AccountInfo.account_id is AccountId — no u64 ID field remains.
        let info = AccountInfo {
            account_id: AccountId::from_u64(1)?,
            display_name: "alice".into(),
            sip_uri: "sip:alice@example.com".into(),
            registered: true,
        };
        let _: AccountId = info.account_id; // compile-time: field is AccountId, not u64
        assert_eq!(info.account_id, AccountId::from_u64(1)?);
        Ok(())
    }

    // ── P10-1: real AccountInfo from a stored AccountEntry ───────────────

    #[test]
    // @verifies C017
    // [::TICKET::] P10-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-1 --for-spec --no-implementation-order`.
    fn get_account_info_success_returns_ok_account_info() -> Result<(), Box<dyn std::error::Error>>
    {
        // The Ok(AccountInfo) path must be reachable: Some(entry) + PJ_SUCCESS.
        let info =
            convert_get_account_info_error(Some(&registered_entry()), PJ_SUCCESS).map_err(|e| {
                format!("registered entry + PJ_SUCCESS must yield Ok(AccountInfo): {e}")
            })?;
        assert_eq!(info.account_id, AccountId::from_u64(1)?);
        assert_eq!(info.sip_uri, "sip:alice@example.com");
        assert!(
            info.registered,
            "registered must be true for a Registered entry"
        );
        Ok(())
    }

    #[test]
    // @verifies C013
    // [::TICKET::] P10-1, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P15-5) --for-spec --no-implementation-order`.
    fn account_info_from_entry_maps_id_and_registered() -> Result<(), Box<dyn std::error::Error>> {
        let info = AccountInfo::from_entry(&registered_entry())?;
        let _: AccountId = info.account_id; // compile-time: field is AccountId, not u64
        assert_eq!(info.account_id, AccountId::from_u64(1)?);
        assert_eq!(
            info.registered,
            registered_entry().registration == RegistrationState::Registered
        );
        Ok(())
    }

    #[test]
    // @verifies C013
    // [::TICKET::] P10-1, P10-3, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3|P15-5) --for-spec --no-implementation-order`.
    fn account_info_from_entry_zero_id_returns_account_not_found() {
        // C013 invariant: AccountId::from_u64(0) is Err (NonZeroU64) — a zero
        // entry.id must map to Err(AccountNotFound), never a stored 0 sentinel.
        let zero_entry = AccountEntry {
            id: 0,
            native_id: 0,
            config: crate::config::account_config_spec::AccountConfig::default(),
            registration: RegistrationState::Registered,
        };
        let err = AccountInfo::from_entry(&zero_entry).expect_err("zero id must fail");
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
        assert!(!err.retryable, "invalid account reference is permanent");
    }
}
