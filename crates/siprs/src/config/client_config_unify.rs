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
//   - NODE_ID=N0070:  62.1 公開設定 API の一本化（ClientConfig / STUN/TURN/ICE）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0070 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::architecture::impl_integration_design::DesignDecisionId;

/// §62.1 ConfigUnification — typed design record (NODE_ID=N0070).
///
/// Mirrors the typed-design-data pattern established by
/// `impl_integration_design.rs` (§62): each design decision is recorded with a
/// stable identifier, the RFC section it belongs to, and the resolution it
/// prescribes. This record pins the fact that P15-2 resolves RESIDUE root cause
/// R1 (public ClientConfig was not RFC-typed) and unifies the STUN/TURN/ICE
/// types per §13.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConfigUnificationDecision {
    section: &'static str,
    decision: DesignDecisionId,
}

// [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
impl ConfigUnificationDecision {
    /// The §62.1 decision record.
    pub fn record() -> Self {
        Self {
            section: "62.1",
            decision: DesignDecisionId::ConfigUnification,
        }
    }

    /// RFC §62 subsection number.
    pub fn section(&self) -> &'static str {
        self.section
    }

    /// The stable design-decision identifier shared with `impl_integration_design`.
    pub fn decision(&self) -> DesignDecisionId {
        self.decision
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C070  -- postcondition: 62.1 is recorded as part of §62
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn config_unification_decision_is_62_1() {
        let decision = ConfigUnificationDecision::record();
        assert_eq!(decision.section(), "62.1");
        assert_eq!(decision.decision(), DesignDecisionId::ConfigUnification);
    }

    #[test]
    // @verifies C070  -- precondition: §62 parent section defines the decision id
    // [::TICKET::] P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-2 --for-spec --no-implementation-order`.
    fn config_unification_decision_id_is_known_to_parent() {
        let decision = ConfigUnificationDecision::record();
        let order = crate::architecture::impl_integration_design::breaking_change_order();
        assert!(
            order.contains(&decision.decision()),
            "62.1 must be part of the §62 breaking-change order"
        );
    }
}
