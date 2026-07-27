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

//! Public API — SipClient, SipAccountHandle, and supporting types.
//!
//! Defines the crate's primary public interface: `SipClient` (the top-level
//! handle for SIP client lifecycle and account management), `SipAccountHandle`
//! (per-account operations), `OutgoingCallRequest`, `CallMediaPreferences`,
//! `RegistrationState`, `Codec`, and related types.
//!
//! ## Architecture
//!
//! `SipClient` wraps an `Arc<ClientInner>` for cheap Clone + Send + Sync.
//! `ClientInner` holds the runtime handle, event bus, state lock, and shutdown
//! channel — these are delegated to the runtime module (P3-2) for actual
//! implementation.

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::config::AccountConfig;
use crate::config::AccountConfigPatch;
use crate::config::transport_ice_spec::AuthOverride;
use crate::error::SipError;

// ---------------------------------------------------------------------------
// RuntimeHandle — placeholder (resolved by P3-2)
// ---------------------------------------------------------------------------

// [::STUB::] P3-2: RuntimeHandle will be replaced with the real reactor handle
// (command sender, task tracker, etc.) once the runtime module is implemented.
/// Handle to the PJSIP reactor runtime.
///
/// Currently a placeholder; will be replaced by the real RuntimeHandle from the
/// runtime module (P3-2).
#[derive(Debug, Clone)]
pub(crate) struct RuntimeHandle;

// ---------------------------------------------------------------------------
// ClientState — placeholder (resolved by P3-2)
// ---------------------------------------------------------------------------

// [::STUB::] P3-2: ClientState will be replaced with the real state struct
// containing account index, call index, registration states, etc.
/// Internal mutable state of a SIP client.
///
/// Currently a placeholder; will contain account and call indexes when the
/// runtime module (P3-2) is implemented.
#[derive(Debug, Default)]
pub(crate) struct ClientState {
    // [::STUB::] P3-2: account_index, call_index, registration_states, etc.
}

// ---------------------------------------------------------------------------
// ClientInner — inner state shared via Arc
// ---------------------------------------------------------------------------

/// Inner state shared across all `SipClient` clones via `Arc`.
///
/// Contains the runtime handle, event bus, state lock, and shutdown channel.
/// Construction and field population are delegated to `SipClient::new()`.
#[derive(Debug)]
pub(crate) struct ClientInner {
    /// Handle to the async reactor runtime for command dispatch.
    // [::STUB::] P3-2: runtime field populated once RuntimeHandle is real.
    #[allow(dead_code)]
    pub(crate) runtime: RuntimeHandle,
    /// Event bus for subscribing to SIP events.
    // [::STUB::] P0-4: events: EventBus — EventBus is defined as pub(crate)
    // in eventbus_receiver.rs. It is not yet declared as a module item here.
    // For now we use a placeholder channel pair.
    pub(crate) _events_tx: tokio::sync::broadcast::Sender<()>,
    pub(crate) _events_rx: tokio::sync::broadcast::Receiver<()>,
    /// Internal mutable client state protected by a read-write lock.
    pub(crate) state: RwLock<ClientState>,
    /// Shutdown signal sender — closing this triggers graceful shutdown.
    pub(crate) _shutdown: tokio::sync::watch::Sender<bool>,
}

// ---------------------------------------------------------------------------
// SipClient — top-level handle
// ---------------------------------------------------------------------------

