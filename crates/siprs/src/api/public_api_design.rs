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

// [::TICKET::] P3-1, P4-1, P10-1, P10-3, P10-4, P11-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P4-1|P10-1|P10-3|P10-4|P11-4) --for-spec --no-implementation-order`.
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
    #[instrument(skip(self, request))]
    pub async fn make_call(
        &self,
        request: crate::api::call_types::OutgoingCallRequest,
    ) -> Result<u64, SipError> {
        // Validate codec constraints before dispatching
        CallMediaConstraints::validate_strict(&request.media.preferred_codecs)?;

        let handle = self.client.handle();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::MakeCall {
                account_id: self.id,
                request: Box::new(request),
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| {
                SipError::new(SipErrorKind::InviteFailed, format!("make_call failed: {e}"))
            })?;
        // [::STUB::] P12-1: CallId is hardcoded to 1 -- Wire the real CallId assigned by the backend reactor from the MakeCall reply into the public API
        Ok(1)
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

        let handle = self.client.handle();
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::UpdateAccount {
                account_id: self.id,
                config: merged,
                reply: Reply::new(_tx),
            })
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
        // [::TICKET::] P3-1, P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-1|P10-3) --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<SipAccountHandle>();
    }

    #[test]
    // @verifies C012, C026
    // [::TICKET::] P3-1, P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-1|P10-3) --for-spec --no-implementation-order`.
    fn sip_account_handle_is_send() {
        // [::TICKET::] P3-1, P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P3-1|P10-1|P10-3) --for-spec --no-implementation-order`.
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
    async fn registration_state_queries_reactor_and_returns_registered(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        let (client, _rx) = SipClient::new(config).await?;
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let account_id = client.handle().submit_add_account(account_config).await?;
        let handle = SipAccountHandle::new(client.clone(), account_id);
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Registered,
            "registration_state must read the reactor ClientState populated by AddAccount"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    // @verifies C013
    async fn registration_state_returns_disabled_for_missing_account(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
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
        // [::TICKET::] P10-1, P10-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-1|P10-3) --for-spec --no-implementation-order`.
        fn assert_result_type(_: &Result<RegistrationState, SipError>) {}
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        let (client, _rx) = SipClient::new(config).await?;
        let handle = client.add_account(valid_account_config()).await?;
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Registered,
            "MockBackend stores 'Registered' on add_account"
        );
        let patch = crate::config::account_config_spec::AccountConfigPatch {
            username: Some("alice2".into()),
            ..Default::default()
        };
        handle.update_config(patch).await?;
        assert_eq!(
            handle.registration_state().await?,
            RegistrationState::Registered,
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
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
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
}
