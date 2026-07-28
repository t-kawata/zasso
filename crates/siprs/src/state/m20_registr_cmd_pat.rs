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
// [::STUB::] P1-2: AccountInfoSnapshot and registration_state_to_event are the
// registration-event API surface consumed by the reactor layer (P0-5).
// Dead-code warnings are expected until consumers exist. Once P0-5 ships,
// remove this allow.
#![allow(dead_code)]
// ============================================================================

use crate::concurrency_contexts::command_serialization::AccountId;
use crate::state::m20_native_event_conv::SipEventPayload;

// ============================================================================
// AccountInfoSnapshot
// ============================================================================

/// Snapshot of an account's registration state obtained via pjsua_acc_get_info().
///
/// Carries the minimum information needed to produce RegistrationSucceeded or
/// RegistrationFailed events. The fields match the RFC §15 M20 definition.
///
/// Reads as: "A snapshot of account info with registration status, expiry,
/// online status, and URI."
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AccountInfoSnapshot {
    pub acc_id: AccountId,
    pub registration_status: u16,
    pub registration_expires: Option<u32>,
    pub online_status: bool,
    pub uri: String,
}

// ============================================================================
// Conversion function
// ============================================================================

/// Converts an AccountInfoSnapshot into the appropriate Registration event.
///
/// Returns:
///   - RegistrationSucceeded when registration_status == 200 (OK)
///   - RegistrationFailed for any other status (4xx/5xx/6xx, 0, timeout)
///
/// Reads as: "Convert account info to a registration event: if status is 200
/// report success; otherwise report failure."
pub(crate) fn registration_state_to_event(snapshot: &AccountInfoSnapshot) -> SipEventPayload {
    if snapshot.registration_status == 200 {
        SipEventPayload::RegistrationSucceeded
    } else {
        SipEventPayload::RegistrationFailed
    }
}

// ============================================================================
// PHASE RED — Tests (written before implementation)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::concurrency_contexts::command_serialization::AccountId;

    // =======================================================================
    // C024-precondition — AccountInfoSnapshot is constructable
    // =======================================================================

    /// @verifies C024-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_precondition_account_info_snapshot_is_constructable() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(1),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:user@example.com".to_string(),
        };
        assert_eq!(snapshot.acc_id, AccountId(1));
        assert_eq!(snapshot.registration_status, 200);
        assert_eq!(snapshot.registration_expires, Some(3600));
        assert!(snapshot.online_status);
        assert_eq!(snapshot.uri, "sip:user@example.com");
    }

    /// @verifies C024-precondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_precondition_snapshot_is_debug_and_clone() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(1),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:user@example.com".to_string(),
        };
        let _debug = format!("{:?}", snapshot);
        let _cloned = snapshot.clone();
    }

    // =======================================================================
    // C024-postcondition — status=200 → RegistrationSucceeded
    // =======================================================================

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_postcondition_status_200_returns_registration_succeeded() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(1),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:user@example.com".to_string(),
        };
        let result = registration_state_to_event(&snapshot);
        assert_eq!(result, SipEventPayload::RegistrationSucceeded);
    }

    // =======================================================================
    // C024-postcondition — non-200 status → RegistrationFailed
    // =======================================================================

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_postcondition_status_401_returns_registration_failed() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(1),
            registration_status: 401,
            registration_expires: Some(0),
            online_status: false,
            uri: "sip:user@example.com".to_string(),
        };
        let result = registration_state_to_event(&snapshot);
        assert_eq!(result, SipEventPayload::RegistrationFailed);
    }

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_postcondition_status_403_returns_registration_failed() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(2),
            registration_status: 403,
            registration_expires: Some(0),
            online_status: false,
            uri: String::new(),
        };
        let result = registration_state_to_event(&snapshot);
        assert_eq!(result, SipEventPayload::RegistrationFailed);
    }

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_postcondition_status_500_returns_registration_failed() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(3),
            registration_status: 500,
            registration_expires: None,
            online_status: false,
            uri: String::new(),
        };
        let result = registration_state_to_event(&snapshot);
        assert_eq!(result, SipEventPayload::RegistrationFailed);
    }

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_postcondition_status_0_returns_registration_failed() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(4),
            registration_status: 0,
            registration_expires: None,
            online_status: false,
            uri: String::new(),
        };
        let result = registration_state_to_event(&snapshot);
        assert_eq!(result, SipEventPayload::RegistrationFailed);
    }

    // =======================================================================
    // C024-invariant — determinstic conversion
    // =======================================================================

    /// @verifies C024-invariant
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_invariant_same_input_produces_same_output() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(1),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:user@example.com".to_string(),
        };
        let r1 = registration_state_to_event(&snapshot);
        let r2 = registration_state_to_event(&snapshot);
        assert_eq!(r1, r2);
    }

    // =======================================================================
    // Boundary tests
    // =======================================================================

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_boundary_snapshot_with_empty_uri() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(0),
            registration_status: 200,
            registration_expires: Some(0),
            online_status: true,
            uri: String::new(),
        };
        let _result = registration_state_to_event(&snapshot);
    }

    /// @verifies C024-postcondition
    #[test]
// [::TICKET::] P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-2 --for-spec --no-implementation-order`.
    fn c024_boundary_registration_expires_none() {
        let snapshot = AccountInfoSnapshot {
            acc_id: AccountId(1),
            registration_status: 200,
            registration_expires: None,
            online_status: true,
            uri: "sip:test@example.com".to_string(),
        };
        assert_eq!(snapshot.registration_expires, None);
    }
}
