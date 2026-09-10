

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::broadcast;
use tracing::instrument;

use crate::api::audio_subscribe_bp::{
    tap_channel, validate_tap_capacity, AudioTapHandle, AudioTapMode, AudioTapSender,
};
use crate::api::event_bus_unify::raw_sip_capacity_for;
use crate::api::event_model_payload_bus::{
    AccountId, EventMeta, RawSipMessage, SipEvent, SipEventPayload,
};
use crate::api::eventbus_receiver::{AccountEventReceiver, EventBus, Subscription};
use crate::audio::media_path_arch::ChannelSelector;
use crate::call::HangupReason;
use crate::config::account_config_spec::DtmfMethod;
use crate::config::observability_metrics::ClientCapabilities;
use crate::config::ClientConfig;
use crate::error::SipError;
use crate::error::SipErrorKind;
use crate::model::{AudioFormat, CallId};
use crate::runtime::command::{ReactorError, Reply, RuntimeCommand};
use crate::runtime::handle::RuntimeHandle;
use crate::runtime::reactor::{BootConfig, CoreReactor};
use crate::state::call_state_model::CallState;

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
    events: crate::api::eventbus_receiver::EventBus,
    /// The client configuration used at construction.
    config: ClientConfig,
    /// Active audio tap producers keyed by call_id (RFC §22 subscribe_audio).
    ///
    /// Keeps each subscribed tap's producer alive so the consumer handle stays
    /// open until the backend media path attaches (N0033/N0050). Each entry
    /// carries the call's `AccountId` so the backend media callback can build a
    /// real `AudioChunkPair`. This same Arc is shared with the reactor backend
    /// via `BootConfig.audio_taps` (§62.6 tap push).
    tap_senders: Arc<Mutex<HashMap<CallId, (AccountId, AudioTapSender)>>>,
}

use std::fmt;

