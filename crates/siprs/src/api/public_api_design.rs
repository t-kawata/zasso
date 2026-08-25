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
use crate::config::account_config_spec::AccountConfigPatch;
use crate::error::{SipError, SipErrorKind};
use crate::model::AccountId;
use crate::runtime::command::{Reply, RuntimeCommand};
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

// [::TICKET::] P3-1, P4-1, P10-1, P10-3, P10-4, P11-4, P11-7, P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1|P10-1|P10-3|P10-4|P11-4|P11-7|P12-1) --for-spec --no-implementation-order`.
impl SipAccountHandle {
    /// Create a new `SipAccountHandle`.
    #[instrument(skip(client))]
    pub fn new(client: crate::client::SipClient, id: u64) -> Self {
        Self { client, id }
    }

    /// Return the account identifier.
    #[instrument(skip(self))]
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
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::RegistrationFailed,
                    format!("register failed: {e}"),
                )
            })
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
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::RegistrationFailed,
                    format!("unregister failed: {e}"),
                )
            })
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
                reply: Reply::new(_tx),
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
    /// Queries the reactor's authoritative `ClientState` and maps the stored
    /// `AccountEntry.registration` storage string via `RegistrationState::from_storage_str`.
    /// A missing or invalid account id maps to `Ok(Disabled)` — never panics.
    #[instrument(skip(self))]
    pub async fn registration_state(&self) -> Result<RegistrationState, SipError> {
        let state = self.client.handle().query_state().await.map_err(|e| {
            SipError::new(
                SipErrorKind::NativeError,
                format!("registration_state query failed: {e}"),
            )
        })?;
        let account_id = AccountId::from_u64(self.id).ok();
        let entry = account_id.and_then(|id| state.accounts.get(&id));
        match entry {
            Some(entry) => Ok(RegistrationState::from_storage_str(&entry.registration)),
            None => Ok(RegistrationState::Disabled),
        }
    }

    /// Place an outgoing SIP call through this account.
    ///
    /// Validates the media constraints, submits `RuntimeCommand::MakeCall` via the
    /// reactor, awaits the reply, and returns the backend-assigned `CallId` that
    /// the reactor registered in `ClientState.calls` (C046/C070). A failed call
    /// maps to `SipErrorKind::InviteFailed` — never a fabricated id.
    #[instrument(skip(self, request))]
    pub async fn make_call(
        &self,
        request: crate::api::call_types::OutgoingCallRequest,
    ) -> Result<u64, SipError> {
        // Validate codec constraints before dispatching
        CallMediaConstraints::validate_strict(&request.media.preferred_codecs)?;

        self.client
            .handle()
            .submit_make_call(self.id, request)
            .await
            .map_err(|e| {
                SipError::new(SipErrorKind::InviteFailed, format!("make_call failed: {e}"))
            })
    }

    /// Update the account configuration.
    ///
    /// Merges the patch with the stored config (read from the authoritative
    /// `ClientState`), validates the merged result (C052 fail-fast — no dispatch
    /// on an invalid merge), and submits `RuntimeCommand::UpdateAccount` with the
    /// merged config. The account is never dropped or recreated.
    #[instrument(skip(self, patch))]
    pub async fn update_config(&self, patch: AccountConfigPatch) -> Result<(), SipError> {
        let state = self.client.handle().query_state().await.map_err(|e| {
            SipError::new(
                SipErrorKind::NativeError,
                format!("update_config query failed: {e}"),
            )
        })?;
        let account_id = AccountId::from_u64(self.id).map_err(|_| {
            SipError::new(
                SipErrorKind::AccountNotFound,
                format!("account {} not found", self.id),
            )
        })?;
        let entry = state.accounts.get(&account_id).ok_or_else(|| {
            SipError::new(
                SipErrorKind::AccountNotFound,
                format!("account {} not found", self.id),
            )
        })?;
        let merged = patch.apply(&entry.config)?;

        // The typed submit_update_account builds and awaits the reply channel, so
        // a reactor rejection is surfaced as Err here — never silently dropped.
        self.client
            .handle()
            .submit_update_account(self.id, merged)
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::NativeError,
                    format!("update_config failed: {e}"),
                )
            })
    }

    /// Remove this account from the client.
    ///
    /// Delegates to [`SipClient::remove_account`] with this handle's account id.
    #[instrument(skip(self))]
    pub async fn remove(&self) -> Result<(), SipError> {
        self.client.remove_account(self.id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::SipClient;
    use crate::config::ClientConfig;
    use crate::model::id_design_newtype::CallId;

    #[test]
    // @verifies C012, C026
// [::TICKET::] P3-1, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P15-3) --for-spec --no-implementation-order`.
    fn sip_account_handle_is_clone() {
// [::TICKET::] P3-1, P15-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P15-2|P15-3) --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_clone::<SipAccountHandle>();
    }

    #[test]
    // @verifies C012
    // [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_account_handle_is_debug() {
// [::TICKET::] P3-1, P10-1, P10-3, P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-1|P10-3|P15-2) --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<SipAccountHandle>();
    }

    #[test]
    // @verifies C012, C026
// [::TICKET::] P3-1, P10-1, P10-3, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-1|P10-3|P15-3) --for-spec --no-implementation-order`.
    fn sip_account_handle_is_send() {
// [::TICKET::] P3-1, P10-1, P10-3, P15-2, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-1|P10-3|P15-2|P15-3) --for-spec --no-implementation-order`.
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

    // ── P10-1: registration_state() reads the reactor ClientState ──────

    #[tokio::test]
    // @verifies C017
    // [::TICKET::] P15-3: §62.2 — add_account starts Disabled, so the query
    // round-trip asserts Disabled. The Registered state after a successful
    // registration is production-wired by P15-5 (§62.4).
    async fn registration_state_queries_reactor_and_returns_disabled(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let account_id = client.handle().submit_add_account(account_config).await?;
        let handle = SipAccountHandle::new(client.clone(), account_id);
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Disabled,
            "registration_state must read the reactor ClientState populated by AddAccount"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C013
    async fn registration_state_returns_disabled_for_missing_account(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = SipAccountHandle::new(client.clone(), 99);
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Disabled,
            "a missing account must map to the safe Disabled default"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C013
    async fn registration_state_returns_disabled_for_zero_id(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = SipAccountHandle::new(client.clone(), 0);
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Disabled,
            "AccountId::from_u64(0) is Err — the query must fall back to Disabled without panicking"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C017
    async fn registration_state_maps_reactor_down_to_native_error(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        client.shutdown().await?;
        let handle = SipAccountHandle::new(client, 1);
        let err = handle
            .registration_state()
            .await
            .expect_err("a reactor-down query_state must fail");
        assert_eq!(
            err.kind,
            SipErrorKind::NativeError,
            "query_state failures must map to SipError, never be swallowed"
        );
        Ok(())
    }

    #[test]
    // @verifies C012
    // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
    fn sip_client_and_handle_are_send_and_sync() {
        // C012 invariant: the public API is Send + Sync (complements the
        // existing assert_clone/assert_debug tests above).
        // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P10-1, P10-3, P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3|P15-2) --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
        assert_send::<SipAccountHandle>();
        assert_sync::<SipAccountHandle>();
    }

    #[tokio::test]
    // @verifies C017
    async fn registration_state_signature_returns_result_sip_error(
    ) -> Result<(), Box<dyn std::error::Error>> {
        // C017 invariant: every public account-info query yields Result<T, SipError>.
        // registration_state is async, so its result is an opaque Future;
        // awaiting it must produce Result<RegistrationState, SipError>.
// [::TICKET::] P10-1, P10-3, P15-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3|P15-2) --for-spec --no-implementation-order`.
        fn assert_result_type(_: &Result<RegistrationState, SipError>) {}
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = SipAccountHandle::new(client, 1);
        let result = handle.registration_state().await;
        assert_result_type(&result);
        Ok(())
    }

    // ── P10-3: update_config / remove lifecycle ────────────────────────

    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    fn valid_account_config() -> crate::config::account_config_spec::AccountConfig {
        crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: crate::security::SecretString::new("pass123"),
            ..Default::default()
        }
    }

    #[tokio::test]
    // @verifies C015
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn update_config_applies_patch_to_stored_config() -> Result<(), Box<dyn std::error::Error>>
    {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = client.add_account(valid_account_config()).await?;
        let patch = crate::config::account_config_spec::AccountConfigPatch {
            registrar_uri: Some(Some("sip:new.example.com".into())),
            ..Default::default()
        };
        handle.update_config(patch).await?;
        let state = client.handle().query_state().await?;
        let account_id = AccountId::from_u64(handle.id()).map_err(|_| "invalid account id")?;
        let entry = state.accounts.get(&account_id).ok_or("account missing")?;
        assert_eq!(
            entry.config.registrar_uri.as_deref(),
            Some("sip:new.example.com")
        );
        assert_eq!(
            entry.id,
            handle.id(),
            "update must not recreate the account"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C052
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn update_config_invalid_patch_leaves_config_unchanged(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = client.add_account(valid_account_config()).await?;
        let patch = crate::config::account_config_spec::AccountConfigPatch {
            username: Some(String::new()),
            ..Default::default()
        };
        let err = match handle.update_config(patch).await {
            Err(e) => e,
            Ok(_) => return Err("update_config must reject an invalid patch".into()),
        };
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        let state = client.handle().query_state().await?;
        let account_id = AccountId::from_u64(handle.id()).map_err(|_| "invalid account id")?;
        let entry = state.accounts.get(&account_id).ok_or("account missing")?;
        assert_eq!(
            entry.config.username, "alice",
            "stored config must be unchanged"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C017
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn update_config_missing_account_returns_err() -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = SipAccountHandle::new(client.clone(), 999);
        let err = match handle
            .update_config(crate::config::account_config_spec::AccountConfigPatch::default())
            .await
        {
            Err(e) => e,
            Ok(_) => return Err("update_config must reject a missing account".into()),
        };
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C026
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn update_config_preserves_registration_state() -> Result<(), Box<dyn std::error::Error>>
    {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = client.add_account(valid_account_config()).await?;
        // [::TICKET::] P15-3: §62.2 — add_account starts Disabled, so the
        // preservation assertion pins Disabled → Disabled across update_config.
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Disabled,
            "TestBackend starts the account Disabled on add_account"
        );
        let patch = crate::config::account_config_spec::AccountConfigPatch {
            username: Some("alice2".into()),
            ..Default::default()
        };
        handle.update_config(patch).await?;
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Disabled,
            "update_config must not change the registration state (C026)"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C012
    // [::TICKET::] P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-3 --for-spec --no-implementation-order`.
    async fn sip_account_handle_remove_delegates_to_client(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = client.add_account(valid_account_config()).await?;
        handle.remove().await?;
        assert!(
            client.accounts().await?.is_empty(),
            "remove() must remove the account from the client"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C052
    // Boundary: AccountConfigPatch::default() is a no-op — applying it must
    // leave the authoritative ClientState account entry untouched (C052).
    async fn update_config_noop_patch_leaves_state_unchanged(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = client.add_account(valid_account_config()).await?;
        let account_id = AccountId::from_u64(handle.id()).map_err(|_| "invalid account id")?;

        let state_before = client.handle().query_state().await?;
        let entry_before = state_before
            .accounts
            .get(&account_id)
            .ok_or("account missing")?
            .config
            .clone();

        handle
            .update_config(crate::config::account_config_spec::AccountConfigPatch::default())
            .await?;

        let state_after = client.handle().query_state().await?;
        let entry_after = state_after
            .accounts
            .get(&account_id)
            .ok_or("account missing")?;
        assert_eq!(
            entry_after.config, entry_before,
            "a no-op patch must leave the ClientState account config unchanged"
        );
        client.shutdown().await?;
        Ok(())
    }

    // ── P12-1: make_call returns the backend-assigned CallId ──────

    /// Shared test request for the make_call tests.
    // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
    fn test_call_request() -> crate::api::call_types::OutgoingCallRequest {
        crate::api::call_types::OutgoingCallRequest {
            target_uri: "sip:bob@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::api::call_types::CallMediaPreferences::default(),
            auto_answer_refer: false,
        }
    }

    #[tokio::test]
    // @verifies C070, C046
    // [::TICKET::] P12-1: make_call awaits the MakeCall reply and returns the
    // CallId the reactor registered in client_state.calls (no hardcoded Ok(1)).
    async fn make_call_returns_backend_assigned_id() -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let account_id = client.handle().submit_add_account(account_config).await?;
        let handle = SipAccountHandle::new(client.clone(), account_id);
        let call_id = handle.make_call(test_call_request()).await?;
        assert_eq!(call_id, 1, "TestBackend assigns the first call id 1");
        let state = client.handle().query_state().await?;
        let cid = CallId::from_u64(call_id)?;
        assert_eq!(
            state.calls[&cid].id, call_id,
            "the registered CallEntry.id must equal the returned CallId"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C070
    // [::TICKET::] P12-1: a dropped reply channel (reactor down) must surface an
    // Err mapped to SipErrorKind::InviteFailed — never a hardcoded value.
    async fn make_call_after_shutdown_returns_invite_failed(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let account_id = client.handle().submit_add_account(account_config).await?;
        client.shutdown().await?;
        let handle = SipAccountHandle::new(client, account_id);
        let err = handle
            .make_call(test_call_request())
            .await
            .expect_err("a reactor-down make_call must fail");
        assert_eq!(
            err.kind,
            SipErrorKind::InviteFailed,
            "reactor-down must map to InviteFailed, never fabricate an id"
        );
        Ok(())
    }

    #[tokio::test]
    // @verifies C070
    // [::TICKET::] P12-1: consecutive make_calls return distinct backend-assigned
    // CallIds and grow the calls map by exactly one entry each.
    async fn consecutive_make_calls_return_distinct_ids() -> Result<(), Box<dyn std::error::Error>>
    {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let account_id = client.handle().submit_add_account(account_config).await?;
        let handle = SipAccountHandle::new(client.clone(), account_id);
        let id1 = handle.make_call(test_call_request()).await?;
        let id2 = handle.make_call(test_call_request()).await?;
        assert_ne!(id1, id2, "two calls must never share a CallId");
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        let state = client.handle().query_state().await?;
        assert_eq!(
            state.calls.len(),
            2,
            "one CallEntry per successful MakeCall"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C027, C046
    // [::TICKET::] P12-1: make_call registers a CallEntry with the initial call
    // state and the owning account id under the returned CallId.
    async fn make_call_registers_call_entry_state_calling() -> Result<(), Box<dyn std::error::Error>>
    {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let account_id = client.handle().submit_add_account(account_config).await?;
        let handle = SipAccountHandle::new(client.clone(), account_id);
        let call_id = handle.make_call(test_call_request()).await?;
        let state = client.handle().query_state().await?;
        let entry = &state.calls[&CallId::from_u64(call_id)?];
        assert_eq!(entry.state, "Calling", "initial call state is Calling");
        assert_eq!(entry.account_id, AccountId::from_u64(account_id)?);
        client.shutdown().await?;
        Ok(())
    }

    #[test]
    // @verifies C012
    // [::TICKET::] P12-1: the make_call API surface and its payload are Send+Sync.
    // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
    fn make_call_api_is_send_sync() {
        // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<SipAccountHandle>();
        assert_send_sync::<Result<u64, SipError>>();
        // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_send::<Box<crate::api::call_types::OutgoingCallRequest>>();
    }

    #[test]
    // @verifies C012, C070
    // [::TICKET::] P12-1: RuntimeCommand::MakeCall's reply channel carries the
    // assigned u64 CallId — the widened public command-enum shape.
    // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
    fn runtime_command_makecall_reply_carries_u64() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::MakeCall {
            account_id: 1,
            request: Box::new(test_call_request()),
            reply: Reply::new(tx),
        };
        match cmd {
            RuntimeCommand::MakeCall {
                account_id,
                request,
                reply,
            } => {
                assert_eq!(account_id, 1);
                let _ = request;
                let _ = reply;
            }
            _ => panic!("variant must be MakeCall"),
        }
    }
}
