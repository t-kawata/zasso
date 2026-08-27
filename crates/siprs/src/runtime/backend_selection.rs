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
//   - NODE_ID=N0071:  62.2 バックエンド選択機構（PjsuaBackend 完全統一・MockBackend 削除）
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0071 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P15-3: §62.2 backend selection — PjsuaBackend full unification,
// MockBackend deletion, TestBackend (cfg test / test-util).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::config::ClientConfig;
use crate::runtime::audio_worker::AudioMixer;
use crate::runtime::backend::{AudioTapRegistry, SipBackend};
use crate::runtime::command::ReactorError;

#[cfg(feature = "pjsua-native")]
use crate::runtime::backend::PjsuaBackend;

#[cfg(any(test, feature = "test-util"))]
use crate::runtime::backend::TestBackend;

/// The reactor-owned per-call `AudioMixer` map (§62.6 / PX-3).
///
/// `PjsuaBackend` needs a clone to build a `RustMediaPort` per call during
/// `register_conf_callback`; the test/unsupported branches ignore it.
pub(crate) type AudioMixerMap = Arc<RwLock<HashMap<u64, Arc<AudioMixer>>>>;

/// Select the SIP backend for the reactor based on the active feature set.
///
/// §62.2 — the production backend is `PjsuaBackend`, selected by the
/// `pjsua-native` feature. Test builds (unit tests, or the `test-util` feature
/// used by integration tests) select the deterministic `TestBackend` so Layer 2
/// tests never touch PJSUA. A build with neither the feature nor a test mode
/// fails fast with an explicit error instead of silently running on a mock.
///
/// `config` is currently unused (`_config`) — the backends take no
/// configuration, but the parameter keeps the RFC signature so a future backend
/// that consumes config does not ripple here. `audio_taps` is the shared
/// `subscribe_audio` registry (§62.6) — `PjsuaBackend` needs it to drive taps;
/// `TestBackend` records `push_media_frame` invocations and ignores it.
#[cfg(feature = "pjsua-native")]
pub(crate) fn create_backend(
    _config: &ClientConfig,
    audio_taps: AudioTapRegistry,
    audio_mixers: AudioMixerMap,
) -> Result<Box<dyn SipBackend>, ReactorError> {
    Ok(Box::new(PjsuaBackend::with_registries(
        audio_taps,
        audio_mixers,
    )))
}

#[cfg(all(any(test, feature = "test-util"), not(feature = "pjsua-native")))]
pub(crate) fn create_backend(
    _config: &ClientConfig,
    _audio_taps: AudioTapRegistry,
    _audio_mixers: AudioMixerMap,
) -> Result<Box<dyn SipBackend>, ReactorError> {
    Ok(Box::new(TestBackend::default()))
}

#[cfg(all(not(any(test, feature = "test-util")), not(feature = "pjsua-native")))]
pub(crate) fn create_backend(
    _config: &ClientConfig,
    _audio_taps: AudioTapRegistry,
    _audio_mixers: AudioMixerMap,
) -> Result<Box<dyn SipBackend>, ReactorError> {
    Err(unsupported_backend_error())
}

/// The explicit error for a build without `pjsua-native` and without test mode.
///
/// The message is a single source of truth shared by the cfg-excluded error
/// branch and its unit test, so the non-test build path stays testable even
/// though the branch itself is mutually exclusive with `cfg(test)`.
#[cfg(any(test, all(not(feature = "pjsua-native"), not(feature = "test-util"))))]
pub(crate) fn unsupported_backend_error() -> ReactorError {
    ReactorError::BackendError("SipClient requires the `pjsua-native` feature".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::account_config_spec::AccountConfig;
    use crate::state::registr_state_machine::RegistrationState;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    #[test]
    // @verifies C083
    #[cfg(not(feature = "pjsua-native"))]
    // [::TICKET::] P15-3, P15-5, P15-7, PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|P15-5|P15-7|PX-3) --for-spec --no-implementation-order`.
    fn create_backend_returns_test_backend_in_test_build() -> Result<(), Box<dyn std::error::Error>>
    {
        let audio_taps = Arc::new(Mutex::new(HashMap::new()));
        let audio_mixers: AudioMixerMap = Arc::new(RwLock::new(HashMap::new()));
        let mut backend = create_backend(&ClientConfig::default(), audio_taps, audio_mixers)?;
        let config = AccountConfig::default();
        let (id, entry) = backend.add_account(&config)?;
        assert_eq!(id, 1, "dispatch proves the concrete TestBackend");
        assert_eq!(
            entry.registration,
            RegistrationState::Disabled,
            "§62.2/§62.4 initial registration is Disabled"
        );
        Ok(())
    }

    #[test]
    // [::TICKET::] PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-3 --for-spec --no-implementation-order`.
    fn create_backend_accepts_audio_mixers_map() -> Result<(), Box<dyn std::error::Error>> {
        // The signature change (PX-3 / C119-pre) must not break selection: the
        // test build ignores the mixer map and still yields the TestBackend.
        let audio_taps = Arc::new(Mutex::new(HashMap::new()));
        let audio_mixers: AudioMixerMap = Arc::new(RwLock::new(HashMap::new()));
        let mut backend = create_backend(&ClientConfig::default(), audio_taps, audio_mixers)?;
        assert_eq!(
            backend.add_account(&AccountConfig::default())?.0,
            1,
            "mixer map must not change backend selection"
        );
        Ok(())
    }

    #[test]
    // @verifies C082
    // [::TICKET::] P15-3, PX-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|PX-3) --for-spec --no-implementation-order`.
    fn unsupported_backend_error_matches_requirement() {
        let err = unsupported_backend_error();
        assert!(matches!(
            err,
            ReactorError::BackendError(msg) if msg.contains("pjsua-native")
        ));
    }

    #[test]
    // @verifies C083, C126, C127
    #[cfg(not(feature = "pjsua-native"))]
    // [::TICKET::] P15-3, PX-3, P17-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P15-3|PX-3|P17-4) --for-spec --no-implementation-order`.
    fn test_backend_set_registration_reaches_outcome_state() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::default();
        let config = AccountConfig::default();
        let (id, _) = backend.add_account(&config)?;
        // P17-4 §62.24: the deterministic simulator reports the OUTCOME state
        // (Registered for enable / Idle for disable) so get_account_info returns
        // a publishable status.
        backend.set_registration(id, true)?;
        assert_eq!(
            backend.registration_state(id),
            Some(RegistrationState::Registered)
        );
        backend.set_registration(id, false)?;
        assert_eq!(
            backend.registration_state(id),
            Some(RegistrationState::Idle)
        );
        Ok(())
    }
}