impl fmt::Debug for SipClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SipClient")
            .field("runtime", &self.runtime)
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

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
    /// must always produce `(RuntimeHandle, Arc<JoinHandle<()>>)`.
    #[instrument(skip(config), fields(user_agent = %config.user_agent, max_calls = config.max_calls))]
    pub async fn new(
        config: ClientConfig,
    ) -> Result<(Self, broadcast::Receiver<SipEvent>), SipError> {
        config.validate()?;

        // §62.3 / N0072: SipClient owns the single EventBus. The raw_sip channel
        // is created only when RawSipEventConfig.enabled (default true) — the
        // capacity is `Some` exactly then. The bus must exist before the reactor
        // spawn because a clone is handed to the reactor via BootConfig.
        let event_bus = EventBus::new(config.event_bus_capacity, raw_sip_capacity_for(&config));
        let event_rx = event_bus.subscribe_control();

        // is handed to the reactor backend (BootConfig.audio_taps) so the media
        // callback can drive the subscribed taps; the client keeps one for
        // subscribe_audio to register producers.
        let tap_senders: Arc<Mutex<HashMap<CallId, (AccountId, AudioTapSender)>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let (handle, _join) = CoreReactor::spawn(BootConfig {
            config: config.clone(),
            // The RFC §10 ClientConfig carries no DTMF field; the DtmfSent
            // fallback timeout is a reactor boot parameter sourced from the
            dtmf_sent_timeout_ms: crate::config::DtmfConfig::default().sent_timeout_ms,
            event_bus: event_bus.clone(),
            audio_taps: tap_senders.clone(),
        })
        .map_err(|e| {
            SipError::new(
                SipErrorKind::NativeError,
                format!("failed to spawn reactor: {e}"),
            )
        })?;

        // Send Initialize command to the reactor.
        //
        // RuntimeHandle::submit creates its own oneshot channel for the reply,
        // so we provide a dummy channel that gets replaced internally.
        let (_dummy_tx, _dummy_rx) = tokio::sync::oneshot::channel();
        handle
            .submit(RuntimeCommand::Initialize {
                config: config.clone(),
                reply: Reply::new(_dummy_tx),
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::NativeError,
                    format!("initialization failed: {e}"),
                )
            })?;

        // Advertise capabilities once initialization succeeds (C047 postcondition,
        // this publish, so the first control event is ClientInitialized.
        event_bus.publish(SipEvent::new(
            EventMeta::new(0, None, None),
            SipEventPayload::ClientInitialized(ClientCapabilities::new()),
        ));

        Ok((
            Self {
                runtime: Arc::new(handle),
                events: event_bus,
                config,
                tap_senders,
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
    /// Returns a `Subscription<SipEvent>` that receives all published events
    /// for this client. Use `subscribe_account()` to filter by account, and
    /// `Subscription::unsubscribe()` to cancel explicitly (§62.29).
    #[instrument(skip(self))]
    pub fn subscribe(&self) -> Subscription<SipEvent> {
        Subscription::new(Box::new(self.events.subscribe_control()))
    }

    /// Subscribe to events filtered to a specific account.
    ///
    /// Returns a `Subscription<SipEvent>` that only yields events matching the
    /// given `account_id`; the account filter is preserved inside the handle.
    #[instrument(skip(self), fields(account_id = account_id.0))]
    pub fn subscribe_account(&self, account_id: AccountId) -> Subscription<SipEvent> {
        Subscription::new(Box::new(AccountEventReceiver::new(
            account_id,
            self.events.subscribe_control(),
        )))
    }

    /// Subscribe to the raw SIP message bus, if enabled.
    ///
    /// Returns `None` if the raw SIP bus was not created.
    #[instrument(skip(self))]
    pub fn subscribe_raw_sip(&self) -> Option<Subscription<RawSipMessage>> {
        self.events
            .subscribe_raw_sip()
            .map(|rx| Subscription::new(Box::new(rx)))
    }

    /// Query the authoritative list of accounts (C021 source of truth).
    ///
    /// Reads the reactor's `ClientState` — never the event stream. Event loss
    /// (Lagged) does not affect the returned state; consumers can always
    #[instrument(skip(self))]
    pub async fn accounts(
        &self,
    ) -> Result<Vec<crate::api::event_model_payload_bus::AccountSnapshot>, SipError> {
        let state =
            self.runtime.query_state().await.map_err(|e| {
                SipError::new(SipErrorKind::NativeError, format!("query failed: {e}"))
            })?;
        Ok(state
            .accounts
            .values()
            .filter_map(account_snapshot_from_entry)
            .collect())
    }

    /// Add a SIP account and provide a handle for account-level operations.
    ///
    /// Validates the config first (fail-fast, C052) — an invalid config returns
    /// `Err(InvalidConfig)` without submitting any RuntimeCommand. On success the
    /// reactor assigns the logical account id and this method returns a
    /// `SipAccountHandle` bound to that id.
    #[instrument(skip(self, config), fields(username = %config.username))]
    pub async fn add_account(
        &self,
        config: crate::config::account_config_spec::AccountConfig,
    ) -> Result<crate::account::SipAccountHandle, SipError> {
        config.validate()?;
        let account_id = self.runtime.submit_add_account(config).await.map_err(|e| {
            SipError::new(
                SipErrorKind::NativeError,
                format!("add_account failed: {e}"),
            )
        })?;
        Ok(crate::account::SipAccountHandle::new(
            self.clone(),
            account_id,
        ))
    }

    /// Remove a SIP account by its logical id.
    ///
    /// Fails fast with `Err(AccountNotFound)` when the account is absent (no
    /// dispatch); otherwise submits `RuntimeCommand::RemoveAccount`, which the
    /// reactor applies to both the backend and the authoritative `ClientState`.
    #[instrument(skip(self), fields(account_id = account_id))]
    pub async fn remove_account(&self, account_id: u64) -> Result<(), SipError> {
        let state =
            self.runtime.query_state().await.map_err(|e| {
                SipError::new(SipErrorKind::NativeError, format!("query failed: {e}"))
            })?;
        let aid = AccountId::from_u64(account_id).map_err(|_| {
            SipError::new(
                SipErrorKind::AccountNotFound,
                format!("account {account_id} not found"),
            )
        })?;
        if !state.accounts.contains_key(&aid) {
            return Err(SipError::new(
                SipErrorKind::AccountNotFound,
                format!("account {account_id} not found"),
            ));
        }
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        self.runtime
            .submit(RuntimeCommand::RemoveAccount {
                account_id,
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::NativeError,
                    format!("remove_account failed: {e}"),
                )
            })?;
        Ok(())
    }

    /// Return a handle for an existing account, or `Err(AccountNotFound)`.
    #[instrument(skip(self), fields(account_id = account_id))]
    pub async fn account(
        &self,
        account_id: u64,
    ) -> Result<crate::account::SipAccountHandle, SipError> {
        let state =
            self.runtime.query_state().await.map_err(|e| {
                SipError::new(SipErrorKind::NativeError, format!("query failed: {e}"))
            })?;
        let aid = AccountId::from_u64(account_id).map_err(|_| {
            SipError::new(
                SipErrorKind::AccountNotFound,
                format!("account {account_id} not found"),
            )
        })?;
        if state.accounts.contains_key(&aid) {
            Ok(crate::account::SipAccountHandle::new(
                self.clone(),
                account_id,
            ))
        } else {
            Err(SipError::new(
                SipErrorKind::AccountNotFound,
                format!("account {account_id} not found"),
            ))
        }
    }

    /// Create a SIP transport (UDP/TCP) and record its runtime state.
    ///
    /// Submits `RuntimeCommand::CreateTransport`; the reactor records a
    /// `TransportRuntimeState` in the authoritative `ClientState`.
    #[instrument(skip(self, config))]
    pub async fn add_transport(
        &self,
        config: crate::config::transport_ice_spec::TransportConfig,
    ) -> Result<(), SipError> {
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        self.runtime
            .submit(RuntimeCommand::CreateTransport {
                config,
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::TransportInitFailed,
                    format!("add_transport failed: {e}"),
                )
            })?;
        Ok(())
    }

    /// Query the authoritative call list — every active `CallEntry` (C021 source
    /// of truth).
    ///
    /// is the renamed successor of the pre-§62.5 `call_state()` list query; the
    /// per-call state reference now lives in [`SipClient::call_state`].
    #[instrument(skip(self))]
    pub async fn calls(&self) -> Result<Vec<crate::runtime::state::CallEntry>, SipError> {
        let state =
            self.runtime.query_state().await.map_err(|e| {
                SipError::new(SipErrorKind::NativeError, format!("query failed: {e}"))
            })?;
        Ok(state.calls.into_values().collect())
    }

    /// Answer an incoming call with the given SIP code (RFC §19.1 / N0027).
    ///
    /// Accepts `180 / 183 / 200 / 486 / 603`. `486` = Busy Here and `603` =
    /// Decline form the reject path — there is no separate reject API. Fail-fast:
    /// an invalid code returns `Err(InvalidArgument)` without submitting any
    /// `RuntimeCommand` (C086 Invariant).
    #[instrument(skip(self), fields(call_id = call_id.0, code))]
    pub async fn answer(&self, call_id: CallId, code: u16) -> Result<(), SipError> {
        crate::api::call_api_semantics::validate_answer_code(code)?;
        self.runtime
            .submit_answer(call_id.get().get(), code)
            .await
            .map_err(|e| SipError::new(SipErrorKind::NativeError, format!("answer failed: {e}")))
    }

    /// Hang up a call with the given reason (RFC §19).
    ///
    /// The reason is recorded by the reactor for observability; the backend
    /// `hangup` API itself takes only the native call id.
    #[instrument(skip(self), fields(call_id = call_id.0, ?reason))]
    pub async fn hangup(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError> {
        self.runtime
            .submit_hangup(call_id.get().get(), reason)
            .await
            .map_err(|e| SipError::new(SipErrorKind::NativeError, format!("hangup failed: {e}")))
    }

    /// Place a call on hold (RFC §19).
    #[instrument(skip(self), fields(call_id = call_id.0))]
    pub async fn hold(&self, call_id: CallId) -> Result<(), SipError> {
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        self.runtime
            .submit(RuntimeCommand::Hold {
                call_id: call_id.get().get(),
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| SipError::new(SipErrorKind::NativeError, format!("hold failed: {e}")))
    }

    /// Resume a held call (RFC §19).
    #[instrument(skip(self), fields(call_id = call_id.0))]
    pub async fn unhold(&self, call_id: CallId) -> Result<(), SipError> {
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        self.runtime
            .submit(RuntimeCommand::Unhold {
                call_id: call_id.get().get(),
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| SipError::new(SipErrorKind::NativeError, format!("unhold failed: {e}")))
    }

    /// Blind-transfer a call to the given target URI (RFC §19).
    #[instrument(skip(self), fields(call_id = call_id.0, target))]
    pub async fn transfer(&self, call_id: CallId, target: String) -> Result<(), SipError> {
        self.runtime
            .submit_transfer(call_id.get().get(), target)
            .await
            .map_err(|e| SipError::new(SipErrorKind::NativeError, format!("transfer failed: {e}")))
    }

    /// Send DTMF digits out-of-band (RFC §20).
    ///
    /// The returned `Ok(())` means only that the Reactor accepted the command
    /// for PJSIP — delivery is observed via the two-phase `DtmfSent` timeout on
    /// the event bus. Fail-fast: invalid digits yield `Err(InvalidArgument)`
    /// without submitting any `RuntimeCommand`.
    #[instrument(skip(self), fields(call_id = call_id.0, digits, ?method))]
    pub async fn send_dtmf(
        &self,
        call_id: CallId,
        digits: impl Into<String>,
        method: DtmfMethod,
    ) -> Result<(), SipError> {
        let digits = digits.into();
        crate::api::call_api_semantics::validate_dtmf_digits(&digits)?;
        let (_tx, _rx) = tokio::sync::oneshot::channel();
        self.runtime
            .submit(RuntimeCommand::SendDtmf {
                call_id: call_id.get().get(),
                method,
                digits,
                reply: Reply::new(_tx),
            })
            .await
            .map_err(|e| SipError::new(SipErrorKind::NativeError, format!("send_dtmf failed: {e}")))
    }

    /// Query a single call's signalling state (RFC §19, §62.5).
    ///
    /// Reads the authoritative `ClientState` (C021) and maps the `CallEntry`
    /// state to the public 13-state `CallState` enum. Unknown call ids return
    /// `Err(CallNotFound)`.
    #[instrument(skip(self), fields(call_id = call_id.0))]
    pub async fn call_state(&self, call_id: CallId) -> Result<CallState, SipError> {
        self.runtime
            .call_state(call_id)
            .await
            .map_err(map_call_state_query_error)
    }

    /// Subscribe to a call's paired IN/OUT audio (RFC §22 N0031).
    ///
    /// Validates the target call against the reactor call registry, then creates
    /// a single-consumer [`AudioTapHandle`]. The `Realtime`/`Lossless`
    /// backpressure policy is applied by the producer-side [`AudioTapSender`]
    /// (RFC §22.1). The producer is retained in the client registry so the handle
    /// stays open until the backend media path attaches.
    #[instrument(skip(self))]
    pub async fn subscribe_audio(
        &self,
        call_id: CallId,
        format: AudioFormat,
        capacity: usize,
        mode: AudioTapMode,
    ) -> Result<AudioTapHandle, SipError> {
        validate_tap_capacity(capacity)?;
        let calls = self.calls().await?;
        let entry = calls
            .iter()
            .find(|entry| entry.id == call_id.get().get())
            .ok_or_else(|| SipError::not_found("call not found"))?;
        let (sender, handle) = tap_channel(capacity, mode);
        // Store the call's account_id alongside the producer so the backend
        // media callback can build a real AudioChunkPair (P15-7 tap push).
        self.tap_senders
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(call_id, (entry.account_id, sender));
        tracing::info!(%call_id, %capacity, ?mode, ?format, "subscribe_audio: tap created");
        Ok(handle)
    }

    /// Inject an audio source into a call's media path (§62.6).
    ///
    /// The `channels` selector routes the source to the received (IN), send-mix
    /// (OUT), or both media paths of the call's per-call `AudioMixer`. Returns
    /// the globally unique `source_id` assigned to the registration; for `Both`
    /// this is the IN registration's id (the OUT registration shares the same
    /// underlying source, C087).
    #[instrument(skip(self, source), fields(call_id = call_id.0, channels = ?channels))]
    pub async fn add_audio_source(
        &self,
        call_id: CallId,
        source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource>,
        channels: ChannelSelector,
    ) -> Result<u64, SipError> {
        self.runtime
            .submit_add_audio_source(call_id.get().get(), source, channels)
            .await
            .map_err(|e| {
                SipError::new(
                    SipErrorKind::NativeError,
                    format!("add_audio_source failed: {e}"),
                )
            })
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
        match self
            .runtime
            .submit(RuntimeCommand::Shutdown {
                reply: Reply::new(_dummy_tx),
            })
            .await
        {
            Ok(()) => Ok(()),
            // C044 idempotency: a concurrent shutdown may win the race and drop
            // the reactor before this submit lands — the reactor being down is
            // exactly the desired end state, so treat it as success.
            Err(crate::runtime::command::ReactorError::ReactorDown) => Ok(()),
            Err(e) => Err(SipError::new(
                SipErrorKind::NativeError,
                format!("shutdown failed: {e}"),
            )),
        }
    }
}

/// Map a reactor `AccountEntry` to the public `AccountSnapshot` domain type.
///
/// Returns `None` when the placeholder `id` cannot form a valid `AccountId`
/// (zero value), skipping such entries. `uri` and `display_name` are derived
/// from the stored `AccountConfig` (P10-3 makes `ClientState` the source of truth).
/// Map a `call_state(call_id)` query error from the reactor to the public kind.
///
/// A missing call id surfaces as `CallNotFound`; a down reactor as `NativeError`.
/// `NotInitialized` maps to its public counterpart.
fn map_call_state_query_error(e: ReactorError) -> SipError {
    match e {
        ReactorError::BackendError(_) => {
            SipError::new(SipErrorKind::CallNotFound, "call not found")
        }
        ReactorError::ReactorDown => SipError::new(SipErrorKind::NativeError, "reactor is down"),
        ReactorError::NotInitialized(msg) => SipError::new(SipErrorKind::NotInitialized, msg),
        ReactorError::NativeError {
            message,
            native_status,
        } => {
            // §62.8: preserve the FFI diagnostic through the call_state query
            // boundary via the unified §14.1 mapper.
            let kind = crate::error::m20_runtime_command_error::classify(native_status);
            SipError::with_status(kind, message, native_status)
        }
    }
}

fn account_snapshot_from_entry(
    entry: &crate::runtime::state::AccountEntry,
) -> Option<crate::api::event_model_payload_bus::AccountSnapshot> {
    crate::state::reg_account_lifecycle::build_account_snapshot(entry)
}

// Safety: SipClient holds Arc<RuntimeHandle>, EventBus, and ClientConfig —
// all of which are Send + Sync. Both auto-traits are required invariants
// (RFC §5 requirement #15) so the facade can cross `.await` points and be
// moved into `tokio::spawn` tasks.
fn _assert_send_sync()
where
    SipClient: Send + Sync,
{
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::error_design_siperror::SipErrorKind;

    // ── P15-9: map_call_state_query_error native_status preservation (C089) ──

    #[test]
    fn map_call_state_query_error_native_error_preserves_status() {
        // the call_state query boundary.
        let sip = map_call_state_query_error(ReactorError::NativeError {
            message: "make_call failed".into(),
            native_status: crate::ffi::bindings::PJ_EUNKNOWN,
        });
        assert_eq!(sip.native_status(), Some(crate::ffi::bindings::PJ_EUNKNOWN));
        assert_eq!(sip.kind, SipErrorKind::NativeError);
        assert_eq!(sip.message, "make_call failed");
    }

    // ── Normal ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn sip_client_constructs_with_valid_config() {
        let config = ClientConfig::default();
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
    async fn sip_client_returns_runtime_handle() {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await.unwrap();
        let handle = client.handle();
        assert!(!handle.is_terminated(), "RuntimeHandle must be accessible");
    }

    #[tokio::test]
    async fn sip_client_subscribe_receives_reactor_bus_events() {
        // single bus owned by SipClient. Publishing on the handle's bus must reach
        // a subscriber of client.subscribe().
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await.unwrap();
        let reactor_bus = client.handle().event_bus();
        let mut subscribed = client.subscribe();

        reactor_bus.publish(SipEvent::new(
            EventMeta::new(1, None, None),
            SipEventPayload::ClientShutdown,
        ));

        let ev = subscribed
            .recv()
            .await
            .expect("reactor-published event must reach client.subscribe()");
        assert!(
            matches!(ev.payload, SipEventPayload::ClientShutdown),
            "expected ClientShutdown, got {:?}",
            ev.payload
        );
    }

    #[tokio::test]
    async fn sip_client_subscribe_raw_sip_follows_config() {
        // Postcondition: enabled=true → Some(receiver); enabled=false → None.
        let enabled_config = ClientConfig::default(); // RawSipEventConfig::default().enabled == true
        let (enabled_client, _rx) = SipClient::new(enabled_config).await.unwrap();
        assert!(
            enabled_client.subscribe_raw_sip().is_some(),
            "raw_sip must be Some when enabled"
        );

        let disabled_config = ClientConfig {
            raw_sip_events: crate::config::RawSipEventConfig {
                enabled: false,
                ..Default::default()
            },
            ..Default::default()
        };
        let (disabled_client, _rx) = SipClient::new(disabled_config).await.unwrap();
        assert!(
            disabled_client.subscribe_raw_sip().is_none(),
            "raw_sip must be None when disabled"
        );
    }

    #[tokio::test]
    async fn sip_client_shutdown_completes() {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await.unwrap();
        let result =
            tokio::time::timeout(std::time::Duration::from_secs(5), client.shutdown()).await;
        assert!(result.is_ok(), "shutdown must complete within timeout");
        assert!(
            client.is_terminated(),
            "client must be terminated after shutdown"
        );
    }

    #[tokio::test]
    // on the client bus (the reactor publishes before replying).
    async fn sip_client_shutdown_publishes_client_shutdown() {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await.unwrap();
        let mut subscribed = client.subscribe();
        let result = client.shutdown().await;
        assert!(result.is_ok(), "shutdown must complete");
        let ev = tokio::time::timeout(std::time::Duration::from_secs(1), subscribed.recv())
            .await
            .expect("ClientShutdown must arrive within the bound")
            .expect("the client bus must yield an event");
        assert!(
            matches!(ev.payload, SipEventPayload::ClientShutdown),
            "expected ClientShutdown, got {:?}",
            ev.payload
        );
        assert!(
            client.is_terminated(),
            "client must be terminated after shutdown"
        );
    }

    // ── Error ───────────────────────────────────────────────────────

    #[tokio::test]
    async fn sip_client_rejects_invalid_config_fail_fast() {
        // §42 invariant: invalid config must be rejected by validate() before
        // the reactor is spawned. event_bus_capacity < 16 is the canonical
        // rejection path of the RFC §10 ClientConfig.
        let config = ClientConfig {
            event_bus_capacity: 8,
            ..Default::default()
        };
        let result = SipClient::new(config).await;
        assert!(
            result.is_err(),
            "SipClient::new with event_bus_capacity < 16 must return Err"
        );
        let err = result.unwrap_err();
        assert_eq!(
            err.kind,
            SipErrorKind::InvalidConfig,
            "expected InvalidConfig from undersized event bus"
        );
        assert!(
            err.message.contains("event_bus_capacity"),
            "message must name event_bus_capacity: {}",
            err.message
        );
    }

    // ── Invariant ───────────────────────────────────────────────────

    #[test]
    fn sip_client_is_send_and_sync() {
        // field (e.g. RefCell) would have passed every test.
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<SipClient>();
        assert_sync::<SipClient>();
    }

    #[test]
    fn no_video_types_in_public_exports() {
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
    async fn sip_client_shutdown_is_idempotent() {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await.unwrap();

        // First shutdown should succeed.
        let result1 = client.shutdown().await;
        assert!(result1.is_ok(), "first shutdown must succeed");

        // Second shutdown is a no-op — must not panic or error.
        let result2 = client.shutdown().await;
        assert!(result2.is_ok(), "second shutdown must be a no-op");
    }


    #[tokio::test]
    async fn sip_client_query_api_is_authoritative() {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await.unwrap();

        // Register an account so ClientState has authoritative data.
        let account_config = crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            ..Default::default()
        };
        let _account_id = client
            .handle()
            .submit_add_account(account_config)
            .await
            .expect("AddAccount must be accepted");

        // The account must be visible via the authoritative query API.
        let accounts = client
            .accounts()
            .await
            .expect("accounts() query must succeed");
        assert_eq!(
            accounts.len(),
            1,
            "query API must reflect the registered account"
        );

        // Drop every event receiver (simulate event loss / Lagged): the query
        // API must still reflect the same authoritative state (C021 invariant).
        let _ = client.subscribe(); // a fresh receiver that immediately goes out of scope
        let accounts_after_loss = client
            .accounts()
            .await
            .expect("accounts() must succeed after event loss");
        assert_eq!(
            accounts_after_loss.len(),
            accounts.len(),
            "event loss must not corrupt authoritative query state"
        );
    }

    #[tokio::test]
    async fn sip_client_calls_query_returns_snapshot() -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;

        let calls = client.calls().await?;
        assert!(
            calls.is_empty(),
            "fresh client must have no active calls, got {calls:?}"
        );
        Ok(())
    }

    // ── P15-6: call-control facade (answer/hangup/hold/unhold/transfer/dtmf) ──

    #[tokio::test]
    // InvalidArgument (no dispatch — the validator runs before submit).
    async fn sip_client_answer_rejects_invalid_code_fail_fast(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let call_id = CallId::from_u64(1)?;

        for code in [0u16, 179, 404, 604, 65535] {
            let err = client.answer(call_id, code).await.unwrap_err();
            assert_eq!(
                err.kind,
                SipErrorKind::InvalidArgument,
                "answer({code}) must fail with InvalidArgument"
            );
        }
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_answer_accepts_valid_codes() -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        // P16-5 §62.14: answer resolves the owning account from a registered
        // CallEntry, so a call must be placed before answering.
        let account = client.add_account(valid_account_config()).await?;
        let request = crate::api::call_types::OutgoingCallRequest {
            target_uri: "sip:bob@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::api::call_types::CallMediaPreferences::default(),
            auto_answer_refer: false,
        };
        let call_id = CallId::from_u64(account.make_call(request).await?)?;

        for code in [180u16, 183, 200, 486, 603] {
            client.answer(call_id, code).await?;
        }
        Ok(())
    }

    #[tokio::test]
    // facade → runtime → reactor → TestBackend path completes with Ok.
    async fn sip_client_call_control_commands_are_wired() -> Result<(), Box<dyn std::error::Error>>
    {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let call_id = CallId::from_u64(1)?;

        client.hangup(call_id, HangupReason::LocalUser).await?;
        client.hold(call_id).await?;
        client.unhold(call_id).await?;
        client
            .transfer(call_id, "sip:bob@example.com".into())
            .await?;
        client.send_dtmf(call_id, "5", DtmfMethod::Rfc4733).await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_send_dtmf_rejects_invalid_digits() -> Result<(), Box<dyn std::error::Error>>
    {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let call_id = CallId::from_u64(1)?;

        let err = client
            .send_dtmf(call_id, "1x2", DtmfMethod::Rfc4733)
            .await
            .unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidArgument);
        Ok(())
    }

    #[tokio::test]
    // CallNotFound (authoritative query, C021).
    async fn sip_client_call_state_unknown_returns_call_not_found(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        let (client, _rx) = SipClient::new(config).await?;
        let call_id = CallId::from_u64(99)?;

        let err = client.call_state(call_id).await.unwrap_err();
        assert_eq!(
            err.kind,
            SipErrorKind::CallNotFound,
            "call_state(unknown) must be CallNotFound"
        );
        Ok(())
    }


    #[tokio::test]
    async fn sip_client_new_and_shutdown_return_sip_error() -> Result<(), Box<dyn std::error::Error>>
    {
        // Contract C017 Precondition: every public async fn must yield Result<_, SipError>.
        // Result-returning public async fns (new, accounts, add_account, remove_account,
        // account, add_transport, call_state, subscribe_audio, shutdown) to Result<_, String>
        // or another Debug error type would pass the whole suite (existing tests only call
        // .is_ok() or read err.kind, which require only E: Debug).
        fn assert_new_result(_: &Result<(SipClient, broadcast::Receiver<SipEvent>), SipError>) {}
        fn assert_accounts_result(
            _: &Result<Vec<crate::api::event_model_payload_bus::AccountSnapshot>, SipError>,
        ) {
        }
        fn assert_add_account_result(_: &Result<crate::account::SipAccountHandle, SipError>) {}
        fn assert_remove_account_result(_: &Result<(), SipError>) {}
        fn assert_account_result(_: &Result<crate::account::SipAccountHandle, SipError>) {}
        fn assert_add_transport_result(_: &Result<(), SipError>) {}
        fn assert_calls_result(_: &Result<Vec<crate::runtime::state::CallEntry>, SipError>) {}
        fn assert_call_state_result(
            _: &Result<crate::state::call_state_model::CallState, SipError>,
        ) {
        }
        fn assert_subscribe_audio_result(
            _: &Result<crate::api::audio_subscribe_bp::AudioTapHandle, SipError>,
        ) {
        }
        fn assert_shutdown_result(_: &Result<(), SipError>) {}
        let config = ClientConfig::default();
        let new_result = SipClient::new(config).await;
        assert_new_result(&new_result);
        if let Ok((client, _rx)) = new_result {
            assert_accounts_result(&client.accounts().await);
            assert_add_account_result(
                &client
                    .add_account(crate::config::account_config_spec::AccountConfig::default())
                    .await,
            );
            assert_remove_account_result(&client.remove_account(9999).await);
            assert_account_result(&client.account(9999).await);
            assert_add_transport_result(
                &client
                    .add_transport(crate::config::transport_ice_spec::TransportConfig::udp(
                        5070,
                    ))
                    .await,
            );
            assert_calls_result(&client.calls().await);
            let call_id = crate::model::CallId::from_u64(1)?;
            assert_call_state_result(&client.call_state(call_id).await);
            let format = crate::model::AudioFormat::new(
                crate::model::SampleRate::Hz48000,
                crate::model::BitDepth::F32,
                crate::model::ChannelLayout::Mono,
                20,
            )?;
            let mode = crate::api::audio_subscribe_bp::AudioTapMode::Realtime;
            assert_subscribe_audio_result(
                &client.subscribe_audio(call_id, format, 1024, mode).await,
            );
            let shutdown_result = client.shutdown().await;
            assert_shutdown_result(&shutdown_result);
        }
        Ok(())
    }

    // ── Contract tests ──────────────────────────────────────────────


    #[test]
    fn no_tauri_dependency() {
        let manifest = std::fs::read_to_string("Cargo.toml").unwrap();
        assert!(
            !manifest.contains("tauri"),
            "Cargo.toml must not depend on tauri"
        );
    }

    #[test]
    fn msrv_is_1_95() {
        let manifest = std::fs::read_to_string("Cargo.toml").unwrap();
        assert!(
            manifest.contains("rust-version = \"1.95\""),
            "MSRV must be declared as 1.95"
        );
    }

    #[test]
    fn tracing_and_metrics_specified() -> Result<(), std::io::Error> {
        let manifest = std::fs::read_to_string("Cargo.toml")?;
        assert!(manifest.contains("tracing"), "tracing must be a dependency");
        // deleting `metrics = []` from Cargo.toml would have passed the suite.
        assert!(
            manifest.contains("metrics"),
            "metrics feature flag must exist"
        );
        Ok(())
    }

    /// Parse the `[features]` section of a Cargo.toml manifest, returning the
    /// raw text between the `[features]` header and the next section header.
    fn parse_feature_section(manifest: &str) -> &str {
        manifest
            .split_once("[features]")
            .map(|(_, rest)| rest)
            .and_then(|rest| rest.split("\n[").next())
            .unwrap_or("")
    }

    #[test]
    fn metrics_optional_feature() -> Result<(), std::io::Error> {
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
    fn features_independently_selectable() -> Result<(), std::io::Error> {
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
    fn catch_unwind_in_reactor() {
        let reactor = std::fs::read_to_string("src/runtime/reactor.rs").unwrap();
        assert!(
            reactor.contains("catch_unwind"),
            "reactor must use catch_unwind for panic safety"
        );
    }

    #[test]
    fn microphone_is_optional_feature() -> Result<(), std::io::Error> {
        // P15-7 (§62.6): cpal-input is a DEFAULT feature so the microphone
        // source connects in the default build.
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
        assert!(
            has_default_mic,
            "cpal-input must be a default feature (§62.6)"
        );
        Ok(())
    }








    #[test]
    fn crate_architecture_defined() -> Result<(), std::io::Error> {
        // spec text; this source-level test pins the actual declarations named by the contract.
        let lib = std::fs::read_to_string("src/lib.rs")?;
        for module in [
            "client",
            "config",
            "account",
            "call",
            "transport",
            "error",
            "runtime",
        ] {
            assert!(
                lib.contains(&format!("pub mod {module};")),
                "src/lib.rs must declare pub mod {module};"
            );
        }
        Ok(())
    }

    #[test]
    fn all_public_client_methods_are_instrumented() -> Result<(), std::io::Error> {
        // public operations. This source-inspection test asserts every public
        // SipClient/SipAccountHandle method is immediately preceded by a
        // `#[instrument(...)]` attribute. The prior `tracing_and_metrics_specified`
        // only checked Cargo.toml for the substring 'tracing' — removing every
        // #[instrument] would have left all tests green.
        // SipClient — 21 public methods; SipAccountHandle — 9 public methods.
        // call-control surface (answer/hangup/hold/unhold/transfer/send_dtmf/
        // call_state(call_id)) was added (§62.5).
        let checks: [(&str, &[&str]); 2] = [
            (
                "src/client.rs", // SipClient — 21 public methods
                &[
                    "new",
                    "handle",
                    "subscribe",
                    "subscribe_account",
                    "subscribe_raw_sip",
                    "accounts",
                    "add_account",
                    "remove_account",
                    "account",
                    "add_transport",
                    "calls",
                    "answer",
                    "hangup",
                    "hold",
                    "unhold",
                    "transfer",
                    "send_dtmf",
                    "call_state",
                    "subscribe_audio",
                    "is_terminated",
                    "shutdown",
                ],
            ),
            (
                "src/api/public_api_design.rs", // SipAccountHandle — 9 public methods
                &[
                    "new",
                    "id",
                    "register",
                    "unregister",
                    "set_registration_enabled",
                    "registration_state",
                    "make_call",
                    "update_config",
                    "remove",
                ],
            ),
        ];
        for (path, methods) in checks {
            let src = std::fs::read_to_string(path)?;
            for method in methods {
                // Match both `pub async fn name(` and `pub fn name(` — the
                // "fn name(" fragment covers both forms.
                let (idx, _) = src
                    .lines()
                    .enumerate()
                    .find(|(_, l)| {
                        let trimmed_line = l.trim_start();
                        trimmed_line.starts_with("pub ")
                            && trimmed_line.contains(&format!("fn {method}("))
                    })
                    .unwrap_or_else(|| panic!("{path} must define a public fn {method}("));
                // Scan the up-to-6 lines before the method for the attribute.
                let context: Vec<&str> = src.lines().skip(idx.saturating_sub(6)).take(6).collect();
                assert!(
                    context.iter().any(|l| l.contains("#[instrument")),
                    "{path}: pub fn {method} must be preceded by #[instrument]; context: {context:?}"
                );
            }
        }
        Ok(())
    }

    #[test]
    fn spec_examples_reference_public_api_types() -> Result<(), std::io::Error> {
        // prior examples were empty `fn main() {}` stubs demonstrating nothing.
        // This test asserts each example references at least one public API type.
        let api_tokens = [
            "SipClient",
            "ClientConfig",
            "AccountConfig",
            "SipAccountHandle",
            "OutgoingCallRequest",
            "AsyncAudioSource",
            "AudioFormat",
        ];
        for example in [
            "client_init",
            "account_register",
            "make_call",
            "audio_tap",
            "tts_source",
        ] {
            let content = std::fs::read_to_string(format!("examples/{example}.rs"))?;
            assert!(
                api_tokens.iter().any(|t| content.contains(t)),
                "examples/{example}.rs must reference a public API type; content: {content:?}"
            );
        }
        Ok(())
    }

    // ── P10-3: account/transport lifecycle facades ─────────────────────

    /// Build a minimal valid account config for facade tests.
    fn valid_account_config() -> crate::config::account_config_spec::AccountConfig {
        crate::config::account_config_spec::AccountConfig {
            username: "alice".into(),
            domain: "sip.example.com".into(),
            password: crate::security::SecretString::new("pass123"),
            ..Default::default()
        }
    }

    async fn test_client(
    ) -> Result<(SipClient, broadcast::Receiver<SipEvent>), Box<dyn std::error::Error>> {
        let config = ClientConfig::default();
        Ok(SipClient::new(config).await?)
    }

    #[tokio::test]
    // mixer and returns a source_id (§62.6 / C087).
    async fn add_audio_source_injects_into_per_call_mixer() -> Result<(), Box<dyn std::error::Error>>
    {
        let (client, _rx) = test_client().await?;
        let call_id = CallId::from_u64(1).unwrap();
        let source = Box::new(crate::runtime::audio_worker::MockAsyncAudioSource::new(
            vec![0i16; 160],
        ));
        let source_id = client
            .add_audio_source(call_id, source, ChannelSelector::Out)
            .await?;
        assert_eq!(source_id, 0, "first source on a fresh client gets id 0");
        let mixer = client.handle().audio_mixer_for(1).expect("per-call mixer");
        assert_eq!(mixer.out_source_count(), 1);
        assert_eq!(mixer.in_source_count(), 0);
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn add_audio_source_both_registers_in_and_out() -> Result<(), Box<dyn std::error::Error>>
    {
        let (client, _rx) = test_client().await?;
        let call_id = CallId::from_u64(1).unwrap();
        let source = Box::new(crate::runtime::audio_worker::MockAsyncAudioSource::new(
            vec![0i16; 160],
        ));
        let source_id = client
            .add_audio_source(call_id, source, ChannelSelector::Both)
            .await?;
        // Both returns the IN registration id (the first id on a fresh client).
        assert_eq!(source_id, 0);
        let mixer = client.handle().audio_mixer_for(1).expect("per-call mixer");
        assert_eq!(mixer.in_source_count(), 1);
        assert_eq!(mixer.out_source_count(), 1);
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_add_account_returns_handle_with_nonzero_id(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        let handle = client.add_account(valid_account_config()).await?;
        assert!(
            handle.id() > 0,
            "add_account must return a non-zero account id"
        );
        let accounts = client.accounts().await?;
        assert_eq!(accounts.len(), 1, "the added account must be queryable");
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_add_account_rejects_invalid_before_dispatch(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        let bad = crate::config::account_config_spec::AccountConfig {
            username: String::new(),
            ..Default::default()
        };
        let err = match client.add_account(bad).await {
            Err(e) => e,
            Ok(_) => return Err("add_account must reject an invalid config".into()),
        };
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
        assert!(
            client.accounts().await?.is_empty(),
            "no state mutation on validation failure"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_remove_account_removes_from_accounts(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        let handle = client.add_account(valid_account_config()).await?;
        client.remove_account(handle.id()).await?;
        assert!(
            client.accounts().await?.is_empty(),
            "the account must no longer appear after remove_account"
        );
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_remove_account_missing_returns_err(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        let err = match client.remove_account(999).await {
            Err(e) => e,
            Ok(_) => return Err("remove_account must reject a missing account".into()),
        };
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_account_returns_handle_when_exists(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        let handle = client.add_account(valid_account_config()).await?;
        let fetched = client.account(handle.id()).await?;
        assert_eq!(fetched.id(), handle.id());
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_account_missing_returns_err() -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        let err = match client.account(999).await {
            Err(e) => e,
            Ok(_) => return Err("account must reject a missing id".into()),
        };
        assert_eq!(err.kind, SipErrorKind::AccountNotFound);
        client.shutdown().await?;
        Ok(())
    }

    #[tokio::test]
    async fn sip_client_add_transport_records_state() -> Result<(), Box<dyn std::error::Error>> {
        let (client, _rx) = test_client().await?;
        client
            .add_transport(crate::config::transport_ice_spec::TransportConfig::udp(
                5070,
            ))
            .await
            .unwrap();
        let state = client.handle().query_state().await?;
        assert_eq!(state.transports.len(), 1);
        assert_eq!(state.transports[0].port, 5070);
        client.shutdown().await?;
        Ok(())
    }

    // ── P17-9 §62.29: Subscription unsubscribe + mic source docs (C135) ──

    #[test]
    fn call_api_surface_compiles() {
        // Taking each async method as a value is a compile-time existence
        // check; behavioral coverage lives in the P17-4..P17-8 tests.
        // send_dtmf is generic over `impl Into<String>`, so it is exercised by
        // the P17-7 DtmfSent integration tests rather than listed here.
        let _ = SipClient::answer;
        let _ = SipClient::hangup;
        let _ = SipClient::hold;
        let _ = SipClient::unhold;
        let _ = SipClient::transfer;
        let _ = SipClient::call_state;
        let _ = SipClient::calls;
    }

}
