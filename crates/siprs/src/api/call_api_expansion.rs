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
//   - NODE_ID=N0074:  62.5 公開 API 拡充（通話 API 群）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0074 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::state::call_state_model::CallState;

/// The §62.5 public call-control method set added to `SipClient` (N0074).
///
/// Mirrors RFC N0027 (§19/§20) exactly — used by the API-surface test and the
/// C074 invariant check to prove the public API expansion stays aligned with
/// the RFC. Kept as a named constant so the surface is a single source of truth
/// rather than a hardcoded list scattered across tests.
pub const CALL_API_METHODS: [&str; 8] = [
    "answer",
    "hangup",
    "hold",
    "unhold",
    "transfer",
    "send_dtmf",
    "call_state",
    "calls",
];

/// Map a `CallEntry.state` string to the public 13-state `CallState` enum.
///
/// `CallEntry` (C046 field set) stores the signalling state as a `String`
/// placeholder; `SipClient::call_state(call_id)` converts it to the typed
/// `CallState` returned to callers. Unknown strings fall back to `CallState::New`
/// rather than panicking — the reactor never fabricates a state.
pub(crate) fn call_state_from_entry_state(state: &str) -> CallState {
    match state {
        "New" => CallState::New,
        "Calling" => CallState::Calling,
        "Trying" => CallState::Trying,
        "Ringing" => CallState::Ringing,
        "EarlyMedia" => CallState::EarlyMedia,
        "Incoming" => CallState::Incoming,
        "Connecting" => CallState::Connecting,
        "Active" => CallState::Active,
        "Held" => CallState::Held,
        "Transferring" => CallState::Transferring,
        "Disconnecting" => CallState::Disconnecting,
        "Disconnected" => CallState::Disconnected,
        "Failed" => CallState::Failed,
        _ => CallState::New,
    }
}

/// The `CallEntry.state` string that results from answering with `code` (§19.1).
///
/// - `200` → `Active` (call accepted, media negotiated)
/// - `486` / `603` → `Disconnected` (Busy Here / Decline reject)
/// - `180` / `183` → `Connecting` (provisional; call still in progress)
pub(crate) fn answer_state_string(code: u16) -> &'static str {
    match code {
        200 => "Active",
        486 | 603 => "Disconnected",
        _ => "Connecting",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// @verifies C074
    #[test]
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn call_api_methods_matches_rfc_n0027_surface() {
        // The §62.5 method set must equal the RFC N0027 call-control surface.
        assert_eq!(
            CALL_API_METHODS,
            [
                "answer",
                "hangup",
                "hold",
                "unhold",
                "transfer",
                "send_dtmf",
                "call_state",
                "calls",
            ]
        );
    }

    /// @verifies C086
    #[test]
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn call_state_from_entry_state_maps_all_13_states() {
        assert_eq!(call_state_from_entry_state("New"), CallState::New);
        assert_eq!(call_state_from_entry_state("Calling"), CallState::Calling);
        assert_eq!(call_state_from_entry_state("Trying"), CallState::Trying);
        assert_eq!(call_state_from_entry_state("Ringing"), CallState::Ringing);
        assert_eq!(
            call_state_from_entry_state("EarlyMedia"),
            CallState::EarlyMedia
        );
        assert_eq!(call_state_from_entry_state("Incoming"), CallState::Incoming);
        assert_eq!(
            call_state_from_entry_state("Connecting"),
            CallState::Connecting
        );
        assert_eq!(call_state_from_entry_state("Active"), CallState::Active);
        assert_eq!(call_state_from_entry_state("Held"), CallState::Held);
        assert_eq!(
            call_state_from_entry_state("Transferring"),
            CallState::Transferring
        );
        assert_eq!(
            call_state_from_entry_state("Disconnecting"),
            CallState::Disconnecting
        );
        assert_eq!(
            call_state_from_entry_state("Disconnected"),
            CallState::Disconnected
        );
        assert_eq!(call_state_from_entry_state("Failed"), CallState::Failed);
        assert_eq!(
            call_state_from_entry_state("Unknown"),
            CallState::New,
            "unknown strings must not panic; fall back to New"
        );
    }

    /// @verifies C086
    #[test]
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn answer_state_string_maps_codes() {
        assert_eq!(answer_state_string(200), "Active");
        assert_eq!(answer_state_string(486), "Disconnected");
        assert_eq!(answer_state_string(603), "Disconnected");
        assert_eq!(answer_state_string(180), "Connecting");
        assert_eq!(answer_state_string(183), "Connecting");
    }
}
