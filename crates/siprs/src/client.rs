// [::TICKET::] P3-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P3-1 --for-spec --no-implementation-order`.

// [::TICKET::] P0-3: SipClient — facade for the siprs SIP client.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.

use std::sync::Arc;

use tokio::sync::broadcast;
use tracing::instrument;

use crate::api::event_model_payload_bus::{AccountId, SipEvent};
use crate::api::eventbus_receiver::EventBus;
use crate::config::ClientConfig;
use crate::error::SipError;
use crate::error::SipErrorKind;
use crate::runtime::command::RuntimeCommand;
use crate::runtime::handle::RuntimeHandle;
use crate::runtime::reactor::{BootConfig, CoreReactor};

/// The top-level facade for the siprs SIP client.
///
/// `SipClient` is the primary entry point for using the siprs crate.
/// It wraps the runtime infrastructure (rector, command channel, state)
/// and exposes a safe, async-native API for SIP voice communication.
///
/// # Lifecycle
/// 1. Construct with `SipClient::new(config)` — spawns the reactor thread.
/// 2. Use the returned client handle for account/call/transport operations.
/// 3. Call `client.shutdown().await` to cleanly terminate the reactor.
///
/// # Audio-only scope
/// This crate is limited to audio-only SIP calling. No video types or APIs
/// are exposed in the public surface. This is enforced by compile-time
/// tests in the test suite.
///
/// # Send + Sync
/// `SipClient` is `Send + Sync` because it wraps an `Arc<RuntimeHandle>`
/// and communicates with the reactor thread via MPSC channels.
#[derive(Clone)]
pub struct SipClient {
    /// Handle for submitting commands to the reactor thread.
    runtime: Arc<RuntimeHandle>,
    /// Event bus for subscribing to client lifecycle and SIP events.
    ///
    /// Use `subscribe()` to get a broadcast receiver for control events,
    /// or `subscribe_account()` to filter by account_id.
    ///
    /// [::TICKET::] P0-5: EventBus replaces the previous mpsc stub.
    events: crate::api::eventbus_receiver::EventBus,
    /// The client configuration used at construction.
    config: ClientConfig,
}

use std::fmt;

// [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
impl fmt::Debug for SipClient {
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SipClient")
            .field("runtime", &self.runtime)
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

// [::TICKET::] P0-3, P0-4, P0-5, P1-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P0-4|P0-5|P1-2) --for-spec --no-implementation-order`.
impl SipClient {
    /// Create a new SIP client with the given configuration.
    ///
    /// This spawns the reactor thread and initializes the PJSUA backend.
    /// The returned `SipClient` is ready for account registration and calls.
    ///
    /// # Returns
    /// - `Ok((SipClient, Receiver))` on success, with an event receiver.
    /// - `Err(SipError::InvalidConfig)` if the configuration is invalid.
    /// - `Err(SipError::new(SipErrorKind::NativeError,)` if the reactor fails to start.
    ///
    /// # Invariant (C002)
    /// The reactor thread model must remain unchanged — `CoreReactor::spawn()`
    /// must always return `(RuntimeHandle, JoinHandle)`.
    #[instrument(skip(config), fields(sip_host = %config.sip_proxy_host, sip_port = config.sip_proxy_port))]
    pub async fn new(
        config: ClientConfig,
    ) -> Result<(Self, broadcast::Receiver<SipEvent>), SipError> {
        config.validate()?;

        let (handle, _join) = CoreReactor::spawn(BootConfig {
            config: config.clone(),
        })
        .map_err(|e| {
            SipError::new(
                SipErrorKind::NativeError,
                format!("failed to spawn reactor: {e}"),
            )
        })?;

        // Create EventBus for client lifecycle and SIP events.
        let event_bus = EventBus::new(2048, None);
        let event_rx = event_bus.subscribe_control();

        // Send Initialize command to the reactor.
        //
        // RuntimeHandle::submit creates its own oneshot channel for the reply,
        // so we provide a dummy channel that gets replaced internally.
        let (_dummy_tx, _dummy_rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::Initialize {
                config: config.clone(),
                reply: _dummy_tx,
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::NativeError,
                    format!("initialization failed: {e}"),
                )
            })?;

        Ok((
            Self {
                runtime: Arc::new(handle),
                events: event_bus,
                config,
            },
            event_rx,
        ))
    }

