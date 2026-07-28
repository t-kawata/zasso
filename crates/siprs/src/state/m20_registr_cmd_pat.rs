// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
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
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// ============================================================================
//
// [::TICKET::] P0-5: RegistrationStateChanged RuntimeCommand pattern — AccountInfoSnapshot

use crate::api::event_model_payload_bus::{
    AccountId, RegistrationFailure, RegistrationInfo, SipEventPayload,
};

/// Snapshot of account info from `pjsua_acc_get_info()`.
///
/// Carries the minimal subset of registration state needed to decide
/// between RegistrationSucceeded and RegistrationFailed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountInfoSnapshot {
    /// The logical account identifier.
    pub acc_id: AccountId,
    /// SIP status code from the registration response.
    /// 200 = success, 4xx/5xx/6xx = failure.
    pub registration_status: u32,
    /// Registration expiry in seconds. `None` if expired or unknown.
    pub registration_expires: Option<u32>,
    /// Whether the account is considered online.
    pub online_status: bool,
    /// The SIP URI for this account.
    pub uri: String,
}

/// Convert an `AccountInfoSnapshot` into a `SipEventPayload` based on the
/// registration status code.
///
/// Status 200 → `RegistrationSucceeded`
/// All other statuses → `RegistrationFailed`
pub fn registration_status_to_payload(snapshot: &AccountInfoSnapshot) -> Option<SipEventPayload> {
    let acc_id = snapshot.acc_id;
    if snapshot.registration_status == 200 {
        Some(SipEventPayload::RegistrationSucceeded(RegistrationInfo {
            account_id: acc_id,
            renew: snapshot.registration_expires.is_some_and(|e| e > 0),
        }))
    } else {
        Some(SipEventPayload::RegistrationFailed(RegistrationFailure {
            account_id: acc_id,
            status_code: snapshot.registration_status as u16,
            reason: format!(
                "registration failed with status {}",
                snapshot.registration_status
            ),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── AccountInfoSnapshot ────────────────────────────────────────────

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_info_snapshot_construction() {
        let snap = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(1).unwrap(),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: "sip:alice@example.com".into(),
        };
        assert_eq!(snap.acc_id, AccountId::from_u64(1).unwrap());
        assert_eq!(snap.registration_status, 200);
        assert_eq!(snap.registration_expires, Some(3600));
        assert!(snap.online_status);
        assert_eq!(snap.uri, "sip:alice@example.com");
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_info_snapshot_expired() {
        let snap = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(2).unwrap(),
            registration_status: 200,
            registration_expires: None,
            online_status: false,
            uri: "sip:bob@example.com".into(),
        };
        assert!(snap.registration_expires.is_none());
        assert!(!snap.online_status);
    }

    // ── registration_status_to_payload ─────────────────────────────────

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn status_200_maps_to_registration_succeeded() {
        let snap = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(1).unwrap(),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: String::new(),
        };
        let payload = registration_status_to_payload(&snap).unwrap();
        match &payload {
            SipEventPayload::RegistrationSucceeded(info) => {
                assert_eq!(info.account_id, AccountId::from_u64(1).unwrap());
            }
            _ => panic!("expected RegistrationSucceeded, got {payload:?}"),
        }
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn status_403_maps_to_registration_failed() {
        let snap = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(1).unwrap(),
            registration_status: 403,
            registration_expires: None,
            online_status: false,
            uri: String::new(),
        };
        let payload = registration_status_to_payload(&snap).unwrap();
        match &payload {
            SipEventPayload::RegistrationFailed(failure) => {
                assert_eq!(failure.status_code, 403);
                assert!(!failure.reason.is_empty());
            }
            _ => panic!("expected RegistrationFailed, got {payload:?}"),
        }
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn status_503_maps_to_registration_failed() {
        let snap = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(3).unwrap(),
            registration_status: 503,
            registration_expires: None,
            online_status: false,
            uri: String::new(),
        };
        let payload = registration_status_to_payload(&snap).unwrap();
        match &payload {
            SipEventPayload::RegistrationFailed(failure) => {
                assert_eq!(failure.status_code, 503);
                assert_eq!(failure.account_id, AccountId::from_u64(3).unwrap());
            }
            _ => panic!("expected RegistrationFailed"),
        }
    }

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn status_200_with_zero_expiry_maps_to_succeeded() {
        let snap = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(5).unwrap(),
            registration_status: 200,
            registration_expires: Some(0),
            online_status: false,
            uri: String::new(),
        };
        let payload = registration_status_to_payload(&snap).unwrap();
        assert!(matches!(payload, SipEventPayload::RegistrationSucceeded(_)));
    }

    // ── Invariant: always produces Some ────────────────────────────────

    /// @verifies C024
    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn registration_status_always_produces_event() {
        // Both 200 and non-200 should produce Some payload
        let success = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(1).unwrap(),
            registration_status: 200,
            registration_expires: Some(3600),
            online_status: true,
            uri: String::new(),
        };
        let failure = AccountInfoSnapshot {
            acc_id: AccountId::from_u64(2).unwrap(),
            registration_status: 503,
            registration_expires: None,
            online_status: false,
            uri: String::new(),
        };
        assert!(registration_status_to_payload(&success).is_some());
        assert!(registration_status_to_payload(&failure).is_some());
    }

    // ── Clone + Debug ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn account_info_snapshot_clone_and_debug() {
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
        fn assert_cd<T: Clone + std::fmt::Debug>() {}
        assert_cd::<AccountInfoSnapshot>();
    }
}
