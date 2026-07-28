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
//   - NODE_ID=N0036:  §26 Resampler Design & Stereo Mapping
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0036 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::model::audio_format_chunkpair::{AudioFormat, SampleRate};

// ---------------------------------------------------------------------------
// ResamplePipeline
// ---------------------------------------------------------------------------

/// A resampling pipeline descriptor that holds the input and output format
/// configurations.
///
/// The actual rubato-based resampling (`FftFixedIn<f32>`) is deferred to
/// P5-2 (AudioMixer integration). This ticket validates the format
/// combination and provides the `interleave_in_out` utility.
///
/// # Invariant
///
/// - `in_rate` and `out_rate` are the sample rates before and after resampling.
/// - The pipeline is stateless between resample calls — all resampling state
///   belongs to the rubato instance (added in P5-2).
#[derive(Debug, Clone, Copy)]
pub struct ResamplePipeline {
    /// Input sample rate (format before resampling).
    pub in_rate: SampleRate,
    /// Output sample rate (format after resampling).
    pub out_rate: SampleRate,
}

// [::TICKET::] P4-2, P5-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-2|P5-2) --for-spec --no-implementation-order`.
impl ResamplePipeline {
    /// Create a new `ResamplePipeline` by validating the format combination.
    ///
    /// Currently only validates that `in_fmt` and `out_fmt` specify distinct
    /// sample rates (same-rate passthrough needs no pipeline) and both use
    /// valid (non-zero) frame durations.
    ///
    /// Returns `Err` when the formats are identical (no resampling needed).
    pub fn new(_in_fmt: AudioFormat, _out_fmt: AudioFormat) -> Result<Self, &'static str> {
        let in_rate = _in_fmt.sample_rate;
        let out_rate = _out_fmt.sample_rate;

        // [::TICKET::] P5-2: Full validation including bit_depth and channel_layout
        if in_rate == out_rate {
            return Err("in_rate and out_rate are identical — no resampling needed");
        }
        // Validate bit_depth compatibility (both formats must use the same bit depth)
        if _in_fmt.bit_depth != _out_fmt.bit_depth {
            return Err("in_fmt and out_fmt have different bit_depth — resampling not supported");
        }
        // Validate channel_layout compatibility (currently only same-layout resampling)
        if _in_fmt.channel_layout != _out_fmt.channel_layout {
            return Err("in_fmt and out_fmt have different channel_layout — resampling not supported");
        }

        Ok(Self { in_rate, out_rate })
    }
}

// ---------------------------------------------------------------------------
// Mono IN/OUT interleave
// ---------------------------------------------------------------------------

/// Interleave two mono `i16` PCM signals into a stereo signal.
///
/// The output format is `[L0, R0, L1, R1, ..., Ln, Rn]` where:
/// - **L** = `in_mono` (received from network / IN channel in `StereoInOut`)
/// - **R** = `out_mono` (sourced from mixer / OUT channel in `StereoInOut`)
///
/// When `in_mono` and `out_mono` have different lengths, the result is
/// truncated to the shorter input (C037 invariant).
///
/// # Invariant (C037)
///
/// For all `i` in `0..n` where `n = min(in_mono.len(), out_mono.len())`:
/// - `output[2 * i] == in_mono[i]`   (L = IN)
/// - `output[2 * i + 1] == out_mono[i]` (R = OUT)
#[must_use]
pub fn interleave_in_out(in_mono: &[i16], out_mono: &[i16]) -> Vec<i16> {
    let common_len = in_mono.len().min(out_mono.len());
    let mut out = Vec::with_capacity(common_len * 2);
    for i in 0..common_len {
        out.push(in_mono[i]);
        out.push(out_mono[i]);
    }
    out
}

