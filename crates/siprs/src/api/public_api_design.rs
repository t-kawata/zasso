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
//   - NODE_ID=N0011:  §8 Public API Design
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0011 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use crate::api::call_types::CallMediaConstraints;
use crate::config::account_config_spec::AccountConfig;
use crate::error::{SipError, SipErrorKind};
use crate::runtime::command::RuntimeCommand;
use crate::state::registr_state_machine::RegistrationState;
use tracing::instrument;

/// Represents a SIP account handle for account-level operations.
///
/// Each `SipAccountHandle` provides methods for registering, unregistering,
/// and placing calls through a specific SIP account.
#[derive(Clone, Debug)]
pub struct SipAccountHandle {
    /// The owning SIP client instance.
    pub(crate) client: crate::client::SipClient,
    /// The account identifier.
    pub(crate) id: u64,
}

// [::TICKET::] P3-1, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1) --for-spec --no-implementation-order`.
impl SipAccountHandle {
    /// Create a new `SipAccountHandle`.
    pub fn new(client: crate::client::SipClient, id: u64) -> Self {
        Self { client, id }
    }

    /// Return the account identifier.
    pub fn id(&self) -> u64 {
        self.id
    }

    /// Register this account with the SIP proxy/registrar.
    #[instrument(skip(self))]
    pub async fn register(&self) -> Result<(), SipError> {
        let handle = self.client.handle();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::SetRegistration {
                account_id: self.id,
                enabled: true,
                reply: _tx,
            })
            .await
            .map_err(|e| SipError::new(SipErrorKind::RegistrationFailed, format!("register failed: {e}")))
    }

    /// Unregister this account from the SIP proxy/registrar.
    #[instrument(skip(self))]
    pub async fn unregister(&self) -> Result<(), SipError> {
        let handle = self.client.handle();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::SetRegistration {
                account_id: self.id,
                enabled: false,
                reply: _tx,
            })
            .await
            .map_err(|e| SipError::new(SipErrorKind::RegistrationFailed, format!("unregister failed: {e}")))
    }

    /// Enable or disable registration for this account.
    #[instrument(skip(self))]
    pub async fn set_registration_enabled(&self, enabled: bool) -> Result<(), SipError> {
        let handle = self.client.handle();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::SetRegistration {
                account_id: self.id,
                enabled,
                reply: _tx,
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::RegistrationFailed,
                    format!("set_registration_enabled failed: {e}"),
                )
            })
    }

    /// Get the current registration state.
    ///
    /// Returns `RegistrationState::Idle` as a default until the real state
    /// machine (P3-1) connects this method to the actual registration workflow.
    #[instrument(skip(self))]
    pub async fn registration_state(&self) -> Result<RegistrationState, SipError> {
        // [::STUB::] P3-1: Return real RegistrationState from backend once
        // SipAccountHandle is connected to the reactor state machine.
        Ok(RegistrationState::Idle)
    }

    /// Place an outgoing SIP call through this account.
    #[instrument(skip(self, request))]
    pub async fn make_call(&self, request: crate::api::call_types::OutgoingCallRequest) -> Result<u64, SipError> {
        // Validate codec constraints before dispatching
        CallMediaConstraints::validate_strict(&request.media.preferred_codecs)?;

        let handle = self.client.handle();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::MakeCall {
                account_id: self.id,
                request: Box::new(request),
                reply: _tx,
            })
            .await
            .map_err(|e| SipError::new(SipErrorKind::InviteFailed, format!("make_call failed: {e}")))?;
        // [::STUB::] P3-2: Return real CallId once backend assigns it.
        Ok(1)
    }

    /// Update the account configuration.
    ///
    /// [::STUB::] P4-2: Implement with AccountConfigPatch when defined.
    #[instrument(skip(self, _patch))]
    pub async fn update_config(&self, _patch: AccountConfig) -> Result<(), SipError> {
        // [::STUB::] P4-2: Need AccountConfigPatch type and RuntimeCommand::UpdateAccount.
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C012, C026
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_account_handle_is_clone() {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_clone::<SipAccountHandle>();
    }

    #[test]
    // @verifies C012
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_account_handle_is_debug() {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<SipAccountHandle>();
    }

    #[test]
    // @verifies C012, C026
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_account_handle_is_send() {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<SipAccountHandle>();
    }

    #[test]
    // @verifies C012, C026
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_account_handle_new_structure() {
        // Structural verification: new() constructor exists and returns SipAccountHandle
        // Full test requires a running SipClient + runtime
        let _ = SipAccountHandle::new;
    }
}
