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
//   - NODE_ID=N0023:  §15 M20 RegistrationStateChanged RuntimeCommand Pattern
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0023 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! RegistrationStateChanged RuntimeCommand pattern — `AccountInfoSnapshot` and
//! `convert_registration_state`.
//!
//! ## Design
//!
//! `RegistrationStateChanged` differs from other `NativeEvent` variants because
//! it requires an active PJSIP API call (`pjsua_acc_get_info()`) to resolve
//! the registration status. This is implemented via
//! `RuntimeCommand::GetAccountInfo` in the reactor.
//!
//! This module provides:
//!
//! - [`AccountInfoSnapshot`] — A structure holding the result of
//!   `pjsua_acc_get_info()`. Carries `Debug + Clone` for testability.
//! - [`convert_registration_state`] — A pure function that maps a SIP status
//!   code to either `SipEventPayload::RegistrationSucceeded` (for 200 OK) or
//!   `SipEventPayload::RegistrationFailed` (for any other status).
//!
//! ## Testing strategy
//!
//! The full flow (NativeEvent::RegistrationStateChanged → GetAccountInfo →
//! publish) requires `MockBackend`, which is not yet implemented. We test the
//! pure conversion function directly and verify `AccountInfoSnapshot` satisfies
//! its required traits.

use crate::api::event_model_payload_bus::SipEventPayload;
use crate::concurrency_contexts::command_serialization::AccountId;

// ---------------------------------------------------------------------------
// AccountInfoSnapshot
// ---------------------------------------------------------------------------

/// Snapshot of the account information returned by `pjsua_acc_get_info()`.
///
/// Contains only the fields needed for registration status resolution.
/// All fields are derived directly from the PJSIP API response.
#[derive(Debug, Clone)]
pub(crate) struct AccountInfoSnapshot {
    /// The account ID this snapshot belongs to.
    pub acc_id: AccountId,
    /// The SIP registration status code (e.g., 200 = OK, 403 = Forbidden).
    pub registration_status: u16,
    /// Registration expiry time in seconds. `None` when not applicable.
    pub registration_expires: Option<u32>,
    /// Whether the account is online.
    pub online_status: bool,
    /// The SIP URI of the account (e.g., "sip:user@domain").
    pub uri: String,
}

// ---------------------------------------------------------------------------
// convert_registration_state
// ---------------------------------------------------------------------------

/// Converts a SIP registration status code into a [`SipEventPayload`].
///
/// Returns `RegistrationSucceeded` when `status_code` is 200. Returns
/// `RegistrationFailed` for all other status codes (including 0, 1xx, 3xx,
/// 4xx, 5xx, 6xx). This function never panics.
///
/// # Arguments
///
/// * `status_code` — The SIP status code from `pjsua_acc_get_info()`.
pub(crate) fn convert_registration_state(status_code: u16) -> SipEventPayload {
    match status_code {
        200 => SipEventPayload::RegistrationSucceeded,
        _ => SipEventPayload::RegistrationFailed,
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C024-precondition: convert_registration_state signature exists ────
    // -----------------------------------------------------------------------

    /// @verifies C024-precondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn convert_registration_state_signature_exists() {
        let _ = convert_registration_state as fn(u16) -> SipEventPayload;
    }

    // -----------------------------------------------------------------------
    // ── C024-postcondition: status_code conversion ────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C024-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn status_code_200_returns_registration_succeeded() {
        assert_eq!(
            convert_registration_state(200),
            SipEventPayload::RegistrationSucceeded
        );
    }

    /// @verifies C024-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn status_code_403_returns_registration_failed() {
        assert_eq!(
            convert_registration_state(403),
            SipEventPayload::RegistrationFailed
        );
    }

    /// @verifies C024-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn status_code_500_returns_registration_failed() {
        assert_eq!(
            convert_registration_state(500),
            SipEventPayload::RegistrationFailed
        );
    }

    /// @verifies C024-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn status_code_603_returns_registration_failed() {
        assert_eq!(
            convert_registration_state(603),
            SipEventPayload::RegistrationFailed
        );
    }

    // -----------------------------------------------------------------------
    // ── C024-postcondition: AccountInfoSnapshot Debug + Clone ────────────
    // -----------------------------------------------------------------------

    /// @verifies C024-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn account_info_snapshot_is_debug_and_clone() {
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_debug::<AccountInfoSnapshot>();
        assert_clone::<AccountInfoSnapshot>();
    }

    /// @verifies C024-postcondition
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn account_info_snapshot_constructible() {
        let snapshot = AccountInfoSnapshot {
            acc_id: 1,
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:user@domain".to_string(),
        };
        assert_eq!(snapshot.acc_id, 1);
        assert_eq!(snapshot.registration_status, 200);
        assert_eq!(snapshot.registration_expires, Some(3600));
        assert!(snapshot.online_status);
        assert_eq!(snapshot.uri, "sip:user@domain");
    }

    // -----------------------------------------------------------------------
    // ── C024-invariant: no-panic guarantee ────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C024-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn convert_registration_state_never_panics() {
        // All possible status code categories should return without panicking.
        for code in [0u16, 100, 180, 302, 404, 503, 600, 999] {
            let result = convert_registration_state(code);
            match result {
                SipEventPayload::RegistrationSucceeded | SipEventPayload::RegistrationFailed => {}
                _ => {
                    panic!("convert_registration_state returned unexpected variant for code {code}")
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // ── C022-invariant: Registration variants constructible ──────────────
    // -----------------------------------------------------------------------

    /// @verifies C022-invariant
    #[test]
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn registration_succeeded_and_failed_are_constructible() {
        let _ = SipEventPayload::RegistrationSucceeded;
        let _ = SipEventPayload::RegistrationFailed;
    }
}
