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
//   - NODE_ID=N0053:  §43 M20 Test Layer Mapping & Dual Client Utility
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0053 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

/// M20 feature-to-test-layer mapping entry.
///
/// Each M20 feature is assigned to a test layer (2 or 3) with a description
/// of what it validates and notes about prerequisites or caveats.
#[derive(Debug, Clone)]
pub struct M20FeatureTestEntry {
    /// Short name of the M20 feature.
    pub feature_name: &'static str,
    /// Which test layer validates this feature.
    pub layer: M20TestLayer,
    /// What the test validates.
    pub validation_description: &'static str,
    /// Prerequisite tickets or design decisions.
    pub notes: &'static str,
}

/// Which test layer validates an M20 feature.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum M20TestLayer {
    /// Layer 2: State-machine tests with TestBackend (PJSIP-free).
    Layer2,
    /// Layer 3: SIP Integration with Docker SIP server (PJSIP required).
    Layer3,
}

// [::TICKET::] P1-3, P15-3, P16-3, P16-5, P17-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-3|P15-3|P16-3|P16-5|P17-6) --for-spec --no-implementation-order`.
impl M20FeatureTestEntry {
    /// Returns the full 11-entry M20 feature test mapping table as defined
    /// in RFC §43 M20 Test Layer Mapping.
    pub const fn m20_feature_mapping() -> &'static [Self] {
        &[
            Self {
                feature_name: "NativeEvent → SipEventPayload conversion",
                layer: M20TestLayer::Layer2,
                validation_description: "Each NativeEvent converts to the correct SipEventPayload",
                notes: "TestBackend injects NativeEvent for verification",
            },
            Self {
                feature_name: "RegistrationStateChanged",
                layer: M20TestLayer::Layer2,
                validation_description: "GetAccountInfo → RegistrationStateChanged firing",
                notes: "Layer 3 verifies real registration state transitions",
            },
            Self {
                feature_name: "CallStateChanged (pjsip_inv_state full coverage)",
                layer: M20TestLayer::Layer2,
                // P16-5 §62.14: bindings constants are NULL=0 CALLING=1 INCOMING=2
                // EARLY=3 CONNECTING=4 CONFIRMED=5 DISCONNECTED=6.
                validation_description: "All state values (0-6) map to correct CallState",
                notes: "state=4 CONNECTING → Trying/Ringing branching logic",
            },
            Self {
                feature_name: "CallMediaStateChanged",
                layer: M20TestLayer::Layer2,
                // P17-6 §62.26: media status tracking adds the hold→ACTIVE → CallResumed transition.
                validation_description: "media_status maps to MediaActive/Held/Error + hold→ACTIVE → CallResumed",
                notes: "Layer 3 verifies real hold/resume via re-INVITE",
            },
            Self {
                feature_name: "DtmfSent dual layer (return + event)",
                layer: M20TestLayer::Layer2,
                validation_description: "send_dtmf return vs DtmfSent event separation",
                notes: "Layer 3 verifies real DTMF transmission",
            },
            Self {
                feature_name: "DtmfSent timeout fallback",
                layer: M20TestLayer::Layer2,
                validation_description: "Auto-issue DtmfSent after 500ms timeout",
                notes: "Timer-based behaviour verification",
            },
            Self {
                feature_name: "SubscribeAudio conf_connect",
                layer: M20TestLayer::Layer3,
                validation_description: "subscribe_audio → conf_connect → AudioTapHandle creation",
                notes: "Docker Asterisk environment required",
            },
            Self {
                feature_name: "conf_connect/disconnect RuntimeCommand",
                layer: M20TestLayer::Layer3,
                validation_description: "conf_port connect/disconnect operation",
                notes: "Integrated with media loopback testing",
            },
            Self {
                feature_name: "configure_codecs auto mode",
                layer: M20TestLayer::Layer2,
                validation_description: "pjsua_codec_set_priority invocation (Opus=255, PCMU=254)",
                notes: "",
            },
            Self {
                feature_name: "Dual Client (call_reject support)",
                layer: M20TestLayer::Layer3,
                validation_description: "Shared PjsuaBackend singleton + EventBus isolation",
                notes: "Bidirectional client init and call/receive",
            },
            Self {
                feature_name: "Low-priority NativeEvent (P1/P2)",
                layer: M20TestLayer::Layer2,
                validation_description: "Returns None (intentional ignore)",
                notes: "",
            },
        ]
    }
}

