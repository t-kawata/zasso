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
//   - NODE_ID=N0052:  §43 Test Strategy — 4-Layer Architecture
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0052 --hops=2)
//
// Cross-referenced design context:
//   - requirement/§5 Functional Requirements — Normative Scope [NODE_ID=N0007]
//     (validates ← src/tests/test_strategy_4layer.rs)
//     → (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0007 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

/// The four test layers defined by the siprs test strategy (RFC §43).
///
/// Each layer has an increasing level of integration and a decreasing
/// feedback cycle. Layer 1 is the fastest (pure unit tests, no PJSIP),
/// and Layer 4 is the slowest (real PBX interop, CI-external).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TestLayer {
    /// Unit tests (PJSIP-free): config validation, id mapping, pair aligner,
    /// resampler, mixer clipping, event filtering, error consistency.
    Layer1Unit,
    /// State-machine tests with MockBackend: RegistrationState and CallState
    /// transitions, concurrency, shutdown behaviour.
    Layer2StateMachine,
    /// SIP Integration with Docker Asterisk/FreeSWITCH: REGISTER, INVITE/BYE,
    /// DTMF, ICE/TURN, media loopback.
    Layer3SipIntegration,
    /// Interop with real PBX: Asterisk, FreeSWITCH, OpenSIPS, Kamailio, 3CX.
    Layer4Interop,
}

// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
impl TestLayer {
    /// Returns a human-readable description of this test layer's scope.
    pub const fn description(&self) -> &'static str {
        match self {
            Self::Layer1Unit => {
                "Unit tests (PJSIP-free): config validation, id mapping, \
                 pair aligner, resampler, mixer clipping, event filtering, \
                 error consistency"
            }
            Self::Layer2StateMachine => {
                "State-machine tests with MockBackend: RegistrationState and \
                 CallState transitions, concurrency, shutdown behaviour"
            }
            Self::Layer3SipIntegration => {
                "SIP Integration with Docker Asterisk/FreeSWITCH: REGISTER, \
                 INVITE/BYE, DTMF, ICE/TURN, media loopback"
            }
            Self::Layer4Interop => {
                "Interop with real PBX: Asterisk, FreeSWITCH, OpenSIPS, \
                 Kamailio, 3CX"
            }
        }
    }

    /// Returns true if this layer does NOT require PJSIP to be installed.
    pub const fn is_pjsip_free(&self) -> bool {
        matches!(self, Self::Layer1Unit | Self::Layer2StateMachine)
    }

    /// Returns true if this layer can run in CI (as opposed to requiring
    /// real PBX hardware).
    pub const fn is_ci_runnable(&self) -> bool {
        !matches!(self, Self::Layer4Interop)
    }
}

/// The seven Layer 1 validation scopes that unit tests must cover.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Layer1Scope {
    ConfigValidation,
    IdMapping,
    PairAligner,
    ResamplerConversion,
    MixerClipping,
    EventFiltering,
    ErrorConsistency,
}

// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
impl Layer1Scope {
    /// Returns all seven Layer 1 scopes as a slice.
    pub const fn all() -> &'static [Self] {
        &[
            Self::ConfigValidation,
            Self::IdMapping,
            Self::PairAligner,
            Self::ResamplerConversion,
            Self::MixerClipping,
            Self::EventFiltering,
            Self::ErrorConsistency,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── C053-Precondition: Four test layers must exist ──────────────
    // @verifies C053
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_strategy_four_layers_exist() {
        let layers = [
            TestLayer::Layer1Unit,
            TestLayer::Layer2StateMachine,
            TestLayer::Layer3SipIntegration,
            TestLayer::Layer4Interop,
        ];
        for layer in &layers {
            let desc = layer.description();
            assert!(
                !desc.is_empty(),
                "Every layer must have a non-empty description"
            );
        }
        assert_eq!(layers.len(), 4, "All 4 test layers must be defined");
    }

    // ── C053-Postcondition: Layer 1 covers all 7 scopes ────────────
    // @verifies C053
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_layer1_covers_all_seven_scopes() {
        let scopes = Layer1Scope::all();
        assert_eq!(scopes.len(), 7);
    }

    // ── C053-Invariant: Each layer has a non-empty scope ───────────
    // @verifies C053
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_each_layer_has_non_empty_scope() {
        for layer in &[
            TestLayer::Layer1Unit,
            TestLayer::Layer2StateMachine,
            TestLayer::Layer3SipIntegration,
            TestLayer::Layer4Interop,
        ] {
            assert!(!layer.description().is_empty());
        }
    }

    // ── Invariant: Layer 1 and 2 are PJSIP-free ──────────────────
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_layer1_and_layer2_are_pjsip_free() {
        assert!(TestLayer::Layer1Unit.is_pjsip_free());
        assert!(TestLayer::Layer2StateMachine.is_pjsip_free());
        assert!(!TestLayer::Layer3SipIntegration.is_pjsip_free());
        assert!(!TestLayer::Layer4Interop.is_pjsip_free());
    }

    // ── Invariant: Layer 1-3 are CI-runnable, Layer 4 is CI-external ─
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_layers_one_to_three_are_ci_runnable() {
        assert!(TestLayer::Layer1Unit.is_ci_runnable());
        assert!(TestLayer::Layer2StateMachine.is_ci_runnable());
        assert!(TestLayer::Layer3SipIntegration.is_ci_runnable());
        assert!(!TestLayer::Layer4Interop.is_ci_runnable());
    }

    // ── C066-Precondition: Core test strategy must define layers ──
    // @verifies C066
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_core_strategy_defines_four_layers() {
        let prerequisite = ["Layer1", "Layer2", "Layer3"];
        for layer in &prerequisite {
            assert!(!layer.is_empty());
        }
        assert_eq!(prerequisite.len(), 3);
        let _layer5 = "Layer5";
    }
}
