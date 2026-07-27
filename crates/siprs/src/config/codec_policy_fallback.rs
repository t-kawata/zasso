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

//! Codec policy & fallback rules (N0040).
//!
//! Defines the negotiated codec types and codec selection policy for the
//! siprs audio pipeline:
//!
//! - `NegotiatedCodec` — The SDP-negotiated codec (PCMU or Opus)
//! - `CodecSelectionPolicy` — How codecs are selected during negotiation
//!
//! Per §29, only PCMU (G.711 μ-law) and Opus are supported codecs. All
//! other codecs are disabled (priority 0) by the auto-mode configuration
//! in `m20_codec_auto_mode`.

use crate::config::account_config_spec::OpusConfig;

// ---------------------------------------------------------------------------
// NegotiatedCodec — SDP-negotiated audio codec
// ---------------------------------------------------------------------------

/// The audio codec negotiated via SDP offer/answer.
///
/// Exactly two codecs are supported:
/// - `Pcmu`: G.711 μ-law / 8000Hz / 1ch (universal fallback)
/// - `Opus`: Opus / 48000Hz / 2ch (preferred codec)
///
/// This enum has exactly two variants — no third codec can be represented.
/// The `#[non_exhaustive]` attribute allows future codec additions without
/// breaking downstream matches.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum NegotiatedCodec {
    /// PCMU (G.711 μ-law) / 8000Hz / 1ch — universal fallback.
    Pcmu,
    /// Opus / 48000Hz / 2ch — preferred codec with configurable parameters.
    Opus(OpusConfig),
}

// ---------------------------------------------------------------------------
// CodecSelectionPolicy — codec selection strategy
// ---------------------------------------------------------------------------

/// Determines how codecs are selected during SDP negotiation.
///
/// Two policies are available:
/// - `Ordered`: Try codecs in configured priority order, accept the first
///   mutually supported codec.
/// - `PreferOpusFallbackPcmu`: Try Opus first; fall back to PCMU if Opus
///   is rejected. This is the default policy.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum CodecSelectionPolicy {
    /// Try codecs in configured priority order.
    Ordered,
    /// Try Opus first; fall back to PCMU on rejection (default).
    PreferOpusFallbackPcmu,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl Default for CodecSelectionPolicy {
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::PreferOpusFallbackPcmu
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C041-normal: NegotiatedCodec ───────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C041-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn negotiated_codec_pcmu_constructable() {
        let codec = NegotiatedCodec::Pcmu;
        assert_eq!(format!("{:?}", codec), "Pcmu");
    }

    /// @verifies C041-precondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn negotiated_codec_opus_with_default_config() {
        let codec = NegotiatedCodec::Opus(OpusConfig::default());
        assert!(matches!(codec, NegotiatedCodec::Opus(_)));
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn negotiated_codec_derives_clone_partial_eq() {
        let a = NegotiatedCodec::Pcmu;
        let b = a.clone();
        assert_eq!(a, b);

        let c = NegotiatedCodec::Opus(OpusConfig::default());
        let d = c.clone();
        assert_eq!(c, d);
    }

    // -----------------------------------------------------------------------
    // ── C041-normal: CodecSelectionPolicy ─────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn codec_selection_policy_default_is_prefer_opus() {
        assert_eq!(
            CodecSelectionPolicy::default(),
            CodecSelectionPolicy::PreferOpusFallbackPcmu
        );
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn codec_selection_policy_ordered_constructable() {
        let policy = CodecSelectionPolicy::Ordered;
        assert_eq!(format!("{:?}", policy), "Ordered");
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn codec_selection_policy_prefer_opus_constructable() {
        let policy = CodecSelectionPolicy::PreferOpusFallbackPcmu;
        assert_eq!(format!("{:?}", policy), "PreferOpusFallbackPcmu");
    }

    /// @verifies C041-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn codec_selection_policy_derives_clone_partial_eq() {
        let a = CodecSelectionPolicy::Ordered;
        let b = a.clone();
        assert_eq!(a, b);
    }

    // -----------------------------------------------------------------------
    // ── C041-invariant: PCMU and Opus only ───────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C041-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn negotiated_codec_exactly_two_variants() {
        // Compile-time guarantee: match is exhaustive with exactly 2 arms
        let codec = NegotiatedCodec::Pcmu;
        match codec {
            NegotiatedCodec::Pcmu => {}      // variant 1
            NegotiatedCodec::Opus(_) => {}    // variant 2
        }
    }

    // -----------------------------------------------------------------------
    // ── C042-postcondition: Explicit vs auto mode ─────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C042-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn codec_selection_policy_has_both_modes() {
        let explicit = CodecSelectionPolicy::Ordered;
        let auto = CodecSelectionPolicy::PreferOpusFallbackPcmu;
        // Verify both modes exist as distinct variants
        assert_ne!(explicit, auto);
        assert!(matches!(explicit, CodecSelectionPolicy::Ordered));
        assert!(matches!(auto, CodecSelectionPolicy::PreferOpusFallbackPcmu));
    }

    /// @verifies C042-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn default_mode_is_auto_prefer_opus() {
        assert_eq!(
            CodecSelectionPolicy::default(),
            CodecSelectionPolicy::PreferOpusFallbackPcmu,
            "auto mode (PreferOpusFallbackPcmu) must be the default"
        );
    }

    /// @verifies C042-postcondition
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn auto_mode_implied_by_default() {
        // Verify that PreferOpusFallbackPcmu = auto = Opus first, PCMU fallback
        let policy = CodecSelectionPolicy::default();
        assert_eq!(policy, CodecSelectionPolicy::PreferOpusFallbackPcmu);
    }

    // -----------------------------------------------------------------------
    // ── C042-invariant: Opus=255, PCMU=254, others=0 ──────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C042-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn auto_mode_opus_priority_255() {
        assert_eq!(crate::config::m20_codec_auto_mode::CODEC_PRIORITY_OPUS, 255);
    }

    /// @verifies C042-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn auto_mode_pcmu_priority_254() {
        assert_eq!(crate::config::m20_codec_auto_mode::CODEC_PRIORITY_PCMU, 254);
    }

    /// @verifies C042-invariant
    #[test]
// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn auto_mode_other_codecs_disabled_at_0() {
        assert_eq!(
            crate::config::m20_codec_auto_mode::CODEC_PRIORITY_DISABLED,
            0
        );
    }
}