// ===========================================================================
// Tests — TDD Red: failing → Green: passing
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fmt::Debug;
    use crate::model::audio_format_chunkpair::{AudioFormat, BitDepth, ChannelLayout};

    // ── C037-Pre: ResamplePipeline construction ─────────────────────────

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn resample_pipeline_stores_format_configs() {
        let in_fmt = AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        let out_fmt = AudioFormat::new(SampleRate::Hz16000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();

        let pipeline = ResamplePipeline::new(in_fmt, out_fmt).unwrap();
        assert_eq!(pipeline.in_rate, SampleRate::Hz48000);
        assert_eq!(pipeline.out_rate, SampleRate::Hz16000);
    }

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn resample_pipeline_rejects_identical_rates() {
        let fmt = AudioFormat::new(SampleRate::Hz16000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        let result = ResamplePipeline::new(fmt, fmt);
        assert!(result.is_err());
    }

    // ── C037-Post: interleave_in_out ────────────────────────────────────

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_maps_in_to_l_and_out_to_r() {
        let in_mono = vec![1i16, 2, 3, 4];
        let out_mono = vec![5i16, 6, 7, 8];
        let stereo = interleave_in_out(&in_mono, &out_mono);
        assert_eq!(stereo.len(), 8);
        assert_eq!(stereo, vec![1, 5, 2, 6, 3, 7, 4, 8]);
    }

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_truncates_to_shorter_input() {
        let in_mono = vec![1i16, 2, 3];
        let out_mono = vec![10i16, 20, 30, 40];
        let stereo = interleave_in_out(&in_mono, &out_mono);
        // Truncated to the shorter (in_mono: 3 samples => 6 output samples)
        assert_eq!(stereo.len(), 6);
        assert_eq!(stereo, vec![1, 10, 2, 20, 3, 30]);
    }

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_truncates_to_shorter_input_reverse() {
        let in_mono = vec![1i16, 2, 3, 4, 5];
        let out_mono = vec![10i16, 20];
        let stereo = interleave_in_out(&in_mono, &out_mono);
        // Truncated to the shorter (out_mono: 2 samples => 4 output samples)
        assert_eq!(stereo.len(), 4);
        assert_eq!(stereo, vec![1, 10, 2, 20]);
    }

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_returns_empty_vec_when_both_empty() {
        let stereo = interleave_in_out(&[], &[]);
        assert!(stereo.is_empty());
    }

    // ── C037-Inv: Stereo L=IN, R=OUT invariant ─────────────────────────

    /// @verifies C037
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_invariant_l_is_in_r_is_out() {
        let in_mono = vec![10i16, 20, 30];
        let out_mono = vec![100i16, 200, 300];
        let stereo = interleave_in_out(&in_mono, &out_mono);
        for i in 0..3 {
            assert_eq!(stereo[2 * i], in_mono[i], "L=IN at index {i}");
            assert_eq!(stereo[2 * i + 1], out_mono[i], "R=OUT at index {i}");
        }
    }

    // ── Normal: trait derives ──────────────────────────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn resample_pipeline_derives_debug_clone_copy() {
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Debug + Clone + Copy>() {}
        assert_traits::<ResamplePipeline>();
    }

    // ── Error cases ────────────────────────────────────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn resample_pipeline_24000_to_8000() {
        let in_fmt = AudioFormat::new(SampleRate::Hz24000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        let out_fmt = AudioFormat::new(SampleRate::Hz8000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        let pipeline = ResamplePipeline::new(in_fmt, out_fmt).unwrap();
        assert_eq!(pipeline.in_rate, SampleRate::Hz24000);
    }

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn resample_pipeline_error_string_is_descriptive() {
        let fmt = AudioFormat::new(SampleRate::Hz48000, BitDepth::I16, ChannelLayout::Mono, 20).unwrap();
        let err = ResamplePipeline::new(fmt, fmt).unwrap_err();
        assert!(!err.is_empty(), "error message must not be empty");
    }

    // ── Boundary: single-sample inputs ────────────────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_single_sample_per_channel() {
        let stereo = interleave_in_out(&[5], &[10]);
        assert_eq!(stereo, vec![5, 10]);
    }

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_empty_in_nonempty_out() {
        let stereo = interleave_in_out(&[], &[1i16, 2, 3]);
        assert!(stereo.is_empty());
    }

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn interleave_nonempty_in_empty_out() {
        let stereo = interleave_in_out(&[1i16, 2, 3], &[]);
        assert!(stereo.is_empty());
    }
}
