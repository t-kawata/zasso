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

use crate::api::event_model_payload_bus::AccountId;
use crate::state::registr_state_machine::{RegistrationState, TransitionError};

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

/// Map a native registration status code to the §17 `RegistrationState`.
///
/// 200 (OK) → `Registered`; 0 → `Idle` (unregistered / unregister success);
/// every other status → `Failed`. This is the M20 native→domain conversion that
/// the §62.4 registration state machine consumes (§62.4 / N0073).
pub fn registration_state_from_status(status: u32) -> RegistrationState {
    match status {
        200 => RegistrationState::Registered,
        0 => RegistrationState::Idle,
        _ => RegistrationState::Failed,
    }
}

/// Drive the §17 state machine from the current state and a native snapshot.
///
/// Returns `Ok(next)` when the §17.1 edge is valid, or `Err(TransitionError)`
/// when the native outcome cannot follow the current state (e.g. a success
/// event for a `Disabled` account — the C085 invariant: only a real REGISTER
/// success transitions to `Registered`).
pub fn registration_transition_from_native(
    current: RegistrationState,
    snapshot: &AccountInfoSnapshot,
) -> Result<RegistrationState, TransitionError> {
    let native_state = registration_state_from_status(snapshot.registration_status);
    current.transition(native_state)
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

    // ── Clone + Debug ─────────────────────────────────────────────────

    #[test]
// [::TICKET::] P0-5, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P15-5) --for-spec --no-implementation-order`.
    fn account_info_snapshot_clone_and_debug() {
// [::TICKET::] P0-5, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P15-5) --for-spec --no-implementation-order`.
        fn assert_cd<T: Clone + std::fmt::Debug>() {}
        assert_cd::<AccountInfoSnapshot>();
    }

    // ── P15-5: M20 converter drives the §17 state machine (C073/C085) ──

    /// Helper: build an `AccountInfoSnapshot` carrying a native registration status.
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn snapshot_with_status(status: u32) -> AccountInfoSnapshot {
        AccountInfoSnapshot {
            acc_id: AccountId::from_u64(1).unwrap(),
            registration_status: status,
            registration_expires: if status == 200 { Some(3600) } else { None },
            online_status: status == 200,
            uri: "sip:alice@example.com".into(),
        }
    }

    /// All §17 `RegistrationState` variants in discriminant order.
    const ALL_STATES: [RegistrationState; 7] = [
        RegistrationState::Disabled,
        RegistrationState::Idle,
        RegistrationState::Registering,
        RegistrationState::Registered,
        RegistrationState::Unregistering,
        RegistrationState::Failed,
        RegistrationState::Expired,
    ];

    /// @verifies C085
    /// M20 converter maps native status → §17 state: 200→Registered, 0→Idle,
    /// every other status→Failed (boundary: 199/201/1/u32::MAX are not success).
    #[test]
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn registration_state_from_status_maps_200_0_else() {
        assert_eq!(
            registration_state_from_status(200),
            RegistrationState::Registered
        );
        assert_eq!(registration_state_from_status(0), RegistrationState::Idle);
        assert_eq!(
            registration_state_from_status(403),
            RegistrationState::Failed
        );
        assert_eq!(
            registration_state_from_status(503),
            RegistrationState::Failed
        );
        assert_eq!(
            registration_state_from_status(1),
            RegistrationState::Failed
        );
        assert_eq!(
            registration_state_from_status(199),
            RegistrationState::Failed
        );
        assert_eq!(
            registration_state_from_status(201),
            RegistrationState::Failed
        );
        assert_eq!(
            registration_state_from_status(u32::MAX),
            RegistrationState::Failed
        );
    }

    /// @verifies C085
    /// The converter drives the §17.1 state machine: valid edges produce Ok(next),
    /// invalid edges (Disabled/Idle → Registered) produce Err(TransitionError).
    #[test]
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn registration_transition_drives_state_machine() {
        let ok = snapshot_with_status(200);
        let idle = snapshot_with_status(0);
        let fail = snapshot_with_status(403);
        assert_eq!(
            registration_transition_from_native(RegistrationState::Registering, &ok),
            Ok(RegistrationState::Registered)
        );
        assert_eq!(
            registration_transition_from_native(RegistrationState::Unregistering, &idle),
            Ok(RegistrationState::Idle)
        );
        assert_eq!(
            registration_transition_from_native(RegistrationState::Registering, &fail),
            Ok(RegistrationState::Failed)
        );
        assert_eq!(
            registration_transition_from_native(RegistrationState::Unregistering, &fail),
            Ok(RegistrationState::Failed)
        );
        assert!(
            registration_transition_from_native(RegistrationState::Disabled, &ok).is_err(),
            "Disabled cannot jump directly to Registered"
        );
        assert!(
            registration_transition_from_native(RegistrationState::Idle, &ok).is_err(),
            "Idle cannot jump directly to Registered"
        );
    }

    /// @verifies C085
    /// C085 invariant — only a real REGISTER success (current=Registering, status=200)
    /// yields Registered. Table-driven over all 7 states × representative statuses.
    #[test]
// [::TICKET::] P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-5 --for-spec --no-implementation-order`.
    fn only_real_register_success_yields_registered() {
        for current in ALL_STATES {
            for status in [200u32, 0, 403] {
                let snap = snapshot_with_status(status);
                let result = registration_transition_from_native(current, &snap);
                if current == RegistrationState::Registering && status == 200 {
                    assert_eq!(result, Ok(RegistrationState::Registered));
                } else {
                    assert_ne!(result, Ok(RegistrationState::Registered));
                }
            }
        }
    }
}
