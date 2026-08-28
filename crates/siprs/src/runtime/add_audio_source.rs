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
//   - NODE_ID=N0110:  AddAudioSource re-register
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0110 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================


use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use crate::audio::media_path_arch::ChannelSelector;
use crate::runtime::audio_worker::{AsyncAudioSource, AudioMixer};
use crate::runtime::backend::SipBackend;
use crate::runtime::backend_selection::AudioMixerMap;
use crate::runtime::command::ReactorError;
use crate::runtime::reactor::get_or_create_mixer;

/// Reactor-owned state the AddAudioSource orchestration reads from (§62.41).
///
/// Bundles the per-call mixer map, the global source-id counter, and the SIP
/// backend so `handle_add_audio_source` takes one context argument instead of
/// three thread-local dependencies.
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
pub(crate) struct AddAudioSourceContext<'a> {
    pub(crate) audio_mixers: &'a AudioMixerMap,
    pub(crate) source_id_counter: &'a Arc<AtomicU64>,
    pub(crate) backend: &'a mut dyn SipBackend,
}

/// Add an audio source to a call's mixer and re-register the call's
/// `RustMediaPort` in the conf bridge (§62.41 / N0110).
///
/// Reads as prose: create (or reuse) the per-call mixer, branch the source into
/// the IN / OUT / both media paths via `ChannelSelector`, then re-register the
/// call's `RustMediaPort` via `ensure_conf_port_for_call` so the conf bridge
/// drives the port ops instead of the mixer's `out_queue` accumulating injected
/// audio (H14: 64 frames ≈ 1.28s then dropped). Returns the assigned
/// `source_id` together with the mixer so the caller can spawn the per-call
/// worker on success.
///
/// Runs on the reactor thread, the single writer of the mixer map
/// (single-writer rule).
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
pub(crate) fn handle_add_audio_source(
    ctx: AddAudioSourceContext<'_>,
    call_id: u64,
    source: Box<dyn AsyncAudioSource + Send>,
    channels: ChannelSelector,
) -> Result<(u64, Arc<AudioMixer>), ReactorError> {
    let mixer = get_or_create_mixer(ctx.audio_mixers, ctx.source_id_counter, call_id);
    let source_id = match channels {
        ChannelSelector::In => mixer.add_in_source(source),
        ChannelSelector::Out => mixer.add_out_source(source),
        ChannelSelector::Both => {
            // AudioMixer guards sources with a tokio Mutex (async next_chunk),
            // so the shared wrapper must be tokio::sync::Mutex too.
            let shared = Arc::new(tokio::sync::Mutex::new(source));
            let in_id = mixer.add_in_source_shared(shared.clone());
            mixer.add_out_source_shared(shared);
            in_id
        }
    };
    // §62.41 / N0110: re-register the call's RustMediaPort in the conf bridge
    // so injected audio is pulled by the bridge instead of accumulating in the
    // mixer's out_queue (H14: 64 frames ≈ 1.28s then dropped).
    ctx.backend.ensure_conf_port_for_call(call_id)?;
    Ok((source_id, mixer))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicU64;
    use std::sync::{Arc, Mutex, RwLock};

    use crate::audio::media_path_arch::ChannelSelector;
    use crate::ffi::bindings;
    use crate::runtime::audio_worker::{AsyncAudioSource, AudioMixer, MockAsyncAudioSource};
    use crate::runtime::backend::{AudioTapRegistry, PjsuaBackend};
    use crate::runtime::backend_selection::AudioMixerMap;
    use crate::runtime::command::ReactorError;

    /// Build an empty `PjsuaBackend` sharing an empty per-call mixer map, so
    /// tests can observe conf-bridge registration through the stub bridge.
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
    fn test_backend_with_empty_mixers() -> (PjsuaBackend, AudioMixerMap) {
        let mixers: AudioMixerMap = Arc::new(RwLock::new(HashMap::new()));
        let taps: AudioTapRegistry = Arc::new(Mutex::new(HashMap::new()));
        let backend = PjsuaBackend::with_registries(taps, mixers.clone());
        (backend, mixers)
    }

    #[test]
    // @verifies C149
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
    fn add_audio_source_registers_new_mixer_in_conf_bridge() -> Result<(), ReactorError> {
        bindings::stub_test_hooks::with_conf_add_port_status(bindings::PJ_SUCCESS, || {
            let (mut backend, mixers) = test_backend_with_empty_mixers();
            let source: Box<dyn AsyncAudioSource + Send> =
                Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
            let (source_id, _mixer) = handle_add_audio_source(
                AddAudioSourceContext {
                    audio_mixers: &mixers,
                    source_id_counter: &Arc::new(AtomicU64::new(0)),
                    backend: &mut backend,
                },
                1,
                source,
                ChannelSelector::In,
            )?;
            assert_eq!(source_id, 0, "first source assigned id 0");
            assert!(
                backend.registered_port_ids().contains(&1),
                "RustMediaPort registered for call 1"
            );
            assert_eq!(backend.conf_connect_pairs().len(), 1, "call slot connected");
            assert_eq!(backend.registered_port_count(), 1, "one port registered");
            Ok(())
        })
    }

    #[test]
    // @verifies C149
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
    fn add_audio_source_surfaces_conf_add_failure_as_native_error() -> Result<(), ReactorError> {
        bindings::stub_test_hooks::with_conf_add_port_status(bindings::PJ_EUNKNOWN, || {
            let (mut backend, mixers) = test_backend_with_empty_mixers();
            let source: Box<dyn AsyncAudioSource + Send> =
                Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
            let result = handle_add_audio_source(
                AddAudioSourceContext {
                    audio_mixers: &mixers,
                    source_id_counter: &Arc::new(AtomicU64::new(0)),
                    backend: &mut backend,
                },
                1,
                source,
                ChannelSelector::In,
            );
            // Match on the Err variant alone: the Ok payload (Arc<AudioMixer>)
            // is deliberately not Debug, so a whole-Result match would fail.
            let err = match result {
                Err(e) => e,
                Ok(_) => {
                    return Err(ReactorError::BackendError(
                        "expected conf_add_port failure".into(),
                    ))
                }
            };
            match err {
                ReactorError::NativeError { native_status, .. } => {
                    assert_eq!(native_status, bindings::PJ_EUNKNOWN);
                }
                other => {
                    return Err(ReactorError::BackendError(format!(
                        "expected NativeError, got {other:?}"
                    )))
                }
            }
            assert!(
                !backend.registered_port_ids().contains(&1),
                "failed conf_add_port must not mark the call registered"
            );
            Ok(())
        })
    }

    #[test]
    // @verifies C149
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
    fn add_audio_source_defers_connect_when_conf_slot_not_established(
    ) -> Result<(), ReactorError> {
        bindings::stub_test_hooks::with_conf_add_port_status(bindings::PJ_SUCCESS, || {
            let (mut backend, mixers) = test_backend_with_empty_mixers();
            // A call id whose i32 truncation is negative has no established
            // conf slot in the stub bridge (call_conf_port echoes the id as
            // i32), so the port is registered but the connect is deferred.
            let unestablished_call: u64 = i32::MAX as u64 + 1;
            let source: Box<dyn AsyncAudioSource + Send> =
                Box::new(MockAsyncAudioSource::new(vec![0i16; 160]));
            let (source_id, _mixer) = handle_add_audio_source(
                AddAudioSourceContext {
                    audio_mixers: &mixers,
                    source_id_counter: &Arc::new(AtomicU64::new(0)),
                    backend: &mut backend,
                },
                unestablished_call,
                source,
                ChannelSelector::Both,
            )?;
            assert_eq!(source_id, 0, "first source assigned id 0");
            assert!(
                backend.registered_port_ids().contains(&unestablished_call),
                "port registered even without a conf slot"
            );
            assert_eq!(
                backend.conf_connect_pairs().len(),
                0,
                "connect deferred until media is active"
            );
            Ok(())
        })
    }

    #[test]
    // @verifies C149
// [::TICKET::] P19-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P19-4 --for-spec --no-implementation-order`.
    fn register_media_ports_for_calls_is_reentrant() -> Result<(), ReactorError> {
        bindings::stub_test_hooks::with_conf_add_port_status(bindings::PJ_SUCCESS, || {
            let (mut backend, mixers) = test_backend_with_empty_mixers();
            mixers
                .write()
                .unwrap_or_else(|e| e.into_inner())
                .insert(1, Arc::new(AudioMixer::default()));
            mixers
                .write()
                .unwrap_or_else(|e| e.into_inner())
                .insert(2, Arc::new(AudioMixer::default()));
            backend.register_media_ports_for_calls()?;
            assert_eq!(backend.registered_port_ids().len(), 2, "two calls registered");
            assert_eq!(
                backend.conf_connect_pairs().len(),
                2,
                "each call slot connected"
            );

            // A third mixer appears (AddAudioSource path). Re-running the bulk
            // registration must register only the new call — calls 1 and 2 are
            // already in registered_port_ids, so they are not re-registered.
            mixers
                .write()
                .unwrap_or_else(|e| e.into_inner())
                .insert(3, Arc::new(AudioMixer::default()));
            backend.register_media_ports_for_calls()?;
            assert_eq!(
                backend.registered_port_ids().len(),
                3,
                "re-run registers only the new call"
            );
            assert_eq!(
                backend.conf_connect_pairs().len(),
                1,
                "only the new call's connect is recorded in this pass"
            );
            assert_eq!(
                backend.registered_port_count(),
                1,
                "one new port registered this pass"
            );
            Ok(())
        })
    }
}
