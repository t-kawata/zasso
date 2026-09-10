
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

    #[test]
    fn negotiated_codec_pcmu_constructs() {
        let codec = NegotiatedCodec::Pcmu;
        assert_eq!(codec, NegotiatedCodec::Pcmu);
    }

    #[test]
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

    #[test]
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

    #[test]
    fn codec_selection_policy_ordered_and_prefer_opus() {
        let ordered = CodecSelectionPolicy::Ordered;
        let prefer_opus = CodecSelectionPolicy::PreferOpusFallbackPcmu;
        assert_ne!(ordered, prefer_opus);
    }

    #[test]
    fn codec_selection_policy_default_is_prefer_opus() {
        assert_eq!(
            CodecSelectionPolicy::default(),
            CodecSelectionPolicy::PreferOpusFallbackPcmu
        );
    }

    // ── C041-Inv: Exactly 2 variants ────────────────────────────────────

    #[test]
    fn negotiated_codec_has_exactly_two_variants() {
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
    fn negotiated_codec_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + PartialEq>() {}
        assert_traits::<NegotiatedCodec>();
    }

    #[test]
    fn codec_selection_policy_derives_required_traits() {
        fn assert_traits<T: Debug + Clone + Copy + PartialEq + Eq>() {}
        assert_traits::<CodecSelectionPolicy>();
    }

    // ── Equality tests ────────────────────────────────────────────────

    #[test]
    fn negotiated_codec_pcmu_vs_pcmu_is_equal() {
        assert_eq!(NegotiatedCodec::Pcmu, NegotiatedCodec::Pcmu);
    }

    #[test]
    fn negotiated_codec_pcmu_vs_opus_is_not_equal() {
        assert_ne!(
            NegotiatedCodec::Pcmu,
            NegotiatedCodec::Opus(OpusConfig::default())
        );
    }
}
