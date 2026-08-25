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

use crate::config::ClientConfig;
use crate::runtime::backend::SipBackend;
use crate::runtime::command::ReactorError;

#[cfg(feature = "pjsua-native")]
use crate::runtime::backend::PjsuaBackend;

#[cfg(any(test, feature = "test-util"))]
use crate::runtime::backend::TestBackend;

/// Select the SIP backend for the reactor based on the active feature set.
///
/// §62.2 — the production backend is `PjsuaBackend`, selected by the
/// `pjsua-native` feature. Test builds (unit tests, or the `test-util` feature
/// used by integration tests) select the deterministic `TestBackend` so Layer 2
/// tests never touch PJSUA. A build with neither the feature nor a test mode
/// fails fast with an explicit error instead of silently running on a mock.
///
/// `config` is currently unused (`_config`) — `PjsuaBackend::new()` and
/// `TestBackend::default()` take no configuration, but the parameter keeps the
/// RFC signature so a future backend that consumes config does not ripple here.
#[cfg(feature = "pjsua-native")]
pub(crate) fn create_backend(_config: &ClientConfig) -> Result<Box<dyn SipBackend>, ReactorError> {
    Ok(Box::new(PjsuaBackend::new()))
}

#[cfg(all(any(test, feature = "test-util"), not(feature = "pjsua-native")))]
pub(crate) fn create_backend(_config: &ClientConfig) -> Result<Box<dyn SipBackend>, ReactorError> {
    Ok(Box::new(TestBackend::default()))
}

#[cfg(all(not(any(test, feature = "test-util")), not(feature = "pjsua-native")))]
pub(crate) fn create_backend(_config: &ClientConfig) -> Result<Box<dyn SipBackend>, ReactorError> {
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

    #[test]
    // @verifies C083
    #[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn create_backend_returns_test_backend_in_test_build() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = create_backend(&ClientConfig::default())?;
        let config = AccountConfig::default();
        let (id, entry) = backend.add_account(&config)?;
        assert_eq!(id, 1, "dispatch proves the concrete TestBackend");
        assert_eq!(entry.registration, "Disabled");
        Ok(())
    }

    #[test]
    // @verifies C082
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn unsupported_backend_error_matches_requirement() {
        let err = unsupported_backend_error();
        assert!(matches!(
            err,
            ReactorError::BackendError(msg) if msg.contains("pjsua-native")
        ));
    }

    #[test]
    // @verifies C083
    #[cfg(not(feature = "pjsua-native"))]
// [::TICKET::] P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-3 --for-spec --no-implementation-order`.
    fn test_backend_set_registration_transitions() -> Result<(), Box<dyn std::error::Error>> {
        let mut backend = TestBackend::default();
        let config = AccountConfig::default();
        let (id, _) = backend.add_account(&config)?;
        backend.set_registration(id, true)?;
        assert_eq!(
            backend.registration_state(id),
            Some(RegistrationState::Registering)
        );
        backend.set_registration(id, false)?;
        assert_eq!(
            backend.registration_state(id),
            Some(RegistrationState::Unregistering)
        );
        Ok(())
    }
}