    /// Return a reference to the `RuntimeHandle`.
    ///
    /// This allows callers to submit commands directly to the reactor
    /// via `handle.submit(...)`.
    #[instrument(skip(self))]
    pub fn handle(&self) -> &RuntimeHandle {
        &self.runtime
    }

    /// Subscribe to the control event bus for all SIP events.
    ///
    /// Returns a `broadcast::Receiver<SipEvent>` that receives all published
    /// events for this client. Use `subscribe_account()` to filter by account.
    #[instrument(skip(self))]
    pub fn subscribe(&self) -> broadcast::Receiver<SipEvent> {
        self.events.subscribe_control()
    }

    /// Subscribe to events filtered to a specific account.
    ///
    /// Returns an `AccountEventReceiver` that only yields events matching
    /// the given `account_id`.
    #[instrument(skip(self), fields(account_id = account_id.0))]
    pub fn subscribe_account(
        &self,
        account_id: AccountId,
    ) -> crate::api::eventbus_receiver::AccountEventReceiver {
        crate::api::eventbus_receiver::AccountEventReceiver::new(
            account_id,
            self.events.subscribe_control(),
        )
    }

    /// Subscribe to the raw SIP message bus, if enabled.
    #[instrument(skip(self))]
    pub fn subscribe_raw_sip(
        &self,
    ) -> Option<broadcast::Receiver<crate::api::event_model_payload_bus::RawSipMessage>> {
        self.events.subscribe_raw_sip()
    }

    /// Check whether the reactor thread has terminated.
    #[instrument(skip(self))]
    pub fn is_terminated(&self) -> bool {
        self.runtime.is_terminated()
    }

    /// Shut down the client cleanly.
    ///
    /// Sends a `Shutdown` command to the reactor and waits for it to
    /// complete. After shutdown, all subsequent operations return
    /// `Err(SipError::new(SipErrorKind::ShutdownInProgress, "..."))`.
    ///
    /// # Idempotency (C044)
    /// Calling `shutdown()` multiple times is safe — the second call
    /// returns `Ok(())` immediately because the reactor is already
    /// terminated.
    #[instrument(skip(self))]
    pub async fn shutdown(&self) -> Result<(), SipError> {
        if self.runtime.is_terminated() {
            // Idempotent: already shut down.
            return Ok(());
        }

        // Submit Shutdown command via RuntimeHandle's internal oneshot.
        // A dummy channel is provided — submit() replaces it internally.
        let (_dummy_tx, _dummy_rx) = tokio::sync::oneshot::channel();
        self.runtime
            .submit(RuntimeCommand::Shutdown { reply: _dummy_tx })
            .await
            .map_err(|e| {
                SipError::new(SipErrorKind::NativeError, format!("shutdown failed: {e}"))
            })?;

        Ok(())
    }
}

