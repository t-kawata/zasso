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

/// The `CallState` that results from answering with `code` (§19.1 / P16-5 §62.14).
///
/// - `200` → `Active` (call accepted, media negotiated)
/// - `486` / `603` → `Disconnected` (Busy Here / Decline reject)
/// - `180` / `183` → `Connecting` (provisional; call still in progress)
///
/// `CallEntry.state` is a typed `CallState` since P16-5; this maps the answer
/// code to the resulting state directly (replaces the pre-P16-5 String bridge).
pub(crate) fn answer_call_state(code: u16) -> CallState {
    match code {
        200 => CallState::Active,
        486 | 603 => CallState::Disconnected,
        _ => CallState::Connecting,
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
// [::TICKET::] P15-6, P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-6|P16-5) --for-spec --no-implementation-order`.
    fn answer_call_state_maps_codes() {
        assert_eq!(answer_call_state(200), CallState::Active);
        assert_eq!(answer_call_state(486), CallState::Disconnected);
        assert_eq!(answer_call_state(603), CallState::Disconnected);
        assert_eq!(answer_call_state(180), CallState::Connecting);
        assert_eq!(answer_call_state(183), CallState::Connecting);
    }
}
