
// ChannelSelector unified injection, tap push, mic source.
//
// single `add_audio_source` API switches IN/OUT/BOTH injection via the
// `ChannelSelector` flag; the reactor branches the source into the received
// (IN) path and the send-mix (OUT) path independently (C087 invariant).

/// Channel direction selector — which audio path a source is injected into.
///
/// `In` routes the source to the received-audio path, `Out` routes it to the
/// send-mix path, and `Both` registers the source on both independent paths.
/// The reactor `match` on this enum is exhaustive — a selector is always one
/// of exactly these three values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChannelSelector {
    /// Route the source to the received-audio (受話) path only.
    In,
    /// Route the source to the send-mix (送話) path only.
    Out,
    /// Register the source on both independent paths (§24.4 unified injection).
    Both,
}

/// Split a stereo-interleaved `[L, R, L, R, ...]` sample stream into the
/// paired left (IN) and right (OUT) mono sample vectors.
///
/// A trailing odd sample (no right partner) is discarded; an empty input
/// yields two empty vectors. This is the single conversion behind
/// [`AudioChunkPair::from_processed_frame`].
pub(crate) fn split_stereo_interleaved(stereo: &[i16]) -> (Vec<i16>, Vec<i16>) {
    let mut in_samples = Vec::with_capacity(stereo.len() / 2);
    let mut out_samples = Vec::with_capacity(stereo.len() / 2);
    for pair in stereo.chunks_exact(2) {
        in_samples.push(pair[0]);
        out_samples.push(pair[1]);
    }
    (in_samples, out_samples)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// exhaustive match covers every possible selector.
    #[test]
    fn channel_selector_has_exactly_three_variants() {
        let selectors = [
            ChannelSelector::In,
            ChannelSelector::Out,
            ChannelSelector::Both,
        ];
        for sel in selectors {
            match sel {
                ChannelSelector::In | ChannelSelector::Out | ChannelSelector::Both => {}
            }
        }
        assert_eq!(selectors.len(), 3);
    }

    /// ChannelSelector is Copy — it can be passed by value multiple times.
    #[test]
    fn channel_selector_is_copy() {
        let sel = ChannelSelector::Both;
        let copy = sel; // Copy, not move
        assert_eq!(sel, copy);
    }

    /// split_stereo_interleaved splits [L0,R0,L1,R1,...] into L and R mono.
    #[test]
    fn split_stereo_interleaved_separates_left_and_right() {
        let stereo = vec![1i16, 2, 3, 4];
        let (left, right) = split_stereo_interleaved(&stereo);
        assert_eq!(left, vec![1, 3]);
        assert_eq!(right, vec![2, 4]);
    }

    /// split_stereo_interleaved handles an empty input.
    #[test]
    fn split_stereo_interleaved_empty_input() {
        let (left, right) = split_stereo_interleaved(&[]);
        assert!(left.is_empty());
        assert!(right.is_empty());
    }

    /// split_stereo_interleaved discards a trailing odd sample.
    #[test]
    fn split_stereo_interleaved_discards_odd_trailing_sample() {
        let stereo = vec![1i16, 2, 3];
        let (left, right) = split_stereo_interleaved(&stereo);
        assert_eq!(left, vec![1]);
        assert_eq!(right, vec![2]);
    }
}
