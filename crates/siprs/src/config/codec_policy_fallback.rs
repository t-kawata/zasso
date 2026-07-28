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
//   - NODE_ID=N0040:  §29 Codec Policy & Fallback Rules
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0040 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::config::account_config_spec::OpusConfig;

// ---------------------------------------------------------------------------
// NegotiatedCodec
// ---------------------------------------------------------------------------

/// The codec negotiated during SDP offer/answer.
///
/// Only PCMU and Opus are allowed (C041 invariant). `Opus` carries an
/// `OpusConfig` that governs encoding parameters (bitrate, complexity, etc.).
///
/// # Invariant
/// Exactly 2 variants exist. Adding a third variant requires updating the
/// `AccountCodecPolicy`, `CallMediaConstraints::validate_strict()`, and
/// the codec auto-mode priority assignment in `m20_codec_auto_mode.rs`.
#[derive(Debug, Clone, PartialEq)]
pub enum NegotiatedCodec {
    /// PCMU (G.711 μ-law) / 8000 Hz / 1 channel.
    Pcmu,
    /// Opus / 48000 Hz / 2 channel, with per-call configuration.
    Opus(OpusConfig),
}

// ---------------------------------------------------------------------------
// CodecSelectionPolicy
// ---------------------------------------------------------------------------

/// Strategy for selecting a codec during SDP negotiation.
///
/// Derived from `CallMediaPreferences` and determines how codecs are
/// prioritised when the remote party's capabilities are known.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CodecSelectionPolicy {
    /// Negotiate in configured priority order; use the first mutually
    /// supported codec. If no codec is mutually supported, fail with
    /// `MediaNegotiationFailed`.
    Ordered,
    /// Try Opus first; fall back to PCMU only if Opus is rejected.
    /// This is the default policy.
    #[default]
    PreferOpusFallbackPcmu,
}

// ===========================================================================
// Tests — TDD Red: failing → Green: passing
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fmt::Debug;

    // ── C041-Pre: NegotiatedCodec construction ─────────────────────────

    /// @verifies C041
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_pcmu_constructs() {
        let codec = NegotiatedCodec::Pcmu;
        assert_eq!(codec, NegotiatedCodec::Pcmu);
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_opus_with_default_config() {
        let codec = NegotiatedCodec::Opus(OpusConfig::default());
        match codec {
            NegotiatedCodec::Opus(cfg) => {
                assert_eq!(cfg.ptime_ms, 20);
                assert_eq!(cfg.bitrate, 32000);
            }
            _ => panic!("expected Opus variant"),
        }
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_opus_with_custom_config() {
        let custom = OpusConfig {
            bitrate: 64000,
            complexity: 10,
            cbr: true,
            inband_fec: false,
            dtx: true,
            ptime_ms: 40,
        };
        let codec = NegotiatedCodec::Opus(custom);
        match codec {
            NegotiatedCodec::Opus(cfg) => {
                assert_eq!(cfg.bitrate, 64000);
                assert_eq!(cfg.complexity, 10);
                assert!(cfg.cbr);
                assert!(!cfg.inband_fec);
                assert!(cfg.dtx);
                assert_eq!(cfg.ptime_ms, 40);
            }
            _ => panic!("expected Opus variant"),
        }
    }

    // ── C041-Post: CodecSelectionPolicy variants ──────────────────────

    /// @verifies C041
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn codec_selection_policy_ordered_and_prefer_opus() {
        let ordered = CodecSelectionPolicy::Ordered;
        let prefer_opus = CodecSelectionPolicy::PreferOpusFallbackPcmu;
        assert_ne!(ordered, prefer_opus);
    }

    /// @verifies C041
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn codec_selection_policy_default_is_prefer_opus() {
        assert_eq!(
            CodecSelectionPolicy::default(),
            CodecSelectionPolicy::PreferOpusFallbackPcmu
        );
    }

    // ── C041-Inv: Exactly 2 variants ────────────────────────────────────

    /// @verifies C041
    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_has_exactly_two_variants() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn discriminant(c: &NegotiatedCodec) -> u8 {
            match c {
                NegotiatedCodec::Pcmu => 1,
                NegotiatedCodec::Opus(_) => 2,
            }
        }
        assert_eq!(discriminant(&NegotiatedCodec::Pcmu), 1);
        assert_eq!(
            discriminant(&NegotiatedCodec::Opus(OpusConfig::default())),
            2
        );
    }

    // ── Normal: trait derives ──────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + PartialEq>() {}
        assert_traits::<NegotiatedCodec>();
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn codec_selection_policy_derives_required_traits() {
        // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<CodecSelectionPolicy>();
    }

    // ── Equality tests ────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_pcmu_vs_pcmu_is_equal() {
        assert_eq!(NegotiatedCodec::Pcmu, NegotiatedCodec::Pcmu);
    }

    #[test]
    // [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn negotiated_codec_pcmu_vs_opus_is_not_equal() {
        assert_ne!(
            NegotiatedCodec::Pcmu,
            NegotiatedCodec::Opus(OpusConfig::default())
        );
    }
}
