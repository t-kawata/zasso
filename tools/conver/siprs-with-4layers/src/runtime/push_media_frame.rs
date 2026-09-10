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
//   - NODE_ID=N0109:  push_media_frame wiring
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0109 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P19-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-3 --for-spec --no-implementation-order`.
use crate::audio::pipeline::ProcessedFrame;
use crate::model::CallId;
use crate::runtime::backend::{push_frame_to_tap, AudioTapRegistry};

/// Production tap-supply entry for the conf-port path (§62.40 / N0109 / Q19).
///
/// The PJSIP conf bridge drives the `RustMediaPort` port ops (`get_frame` /
/// `put_frame`, §62.28 / N0097), which deliver raw i16 PCM here. This converts
/// the PCM into a [`ProcessedFrame`] and delegates to the single supply point
/// [`push_frame_to_tap`] — never blocking: `AudioTapSender::try_push` (Realtime)
/// evicts the oldest frame on a full queue and returns synchronously (§62.6).
///
/// RT-boundary note: this runs on the PJSUA RT callback thread, so it performs
/// no locking beyond the tap-registry lookup, no allocation beyond the frame
/// copy, and no await. An unsubscribed call is a silent no-op.
pub(crate) fn on_conf_frame(call_id: CallId, pcm: &[i16], taps: &AudioTapRegistry) {
    let processed = ProcessedFrame::from_i16_stereo(pcm);
    push_frame_to_tap(call_id, &processed, taps);
}

#[cfg(test)]
mod tests {
    use crate::api::audio_subscribe_bp::{tap_channel, AudioTapMode};
    use crate::model::{AccountId, AudioChunk, CallId};
    use crate::runtime::backend::AudioTapRegistry;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    /// C149-Post: on_conf_frame converts i16 PCM → ProcessedFrame → tap supply.
    #[tokio::test]
    // @verifies C149-pre
    // @verifies C149-post
    async fn on_conf_frame_supplies_subscribed_tap() -> Result<(), Box<dyn std::error::Error>> {
        let registry: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
        let (sender, mut handle) = tap_channel(4, AudioTapMode::Realtime);
        registry
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(CallId::from_u64(42)?, (AccountId::from_u64(1)?, sender));
        super::on_conf_frame(CallId::from_u64(42)?, &[1i16, 2, 3, 4], &registry);
        let pair = handle
            .recv()
            .await
            .ok_or_else(|| "on_conf_frame must supply the tap")?;
        assert_eq!(pair.in_chunk, AudioChunk::I16(vec![1, 3]));
        assert_eq!(pair.out_chunk, AudioChunk::I16(vec![2, 4]));
        assert_eq!(pair.call_id, CallId::from_u64(42)?);
        assert_eq!(pair.account_id, AccountId::from_u64(1)?);
        Ok(())
    }

    /// C149-Inv: an unsubscribed call is a silent no-op (never panics).
    #[tokio::test]
    // @verifies C149-inv
    async fn on_conf_frame_unsubscribed_call_is_noop() -> Result<(), Box<dyn std::error::Error>> {
        let registry: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
        super::on_conf_frame(CallId::from_u64(42)?, &[0i16, 0], &registry);
        Ok(())
    }

    /// C148-Inv / C151-Inv: an empty frame is supplied and a full Realtime queue
    /// evicts the oldest frame synchronously (the push path never blocks).
    #[tokio::test]
    // @verifies C148-inv
    // @verifies C151-inv
    async fn on_conf_frame_empty_pcm_and_full_queue_never_block(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let registry: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
        let (sender, mut handle) = tap_channel(2, AudioTapMode::Realtime);
        registry
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(CallId::from_u64(1)?, (AccountId::from_u64(1)?, sender));
        super::on_conf_frame(CallId::from_u64(1)?, &[], &registry);
        let empty = handle.recv().await.ok_or_else(|| "empty frame delivered")?;
        assert_eq!(empty.in_chunk, AudioChunk::I16(vec![]));
        super::on_conf_frame(CallId::from_u64(1)?, &[1i16, 1], &registry);
        super::on_conf_frame(CallId::from_u64(1)?, &[2i16, 2], &registry);
        super::on_conf_frame(CallId::from_u64(1)?, &[3i16, 3], &registry);
        let first = handle.recv().await.ok_or_else(|| "frame 2 admitted")?;
        assert_eq!(first.in_chunk, AudioChunk::I16(vec![2]));
        let second = handle.recv().await.ok_or_else(|| "frame 3 admitted")?;
        assert_eq!(second.in_chunk, AudioChunk::I16(vec![3]));
        Ok(())
    }

    /// C148-Inv: i16::MIN / i16::MAX samples survive the conversion unchanged.
    #[tokio::test]
    // @verifies C148-inv
    async fn on_conf_frame_i16_boundaries_survive() -> Result<(), Box<dyn std::error::Error>> {
        let registry: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
        let (sender, mut handle) = tap_channel(4, AudioTapMode::Realtime);
        registry
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(CallId::from_u64(1)?, (AccountId::from_u64(1)?, sender));
        super::on_conf_frame(CallId::from_u64(1)?, &[i16::MIN, i16::MAX], &registry);
        let pair = handle.recv().await.ok_or_else(|| "boundary frame delivered")?;
        assert_eq!(pair.in_chunk, AudioChunk::I16(vec![i16::MIN]));
        assert_eq!(pair.out_chunk, AudioChunk::I16(vec![i16::MAX]));
        Ok(())
    }
}