/// A thread-safe, clone-able handle to a SIP client instance.
///
/// `SipClient` is the primary entry point for all SIP operations. It wraps
/// an `Arc<ClientInner>` providing cheap clone semantics (shared state) and
/// automatic Send + Sync.
///
/// ## Lifecycle
///
/// 1. **Create** with `SipClient::new(config)`.
/// 2. **Use** — subscribe to events, add/remove accounts, make calls.
/// 3. **Shutdown** with `SipClient::shutdown()` — no further operations allowed.
///
/// ## Thread safety
///
/// `SipClient` implements `Send + Sync` because `ClientInner` is behind an
/// `Arc` and all internal state is protected by `RwLock` or message channels.
#[derive(Debug, Clone)]
pub struct SipClient {
    inner: Arc<ClientInner>,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl SipClient {
    /// Creates a new SIP client with the given configuration.
    ///
    /// Initialises the event bus, state lock, and shutdown channel. The
    /// actual PJSIP runtime initialisation is deferred to the runtime
    /// module (P3-2).
    ///
    /// # Errors
    ///
    /// Returns `SipError` if the configuration is invalid.
    // [::STUB::] P3-2: PJSIP runtime init deferred — currently only validates config.
    pub async fn new(_config: crate::config::client_config_spec::ClientConfig) -> Result<Self, SipError> {
        let (_tx, _rx) = tokio::sync::broadcast::channel(16);
        let (_shutdown_tx, _shutdown_rx) = tokio::sync::watch::channel(false);
        let inner = Arc::new(ClientInner {
            runtime: RuntimeHandle,
            _events_tx: _tx,
            _events_rx: _rx,
            state: RwLock::new(ClientState::default()),
            _shutdown: _shutdown_tx,
        });
        Ok(SipClient { inner })
    }

    /// Subscribes to the control event stream.
    ///
    /// Returns a `broadcast::Receiver` that receives `SipEvent` values
    /// published by the internal `EventBus`.
    // [::STUB::] P3-2: Real EventBus integration — currently returns a placeholder receiver.
    // [::STUB::] P0-4: Make pub once SipEvent is pub (currently pub(crate)).
    #[allow(dead_code)]
    pub(crate) fn subscribe(&self) -> tokio::sync::broadcast::Receiver<crate::api::event_model_payload_bus::SipEvent> {
        let (_tx, rx) = tokio::sync::broadcast::channel(16);
        rx
    }

    /// Subscribes to raw SIP messages.
    ///
    /// Returns `Some(Receiver)` when `ClientConfig::raw_sip_events` is enabled,
    /// or `None` when disabled.
    // [::STUB::] P3-2: Real RawSipMessage integration.
    // [::STUB::] P0-4: RawSipMessage type defined in raw_sip_message_spec (pub(crate)).
    pub fn subscribe_raw_sip(&self) -> Option<tokio::sync::broadcast::Receiver<String>> {
        // [::STUB::] P3-2: Check ClientConfig.raw_sip_events.enabled.
        None
    }

    /// Subscribes to events for a specific account.
    ///
    /// Returns an `AccountEventReceiver` that filters the global event stream
    /// to events scoped to the given `account_id`.
    // [::STUB::] P3-2: Real AccountEventReceiver integration.
    // [::STUB::] P0-4: Make pub once AccountEventReceiver is pub (currently pub(crate)).
    #[allow(dead_code)]
    pub(crate) fn subscribe_account(
        &self,
        account_id: crate::concurrency_contexts::command_serialization::AccountId,
    ) -> crate::api::eventbus_receiver::AccountEventReceiver {
        let (_tx, rx) = tokio::sync::broadcast::channel(16);
        crate::api::eventbus_receiver::AccountEventReceiver::new(account_id, rx)
    }

    /// Adds a SIP account with the given configuration.
    ///
    /// Returns a `SipAccountHandle` for performing account-level operations
    /// (register, call, etc.).
    ///
    /// # Errors
    ///
    /// Returns `SipError` if the account configuration is invalid or if an
    /// account with the same credentials already exists.
    // [::STUB::] P3-2: Real account creation — currently validates config and returns a handle.
    pub async fn add_account(
        &self,
        config: AccountConfig,
    ) -> Result<SipAccountHandle, SipError> {
        config.validate()?;
        // [::STUB::] P3-2: Dispatch RuntimeCommand::AddAccount to reactor.
        let next_id = {
            let state = self.inner.state.read().await;
            // In P3-2 this will read the account_index
            std::mem::drop(state);
            1u32
        };
        Ok(SipAccountHandle {
            client: self.clone(),
            id: next_id,
        })
    }

    /// Removes a previously added SIP account.
    ///
    /// # Errors
    ///
    /// Returns `SipError::AccountNotFound` if no account with the given ID exists.
    // [::STUB::] P3-2: Real account removal with state machine teardown.
    pub async fn remove_account(
        &self,
        _account_id: crate::concurrency_contexts::command_serialization::AccountId,
    ) -> Result<(), SipError> {
        // [::STUB::] P3-2: Dispatch RuntimeCommand::RemoveAccount.
        Ok(())
    }

    /// Retrieves the handle for an existing account by ID.
    ///
    /// # Errors
    ///
    /// Returns `SipError::AccountNotFound` if the account does not exist.
    // [::STUB::] P3-2: Real account lookup from client state.
    pub async fn account(
        &self,
        _account_id: crate::concurrency_contexts::command_serialization::AccountId,
    ) -> Result<SipAccountHandle, SipError> {
        // [::STUB::] P3-2: Look up account in ClientState.account_index.
        Err(SipError::not_found("account not found — runtime not yet connected (P3-2)"))
    }

    /// Returns a snapshot of all currently configured accounts.
    // [::STUB::] P3-2: Real account enumeration from ClientState.
    pub async fn accounts(&self) -> Vec<SipAccountHandle> {
        // [::STUB::] P3-2: Iterate ClientState.account_index.
        vec![]
    }

    /// Initiates graceful shutdown of the SIP client.
    ///
    /// After calling shutdown, most operations will return
    /// `SipError::ShutdownInProgress`.
    // [::STUB::] P3-2: Real shutdown sequence (unregister accounts, close transports).
    pub async fn shutdown(&self) -> Result<(), SipError> {
        // [::STUB::] P3-2: Send shutdown signal, await reactor teardown.
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// SipAccountHandle — per-account operations
// ---------------------------------------------------------------------------

/// A handle for performing operations on a single SIP account.
///
/// `SipAccountHandle` is clone-able and holds a reference to its parent
/// `SipClient` for internal communication with the reactor.
#[derive(Debug, Clone)]
pub struct SipAccountHandle {
    /// Reference to the parent client for dispatching commands.
    // [::STUB::] P3-2: client field consumed by dispatch methods once runtime exists.
    #[allow(dead_code)]
    client: SipClient,
    /// The unique identifier for this account.
    id: crate::concurrency_contexts::command_serialization::AccountId,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl SipAccountHandle {
    /// Returns the unique identifier for this account.
    pub fn id(&self) -> crate::concurrency_contexts::command_serialization::AccountId {
        self.id
    }

    /// Registers this account with the SIP provider.
    ///
    /// # Errors
    ///
    /// Returns `SipError` if registration fails (e.g., network error,
    /// invalid credentials, provider rejection).
    // [::STUB::] P3-2: Real registration dispatch via RuntimeCommand.
    pub async fn register(&self) -> Result<(), SipError> {
        // [::STUB::] P3-2: RuntimeCommand::Register { account_id: self.id, .. }
        Ok(())
    }

    /// Unregisters this account from the SIP provider.
    // [::STUB::] P3-2: Real unregistration dispatch.
    pub async fn unregister(&self) -> Result<(), SipError> {
        Ok(())
    }

    /// Enables or disables automatic registration for this account.
    ///
    /// When `enabled` is `false`, the account will not attempt to register
    /// (or will de-register if currently registered).
    // [::STUB::] P3-2: Real state update dispatch.
    pub async fn set_registration_enabled(&self, _enabled: bool) -> Result<(), SipError> {
        Ok(())
    }

    /// Returns the current registration state of this account.
    // [::STUB::] P3-2: Real registration state query.
    pub async fn registration_state(&self) -> Result<RegistrationState, SipError> {
        Ok(RegistrationState::Unregistered)
    }

    /// Initiates an outgoing call to the given target.
    ///
    /// Returns a `CallId` that can be used to track the call's lifecycle.
    ///
    /// # Errors
    ///
    /// Returns `SipError` if the request is invalid (empty target_uri,
    /// unsupported codec) or if the call cannot be placed (max calls reached,
    /// network error).
    // [::STUB::] P3-2: Real call dispatch via RuntimeCommand.
    pub async fn make_call(
        &self,
        request: OutgoingCallRequest,
    ) -> Result<crate::concurrency_contexts::command_serialization::CallId, SipError> {
        OutgoingCallRequest::validate(&request)?;
        // [::STUB::] P3-2: Dispatch RuntimeCommand::MakeCall { .. }.
        Ok(0)
    }

    /// Updates a subset of this account's configuration fields.
    ///
    /// Only fields set to `Some(value)` in the patch are changed; `None`
    /// fields are left as-is.
    // [::STUB::] P3-2: Real config update dispatch.
    pub async fn update_config(&self, _patch: AccountConfigPatch) -> Result<(), SipError> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// RegistrationState
// ---------------------------------------------------------------------------

/// Possible registration states of a SIP account.
///
/// The state machine is: `Unregistered` → `Registering` → `Registered` (or
/// `Failed` from any active state). Registration and call ability are
/// independent — an account can make calls without registering when
/// `allow_outbound_without_register` is set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum RegistrationState {
    /// The account is not registered and not attempting to register.
    Unregistered,
    /// Registration is in progress (waiting for provider response).
    Registering,
    /// The account is registered with the SIP provider.
    Registered,
    /// Registration has failed (e.g., authentication error, timeout).
    Failed,
}

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

/// Supported audio codecs for SIP calls.
///
/// Only `Pcmu` and `Opus` are accepted by validation rules. Adding new
/// codecs requires updating both this enum and the validation logic in
/// `CallMediaPreferences`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum Codec {
    /// G.711 μ-law — universal, low complexity, 64 kbps.
    Pcmu,
    /// Opus — high quality, variable bitrate (6–510 kbps), recommended.
    Opus,
}

// ---------------------------------------------------------------------------
// OutgoingCallRequest
// ---------------------------------------------------------------------------

/// Parameters for placing an outgoing SIP call.
///
/// All fields are validated before the call is dispatched to the runtime.
/// Invalid values (empty target URI, unsupported codecs) result in a
/// `SipError` at the `make_call()` call site.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OutgoingCallRequest {
    /// Target SIP URI (e.g. `sip:bob@sip.example.com`).
    pub target_uri: String,
    /// Custom SIP headers to include in the INVITE.
    pub headers: Vec<(String, String)>,
    /// Optional authentication credentials override for this call.
    pub auth_override: Option<AuthOverride>,
    /// Preferred transport protocol for this call (None = use account default).
    pub preferred_transport: Option<crate::config::transport_ice_spec::TransportKind>,
    /// Media stream preferences (early media, SRTP, codec selection).
    pub media: CallMediaPreferences,
    /// Automatically answer an incoming REFER (call transfer) request.
    pub auto_answer_refer: bool,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl OutgoingCallRequest {
    /// Creates a new outgoing call request with the given target and media prefs.
    pub fn new(
        target_uri: impl Into<String>,
        media: CallMediaPreferences,
    ) -> Result<Self, SipError> {
        let request = OutgoingCallRequest {
            target_uri: target_uri.into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media,
            auto_answer_refer: false,
        };
        Self::validate(&request)?;
        Ok(request)
    }

    /// Validates the call request fields.
    ///
    /// Returns `Ok(())` or `SipError::InvalidConfig` on the first violation.
    pub fn validate(&self) -> Result<(), SipError> {
        if self.target_uri.is_empty() {
            return Err(SipError::invalid_config(
                "OutgoingCallRequest: target_uri must not be empty",
            ));
        }
        if !self.target_uri.starts_with("sip:") && !self.target_uri.starts_with("sips:") {
            return Err(SipError::invalid_config(
                "OutgoingCallRequest: target_uri must start with sip: or sips:",
            ));
        }
        // Validate preferred codecs — only PCMU and Opus are accepted
        for codec in &self.media.preferred_codecs {
            match codec {
                Codec::Pcmu | Codec::Opus => {}
            }
        }
        Ok(())
    }

    /// Returns the target URI.
    pub fn target_uri(&self) -> &str {
        &self.target_uri
    }
}

// ---------------------------------------------------------------------------
// CallMediaPreferences
// ---------------------------------------------------------------------------

/// Media preferences for an outgoing SIP call.
///
/// Controls early media, SRTP, and preferred audio codecs.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct CallMediaPreferences {
    /// Enable early media (ringback tone) before the call is answered.
    pub enable_early_media: bool,
    /// Enable SRTP for this call. `None` = use account default.
    pub enable_srtp: Option<bool>,
    /// Preferred audio codecs, in priority order. Only `Pcmu` and `Opus`
    /// are accepted; other values are rejected by validation.
    pub preferred_codecs: Vec<Codec>,
}

// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
impl Default for CallMediaPreferences {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn default() -> Self {
        CallMediaPreferences {
            enable_early_media: true,
            enable_srtp: None,
            preferred_codecs: vec![Codec::Pcmu, Codec::Opus],
        }
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // SipClient: construction
    // -----------------------------------------------------------------------

    /// @verifies C012-precondition
    #[tokio::test]
    async fn sip_client_new_with_valid_config() -> Result<(), SipError> {
        let config = crate::config::ClientConfig::default();
        let client = SipClient::new(config).await?;
        // Client should be constructable and return Ok
        let _ = client;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // SipClient: Send + Sync + Clone
    // -----------------------------------------------------------------------

    /// @verifies C012-postcondition
    /// @verifies C012-invariant
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_client_is_send_sync_clone() {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
        assert_clone::<SipClient>();
    }

    /// @verifies C012-invariant
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn sip_account_handle_is_send_sync_clone() {
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
        assert_send::<SipAccountHandle>();
        assert_sync::<SipAccountHandle>();
        assert_clone::<SipAccountHandle>();
    }

    // -----------------------------------------------------------------------
    // SipClient: subscribe
    // -----------------------------------------------------------------------

    /// @verifies C019-postcondition
    #[tokio::test]
    async fn sip_client_subscribe_returns_receiver() -> Result<(), SipError> {
        let config = crate::config::ClientConfig::default();
        let client = SipClient::new(config).await?;
        let _rx = client.subscribe();
        Ok(())
    }

    /// @verifies C019-postcondition
    #[tokio::test]
    async fn sip_client_subscribe_raw_sip_returns_none_by_default() -> Result<(), SipError> {
        let config = crate::config::ClientConfig::default();
        let client = SipClient::new(config).await?;
        // Default config has raw_sip_events disabled → returns None
        assert!(client.subscribe_raw_sip().is_none());
        Ok(())
    }

    /// @verifies C019-postcondition
    #[tokio::test]
    async fn sip_client_subscribe_account_returns_receiver() -> Result<(), SipError> {
        let config = crate::config::ClientConfig::default();
        let client = SipClient::new(config).await?;
        let _rx = client.subscribe_account(42);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // SipClient: add_account
    // -----------------------------------------------------------------------

    /// @verifies C013-precondition
    /// @verifies C015-postcondition
    #[tokio::test]
    async fn sip_client_add_account_valid() -> Result<(), SipError> {
        let client = create_test_client().await?;
        let config = AccountConfig::new("alice", "sip.example.com", "secret")?;
        let handle = client.add_account(config).await?;
        let id = handle.id();
        assert!(id > 0);
        Ok(())
    }

    /// @verifies C015-invariant
    #[tokio::test]
    async fn sip_client_add_account_invalid_config_rejected() -> Result<(), SipError> {
        let client = create_test_client().await?;
        let config = AccountConfig {
            username: String::new(), // empty — invalid
            domain: "domain".into(),
            password: "pass".into(),
            ..Default::default()
        };
        let result = client.add_account(config).await;
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().kind,
            crate::error::SipErrorKind::InvalidConfig
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // SipClient: remove_account / account / accounts / shutdown
    // -----------------------------------------------------------------------

    /// @verifies C013-postcondition
    #[tokio::test]
    async fn sip_client_methods_type_check() -> Result<(), SipError> {
        let client = create_test_client().await?;
        // These verify the methods exist with correct signatures
        let _ = client.remove_account(1).await;
        let _ = client.account(1).await;
        let _ = client.accounts().await;
        let _ = client.shutdown().await;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // SipAccountHandle operations
    // -----------------------------------------------------------------------

    /// @verifies C026-precondition
    /// @verifies C026-postcondition
    #[tokio::test]
    async fn sip_account_handle_id_returns_account_id() -> Result<(), SipError> {
        let client = create_test_client().await?;
        let config = AccountConfig::new("bob", "sip.bob.com", "pass")?;
        let handle = client.add_account(config).await?;
        let id = handle.id();
        // id should be non-zero (assigned by add_account)
        assert!(id > 0);
        Ok(())
    }

    /// @verifies C026-postcondition
    #[tokio::test]
    async fn sip_account_handle_register_type_check() -> Result<(), SipError> {
        let client = create_test_client().await?;
        let config = AccountConfig::new("bob", "sip.bob.com", "pass")?;
        let handle = client.add_account(config).await?;
        // Type-check: register returns Result<(), SipError>
        let _ = handle.register().await;
        let _ = handle.unregister().await;
        let _ = handle.set_registration_enabled(false).await;
        let state = handle.registration_state().await?;
        assert_eq!(state, RegistrationState::Unregistered);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // RegistrationState
    // -----------------------------------------------------------------------

    /// @verifies C026-postcondition
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn registration_state_all_variants() {
        let states = vec![
            RegistrationState::Unregistered,
            RegistrationState::Registering,
            RegistrationState::Registered,
            RegistrationState::Failed,
        ];
        assert_eq!(states.len(), 4);
        match states[0] {
            RegistrationState::Unregistered
            | RegistrationState::Registering
            | RegistrationState::Registered
            | RegistrationState::Failed => {}
        }
    }

    // -----------------------------------------------------------------------
    // OutgoingCallRequest
    // -----------------------------------------------------------------------

    /// @verifies C027-precondition
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn outgoing_call_request_new_valid() -> Result<(), SipError> {
        let prefs = CallMediaPreferences::default();
        let request = OutgoingCallRequest::new("sip:bob@sip.example.com", prefs)?;
        assert_eq!(request.target_uri(), "sip:bob@sip.example.com");
        Ok(())
    }

    /// @verifies C027-invariant
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn outgoing_call_request_empty_uri_rejected() {
        let prefs = CallMediaPreferences::default();
        let result = OutgoingCallRequest::new("", prefs);
        assert!(result.is_err());
    }

    /// @verifies C027-invariant
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn outgoing_call_request_invalid_uri_rejected() {
        let prefs = CallMediaPreferences::default();
        let result = OutgoingCallRequest::new("not-a-sip-uri", prefs);
        assert!(result.is_err());
    }

    /// @verifies C031-precondition
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn outgoing_call_request_custom_headers() -> Result<(), SipError> {
        let prefs = CallMediaPreferences::default();
        let base = OutgoingCallRequest::new("sip:bob@example.com", prefs)?;
        let request = OutgoingCallRequest {
            headers: vec![("X-Call-Id".into(), "abc123".into())],
            auto_answer_refer: true,
            ..base
        };
        // Use the validate method to check headers are accepted
        assert!(OutgoingCallRequest::validate(&request).is_ok());
        Ok(())
    }

    // -----------------------------------------------------------------------
    // CallMediaPreferences
    // -----------------------------------------------------------------------

    /// @verifies C031-precondition
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn call_media_preferences_defaults() {
        let prefs = CallMediaPreferences::default();
        assert!(prefs.enable_early_media);
        assert!(prefs.enable_srtp.is_none());
        assert_eq!(prefs.preferred_codecs.len(), 2);
        assert_eq!(prefs.preferred_codecs[0], Codec::Pcmu);
        assert_eq!(prefs.preferred_codecs[1], Codec::Opus);
    }

    // -----------------------------------------------------------------------
    // Codec enum
    // -----------------------------------------------------------------------

    /// @verifies C031-postcondition
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn codec_enum_variants() {
        let _pcmu = Codec::Pcmu;
        let _opus = Codec::Opus;
        let all = vec![Codec::Pcmu, Codec::Opus];
        assert_eq!(all.len(), 2);
    }

    // -----------------------------------------------------------------------
    // All public APIs return Result<T, SipError>
    // -----------------------------------------------------------------------

    /// @verifies C017-precondition
    /// @verifies C017-postcondition
    /// @verifies C017-invariant
    #[test]
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
    fn public_api_returns_result() {
        // Compile-time check that key type signatures use Result
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn _assert_result_sip_client_new()
            -> std::result::Result<SipClient, SipError> {
            unimplemented!("type-check only")
        }
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn _assert_result_add_account()
            -> std::result::Result<SipAccountHandle, SipError> {
            unimplemented!("type-check only")
        }
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn _assert_result_remove_account()
            -> std::result::Result<(), SipError> {
            unimplemented!("type-check only")
        }
// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.
        fn _assert_result_make_call()
            -> std::result::Result<crate::concurrency_contexts::command_serialization::CallId, SipError> {
            unimplemented!("type-check only")
        }
    }

    // -----------------------------------------------------------------------
    // OutgoingCallRequest into SipAccountHandle conversion (type check)
    // -----------------------------------------------------------------------

    /// @verifies C027-postcondition
    #[tokio::test]
    async fn sip_account_handle_make_call_type_check() -> Result<(), SipError> {
        let client = create_test_client().await?;
        let config = AccountConfig::new("caller", "sip.test", "pass")?;
        let handle = client.add_account(config).await?;
        let prefs = CallMediaPreferences::default();
        let request = OutgoingCallRequest::new("sip:callee@sip.test", prefs)?;
        let call_id = handle.make_call(request).await?;
        // CallId is currently u32 (placeholder until P4-1)
        assert_eq!(call_id, 0);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Creates a test SipClient with default config.
    async fn create_test_client() -> Result<SipClient, SipError> {
        let config = crate::config::ClientConfig::default();
        SipClient::new(config).await
    }
}