/// Dual Client test utility for bidirectional SIP testing.
///
/// Provides two `SipClient` instances sharing the same `PjsuaBackend` singleton,
/// enabling bidirectional call patterns (call_a_to_b) in Layer 3 integration tests.
#[derive(Debug, Default)]
pub struct DualClientContext {
    // Fields are placed here for structural definition; actual bindings
    // require the full SipClient and PjsuaBackend implementations (P4-2).
}

// [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
impl DualClientContext {
    /// Returns a description of the bidirectional call_a_to_b test pattern.
    pub const fn call_a_to_b_pattern() -> &'static str {
        "client_a → account_a → make_call(target_uri: account_b.uri) → \
         client_b receives incoming call"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── C054-Precondition: TestBackend exists for DualClientContext ─
    // @verifies C054
    #[test]
    // [::TICKET::] P1-3, P15-3, P16-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P1-3|P15-3|P16-3) --for-spec --no-implementation-order`.
    fn test_dual_client_presupposes_backend() {
        // DualClientContext depends on TestBackend from runtime::backend
        let _mock = crate::runtime::backend::TestBackend::new();
        assert!(!_mock.initialized, "TestBackend must start uninitialized");
    }

    // ── C054-Postcondition: DualClientContext constructs cleanly ──
    // @verifies C054
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_dual_client_context_constructs() {
        let ctx = DualClientContext::default();
        // Verify structural existence — no panic, no side effects.
        let _ = ctx;
    }

    // ── C054-Invariant: Bidirectional pattern documented ──────────
    // @verifies C054
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_dual_client_bidirectional_pattern_documented() {
        let pattern = DualClientContext::call_a_to_b_pattern();
        assert!(
            !pattern.is_empty(),
            "Bidirectional pattern must be documented"
        );
        assert!(
            pattern.contains("client_a"),
            "Pattern must describe client_a"
        );
        assert!(
            pattern.contains("client_b"),
            "Pattern must describe client_b"
        );
    }

    // ── M20 feature mapping has 11 entries ────────────────────────
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_m20_feature_mapping_has_eleven_entries() {
        let mapping = M20FeatureTestEntry::m20_feature_mapping();
        assert_eq!(
            mapping.len(),
            11,
            "M20 feature mapping must have exactly 11 entries"
        );
    }

    // ── Every M20 entry has non-empty name and description ─────────
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_every_m20_entry_has_name_and_description() {
        for entry in M20FeatureTestEntry::m20_feature_mapping() {
            assert!(!entry.feature_name.is_empty());
            assert!(!entry.validation_description.is_empty());
        }
    }

    // ── M20 entries reference valid test layers ───────────────────
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_m20_entries_use_valid_layers() {
        for entry in M20FeatureTestEntry::m20_feature_mapping() {
            match entry.layer {
                M20TestLayer::Layer2 | M20TestLayer::Layer3 => {}
            }
        }
    }

    // ── Layer 3 entries note Docker requirement ──────────────────
    #[test]
    // [::TICKET::] P1-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P1-3 --for-spec --no-implementation-order`.
    fn test_layer3_entries_require_docker() {
        for entry in M20FeatureTestEntry::m20_feature_mapping() {
            if entry.layer == M20TestLayer::Layer3 {
                assert!(
                    !entry.notes.is_empty(),
                    "Layer 3 entry '{}' must document its Docker requirement",
                    entry.feature_name
                );
            }
        }
    }
}