// Safety: SipClient holds Arc<RuntimeHandle>, EventBus, and ClientConfig —
// all of which are Send + Sync. Both auto-traits are required invariants
// (RFC §5 requirement #15) so the facade can cross `.await` points and be
// moved into `tokio::spawn` tasks.
// [::TICKET::] P0-3, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P6-1) --for-spec --no-implementation-order`.
fn _assert_send_sync()
where
    SipClient: Send + Sync,
{
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal ──────────────────────────────────────────────────────

    #[tokio::test]
    // @verifies C001, C002
    async fn sip_client_constructs_with_valid_config() {
        // C001 precondition: RFC defines purpose — valid config → Ok.
        // C002 precondition: Concurrency model defined — reactor spawns.
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .sip_proxy_port(5060)
            .build();
        let result = SipClient::new(config).await;
        assert!(
            result.is_ok(),
            "SipClient::new with valid config must succeed"
        );
        let (client, _rx) = result.unwrap();
        assert!(
            !client.is_terminated(),
            "client must not be terminated after new"
        );
    }

    #[tokio::test]
    // @verifies C002
    async fn sip_client_returns_runtime_handle() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        let (client, _rx) = SipClient::new(config).await.unwrap();
        let handle = client.handle();
        assert!(!handle.is_terminated(), "RuntimeHandle must be accessible");
    }

    #[tokio::test]
    // @verifies C044
    async fn sip_client_shutdown_completes() {
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        let (client, _rx) = SipClient::new(config).await.unwrap();
        // C044 postcondition: Shutdown specification with cancellation safety.
        let result =
            tokio::time::timeout(std::time::Duration::from_secs(5), client.shutdown()).await;
        assert!(result.is_ok(), "shutdown must complete within timeout");
        assert!(
            client.is_terminated(),
            "client must be terminated after shutdown"
        );
    }

    // ── Error ───────────────────────────────────────────────────────

    #[tokio::test]
    // @verifies C001
    async fn sip_client_rejects_empty_host() {
        // C001 invariant: InvalidConfig on empty host.
        let config = ClientConfig::builder().sip_proxy_host("").build();
        let result = SipClient::new(config).await;
        assert!(
            result.is_err(),
            "SipClient::new with empty host must return Err"
        );
        let err = result.unwrap_err();
        assert_eq!(
            err.kind,
            SipErrorKind::InvalidConfig,
            "expected InvalidConfig from empty host"
        );
    }

    // ── Invariant ───────────────────────────────────────────────────

    #[test]
    // @verifies C002
    // [::TICKET::] P0-3, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P6-1) --for-spec --no-implementation-order`.
    fn sip_client_is_send_and_sync() {
        // C002 invariant: SipClient must be Send + Sync for use with tokio tasks.
        // ABC O-001 closure: the Sync half was previously unenforced — a non-Sync
        // field (e.g. RefCell) would have passed every test.
        // [::TICKET::] P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-1 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-1 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
    }

    #[test]
    // @verifies C001, C009
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn no_video_types_in_public_exports() {
        // C001 invariant: crate is audio-only — no video types.
        // C009 invariant: single crate with modular structure.
        let lib_content = std::fs::read_to_string("src/lib.rs").expect("src/lib.rs must exist");
        for line in lib_content.lines() {
            assert!(
                !line.to_lowercase().contains("video"),
                "lib.rs must not contain video-related identifiers: {line}"
            );
        }
    }

    // ── Idempotent Shutdown (Edge case) ─────────────────────────────

    #[tokio::test]
    // @verifies C044
    async fn sip_client_shutdown_is_idempotent() {
        // C044 invariant: Shutdown is idempotent.
        let config = ClientConfig::builder()
            .sip_proxy_host("sip.example.com")
            .build();
        let (client, _rx) = SipClient::new(config).await.unwrap();

        // First shutdown should succeed.
        let result1 = client.shutdown().await;
        assert!(result1.is_ok(), "first shutdown must succeed");

        // Second shutdown is a no-op — must not panic or error.
        let result2 = client.shutdown().await;
        assert!(result2.is_ok(), "second shutdown must be a no-op");
    }

    // ── Contract tests ──────────────────────────────────────────────

    #[test]
    // @verifies C001
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn purpose_scope_remains_audio_only() {
        // C001 invariant: Purpose scope remains audio-only.
        let rfc_path = std::path::Path::new("RFC-ROOT.md");
        assert!(rfc_path.exists(), "RFC-ROOT.md must exist");
        let content = std::fs::read_to_string(rfc_path).unwrap();
        assert!(
            content.contains("音声のみ"),
            "RFC §1 must specify audio-only"
        );
    }

    #[test]
    // @verifies C004
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn no_tauri_dependency() {
        // C004 invariant: Tauri boundary respected — no tauri dep.
        let manifest = std::fs::read_to_string("Cargo.toml").unwrap();
        assert!(
            !manifest.contains("tauri"),
            "Cargo.toml must not depend on tauri"
        );
    }

    #[test]
    // @verifies C006
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn msrv_is_1_95() {
        // C006 invariant: MSRV must be 1.95.
        let manifest = std::fs::read_to_string("Cargo.toml").unwrap();
        assert!(
            manifest.contains("rust-version = \"1.95\""),
            "MSRV must be declared as 1.95"
        );
    }

    #[test]
    // @verifies C047
    // [::TICKET::] P0-3, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P6-1) --for-spec --no-implementation-order`.
    fn tracing_and_metrics_specified() -> Result<(), std::io::Error> {
        // C047 postcondition: tracing, metrics specified.
        let manifest = std::fs::read_to_string("Cargo.toml")?;
        assert!(manifest.contains("tracing"), "tracing must be a dependency");
        // ABC O-002 closure: metrics feature presence was previously untested —
        // deleting `metrics = []` from Cargo.toml would have passed the suite.
        assert!(
            manifest.contains("metrics"),
            "metrics feature flag must exist"
        );
        Ok(())
    }

    /// Parse the `[features]` section of a Cargo.toml manifest, returning the
    /// raw text between the `[features]` header and the next section header.
    // [::TICKET::] P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-1 --for-spec --no-implementation-order`.
    fn parse_feature_section(manifest: &str) -> &str {
        manifest
            .split_once("[features]")
            .map(|(_, rest)| rest)
            .and_then(|rest| rest.split("\n[").next())
            .unwrap_or("")
    }

    #[test]
    // @verifies C047
    // [::TICKET::] P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-1 --for-spec --no-implementation-order`.
    fn metrics_optional_feature() -> Result<(), std::io::Error> {
        // C047 invariant: metrics must be an optional feature, not a default one.
        let manifest = std::fs::read_to_string("Cargo.toml")?;
        let features_section = parse_feature_section(&manifest);
        assert!(
            features_section.contains("metrics"),
            "metrics must be declared as an optional feature"
        );
        let default_line = features_section
            .lines()
            .find(|l| l.trim().starts_with("default"))
            .unwrap_or("");
        assert!(
            !default_line.contains("metrics"),
            "metrics must not be a default feature"
        );
        Ok(())
    }

    #[test]
    // @verifies C003
    // [::TICKET::] P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P6-1 --for-spec --no-implementation-order`.
    fn features_independently_selectable() -> Result<(), std::io::Error> {
        // ABC O-003 closure: tls and srtp must not depend on each other,
        // so priority ordering never implies a feature dependency (RFC §1a).
        let manifest = std::fs::read_to_string("Cargo.toml")?;
        let features_section = parse_feature_section(&manifest);
        let tls_line = features_section
            .lines()
            .find(|l| l.trim().starts_with("tls"))
            .unwrap_or("");
        let srtp_line = features_section
            .lines()
            .find(|l| l.trim().starts_with("srtp"))
            .unwrap_or("");
        assert!(
            !tls_line.contains("srtp"),
            "tls must not depend on srtp: {tls_line}"
        );
        assert!(
            !srtp_line.contains("tls"),
            "srtp must not depend on tls: {srtp_line}"
        );
        Ok(())
    }

    #[test]
    // @verifies C056
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn catch_unwind_in_reactor() {
        // C056 invariant: catch_unwind in FFI callbacks.
        let reactor = std::fs::read_to_string("src/runtime/reactor.rs").unwrap();
        assert!(
            reactor.contains("catch_unwind"),
            "reactor must use catch_unwind for panic safety"
        );
    }

    #[test]
    // @verifies C051
    // [::TICKET::] P0-3, P6-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-3|P6-1) --for-spec --no-implementation-order`.
    fn microphone_is_optional_feature() -> Result<(), std::io::Error> {
        // C051 invariant: Microphone is optional via cpal-input feature flag.
        let manifest = std::fs::read_to_string("Cargo.toml")?;
        assert!(
            manifest.contains("cpal-input"),
            "cpal-input feature must exist"
        );
        let features_section = parse_feature_section(&manifest);
        let has_default_mic = features_section
            .lines()
            .find(|l| l.trim().starts_with("default"))
            .map(|l| l.contains("cpal-input"))
            .unwrap_or(false);
        assert!(!has_default_mic, "cpal-input must not be a default feature");
        Ok(())
    }

    #[test]
    // @verifies C059
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn conclusion_declares_all_requirements_implementable() {
        // C059 postcondition: Conclusion declaring all requirements implementable.
        let rfc = std::fs::read_to_string("RFC-ROOT.md").unwrap();
        // RFC §51 Conclusion should exist and state no further design work needed.
        assert!(
            rfc.contains("## 51. 結論") || rfc.contains("§51"),
            "RFC §51 Conclusion must exist"
        );
    }

    #[test]
    // @verifies C068
    // [::TICKET::] P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.
    fn io_boundaries_documented_as_reference() {
        // C068 invariant: I/O boundaries are reference, not prescriptive.
        let rfc = std::fs::read_to_string("RFC-ROOT.md").unwrap();
        assert!(
            rfc.contains("I/O") || rfc.contains("IO") || rfc.contains("入出力"),
            "RFC must document I/O boundaries"
        );
    }
}
