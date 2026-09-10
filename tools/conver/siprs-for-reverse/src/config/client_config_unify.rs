
use crate::architecture::impl_integration_design::DesignDecisionId;

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
    fn config_unification_decision_is_62_1() {
        let decision = ConfigUnificationDecision::record();
        assert_eq!(decision.section(), "62.1");
        assert_eq!(decision.decision(), DesignDecisionId::ConfigUnification);
    }

    #[test]
    fn config_unification_decision_id_is_known_to_parent() {
        let decision = ConfigUnificationDecision::record();
        let order = crate::architecture::impl_integration_design::breaking_change_order();
        assert!(
            order.contains(&decision.decision()),
            "62.1 must be part of the §62 breaking-change order"
        );
    }
}
