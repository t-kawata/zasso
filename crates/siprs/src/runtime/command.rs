// [::TICKET::] P0-2: RuntimeCommand enum and error types for reactor dispatch

/// Errors produced by the reactor during command dispatch.
///
/// These are internal to the runtime module. Downstream tickets (P0-4)
/// will map them into the public `SipError` type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReactorError {
    /// The reactor thread is not running — commands cannot be processed.
    ReactorDown,
    /// The client has not been initialized yet.
    NotInitialized(String),
    /// A PJSUA operation failed.
    BackendError(String),
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for ReactorError {
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ReactorDown => write!(f, "reactor thread is down"),
            Self::NotInitialized(msg) => write!(f, "not initialized: {msg}"),
            Self::BackendError(msg) => write!(f, "backend error: {msg}"),
        }
    }
}

// [::TICKET::] P0-2, P0-3, P0-5, P0-6, P3-1, P7-2, P10-3, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-3|P0-5|P0-6|P3-1|P7-2|P10-3|P10-4) --for-spec --no-implementation-order`.
impl std::error::Error for ReactorError {}

/// Debug-friendly wrapper around `tokio::sync::oneshot::Sender<T>`.
///
/// `oneshot::Sender` does not implement `Debug` in tokio 1.x, which previously
/// forced a hand-written `Debug` impl on `RuntimeCommand`. This wrapper supplies
/// a stable `Debug` form while preserving the inner sender for dispatch.
pub struct Reply<T>(tokio::sync::oneshot::Sender<T>);

impl<T> Reply<T> {
    /// Wrap a oneshot sender in a Debug-friendly reply channel.
    pub fn new(inner: tokio::sync::oneshot::Sender<T>) -> Self {
        Self(inner)
    }

    /// Send `value` on the wrapped channel, returning it if the receiver dropped.
    pub fn send(self, value: T) -> Result<(), T> {
        self.0.send(value)
    }

    /// Unwrap to the underlying oneshot sender.
    pub fn into_inner(self) -> tokio::sync::oneshot::Sender<T> {
        self.0
    }
}

impl<T> std::fmt::Debug for Reply<T> {
    // [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Reply").finish_non_exhaustive()
    }
}

/// Debug-friendly wrapper around `Box<T>` for payloads whose inner type is not
/// `Debug` (e.g. `dyn AsyncAudioSource`). Enables `#[derive(Debug)]` on enums
/// that carry such a box without requiring the boxed type to implement `Debug`.
///
/// `T: ?Sized` allows wrapping trait objects (`Box<dyn AsyncAudioSource + Send>`).
pub struct DebugBox<T: ?Sized>(Box<T>);

impl<T: ?Sized> DebugBox<T> {
    /// Wrap a boxed payload in a Debug-friendly box.
    pub fn new(inner: Box<T>) -> Self {
        Self(inner)
    }

    /// Unwrap to the underlying box.
    pub fn into_inner(self) -> Box<T> {
        self.0
    }
}

impl<T: ?Sized> std::fmt::Debug for DebugBox<T> {
    // [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DebugBox").finish_non_exhaustive()
    }
}

/// Commands that can be submitted to the `CoreReactor` for serialized execution.
///
/// Each variant carries a `tokio::sync::oneshot::Sender` that the reactor
/// resolves after processing the command. This gives callers an async
/// awaitable result while keeping all PJSUA calls on the reactor thread.
///
/// # Design notes
/// - Enum dispatch (not trait dispatch) enables exhaustive match in the reactor loop.
/// - Payload fields that reference types from downstream tickets use `u64` / `String`
///   placeholders. These are replaced with real types in P0-3+.
/// - The `reply` channel **must** be `.send()`'d exactly once in every code path.
/// - Debug is derived: `Reply<T>` wraps the non-Debug oneshot sender and `DebugBox<T>`
///   wraps the non-Debug boxed audio source so every field is `Debug`.
#[derive(Debug)]
pub enum RuntimeCommand {
    Initialize {
        config: crate::config::ClientConfig,
        reply: Reply<Result<(), ReactorError>>,
    },
    AddAccount {
        config: crate::config::account_config_spec::AccountConfig,
        reply: Reply<Result<u64, ReactorError>>,
    },
    /// Update the configuration of an existing account.
    ///
    /// The `config` payload is the **merged, validated** `AccountConfig` produced
    /// by `AccountConfigPatch::apply` at the facade (C052 fail-fast), so the
    /// reactor never dispatches an unvalidated config.
    /// `register_on_start` is the patch's delta (`Some` when the update explicitly
    /// set it) — the reactor re-issues registration after the config update (§62.4).
    UpdateAccount {
        account_id: u64,
        config: crate::config::account_config_spec::AccountConfig,
        register_on_start: Option<bool>,
        reply: Reply<Result<(), ReactorError>>,
    },
    RemoveAccount {
        account_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Create a SIP transport (UDP/TCP/TLS) and record its runtime state.
    CreateTransport {
        config: crate::config::transport_ice_spec::TransportConfig,
        reply: Reply<Result<(), ReactorError>>,
    },
    SetRegistration {
        account_id: u64,
        enabled: bool,
        reply: Reply<Result<(), ReactorError>>,
    },
    MakeCall {
        account_id: u64,
        request: Box<crate::api::call_types::OutgoingCallRequest>,
        reply: Reply<Result<u64, ReactorError>>,
    },
    /// [::TICKET::] P15-6: Answer an incoming call with the given SIP code (§19.1).
    ///
    /// The `code` has already passed `validate_answer_code` at the facade, so the
    /// reactor only ever dispatches an accepted code (180/183/200/486/603).
    Answer {
        call_id: u64,
        code: u16,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Hang up a call with the caller-supplied reason.
    ///
    /// The reason is recorded by the reactor (`handle_hangup`) for observability;
    /// the backend `hangup` API itself takes only the native call id.
    Hangup {
        call_id: u64,
        reason: crate::call::HangupReason,
        reply: Reply<Result<(), ReactorError>>,
    },
    Hold {
        call_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    Unhold {
        call_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Blind-transfer a call to the given target URI.
    Transfer {
        call_id: u64,
        target: String,
        reply: Reply<Result<(), ReactorError>>,
    },
    SendDtmf {
        call_id: u64,
        method: crate::config::account_config_spec::DtmfMethod,
        digits: String,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-5: Query the backend for registration account info.
    ///
    /// Used by the RegistrationStateChanged event flow to retrieve
    /// registration status and produce RegistrationSucceeded/Failed.
    GetAccountInfo {
        native_acc_id: u32,
        reply: Reply<Result<crate::state::m20_registr_cmd_pat::AccountInfoSnapshot, ReactorError>>,
    },
    /// [::TICKET::] P7-2: O-004 — query the reactor's authoritative `ClientState`.
    ///
    /// Backs the `SipClient::accounts()` / `SipClient::call_state()` query API,
    /// which is the source of truth per C021 (events are observation-only).
    QueryState {
        reply: Reply<Result<crate::runtime::state::ClientState, ReactorError>>,
    },
    /// [::TICKET::] P0-6: Connect a call to the conference bridge.
    ///
    /// Delegates to `Backend::conf_connect()`. Used for M20 conference
    /// call management.
    ConfConnect {
        call_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Disconnect a call from the conference bridge.
    ///
    /// Delegates to `Backend::conf_disconnect()`. The inverse of ConfConnect.
    ConfDisconnect {
        call_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6, P15-7: Add an audio source to the per-call AudioMixer.
    ///
    /// The source is boxed and stored in the per-call mixer for `call_id`. The
    /// `channels` selector routes it to the IN (received), OUT (send-mix), or
    /// both media paths (§62.6 / C087). Returns the assigned source_id via the
    /// oneshot channel.
    AddAudioSource {
        call_id: u64,
        source: DebugBox<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>,
        channels: crate::audio::media_path_arch::ChannelSelector,
        reply: Reply<Result<u64, ReactorError>>,
    },
    /// [::TICKET::] P0-6: Remove an audio source from the call's AudioMixer.
    RemoveAudioSource {
        source_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Set the gain of an audio source.
    SetAudioSourceGain {
        source_id: u64,
        gain: f32,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Mute or unmute an audio source.
    MuteAudioSource {
        source_id: u64,
        muted: bool,
        reply: Reply<Result<(), ReactorError>>,
    },
    Shutdown {
        reply: Reply<Result<(), ReactorError>>,
    },
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for RuntimeCommand {
// [::TICKET::] P0-2, P0-5, P0-6, P7-2, P10-3, P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P7-2|P10-3|P15-6) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let variant = match self {
            Self::Initialize { .. } => "Initialize",
            Self::AddAccount { .. } => "AddAccount",
            Self::UpdateAccount { .. } => "UpdateAccount",
            Self::RemoveAccount { .. } => "RemoveAccount",
            Self::CreateTransport { .. } => "CreateTransport",
            Self::SetRegistration { .. } => "SetRegistration",
            Self::MakeCall { .. } => "MakeCall",
            Self::Answer { .. } => "Answer",
            Self::Hangup { .. } => "Hangup",
            Self::Hold { .. } => "Hold",
            Self::Unhold { .. } => "Unhold",
            Self::Transfer { .. } => "Transfer",
            Self::SendDtmf { .. } => "SendDtmf",
            Self::GetAccountInfo { .. } => "GetAccountInfo",
            Self::QueryState { .. } => "QueryState",
            Self::ConfConnect { .. } => "ConfConnect",
            Self::ConfDisconnect { .. } => "ConfDisconnect",
            Self::AddAudioSource { .. } => "AddAudioSource",
            Self::RemoveAudioSource { .. } => "RemoveAudioSource",
            Self::SetAudioSourceGain { .. } => "SetAudioSourceGain",
            Self::MuteAudioSource { .. } => "MuteAudioSource",
            Self::Shutdown { .. } => "Shutdown",
        };
        write!(f, "RuntimeCommand::{variant}")
    }
}

/// Type alias for the backend execution closure used in `DispatchCommand`.
// [::TICKET::] P0-2, P0-5, P0-6, P3-2, P7-2, P8-1, P10-3, P10-4, P11-6, P12-1, P12-7, P15-4, P15-5, P15-6, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P3-2|P7-2|P8-1|P10-3|P10-4|P11-6|P12-1|P12-7|P15-4|P15-5|P15-6|P15-7) --for-spec --no-implementation-order`.
type BackendFn =
    Box<dyn FnOnce(&mut dyn super::backend::SipBackend) -> Result<(), ReactorError> + Send>;

/// Internal dispatch command for the reactor's MPSC channel.
///
/// Each `RuntimeCommand` variant is converted into an `Execute` closure
/// that runs against the backend. This keeps the reactor loop simple:
/// it only needs to call `f(&mut backend)` and send the result.
///
/// `AddAudioSource` has a dedicated variant because its reply type is
/// `Result<u64, ReactorError>` (returns source_id), not `Result<(), ReactorError>`.
pub(crate) enum DispatchCommand {
    Execute {
        f: BackendFn,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P11-6: Send DTMF digits on a call with the two-phase timeout.
    ///
    /// Dedicated variant (not an `Execute` closure) so the reactor loop can spawn
    /// `spawn_dtmf_sent_timeout` against the single client-owned EventBus
    /// (P15-4 §62.3) after `backend.send_dtmf` succeeds — an `Execute` closure
    /// only receives `&mut dyn SipBackend` and cannot reach the EventBus.
    SendDtmf {
        call_id: u64,
        method: crate::config::account_config_spec::DtmfMethod,
        digits: String,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6, P15-7: Add an audio source with a typed source_id response.
    ///
    /// Separate from Execute because AddAudioSource returns Result<u64, ...>
    /// (the assigned source_id), which does not fit the Execute reply type.
    /// Carries `call_id` (target per-call mixer) and `channels` (IN/OUT/BOTH).
    AddAudioSource {
        call_id: u64,
        source: DebugBox<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>,
        channels: crate::audio::media_path_arch::ChannelSelector,
        reply: Reply<Result<u64, ReactorError>>,
    },
    // [::TICKET::] P8-1: O-003 — audio-lifecycle commands are dedicated dispatch
    // variants (not Execute closures) because they mutate the reactor-owned
    // AudioMixer, which an `Execute` closure's `&mut dyn SipBackend` cannot reach.
    RemoveAudioSource {
        source_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    SetAudioSourceGain {
        source_id: u64,
        gain: f32,
        reply: Reply<Result<(), ReactorError>>,
    },
    MuteAudioSource {
        source_id: u64,
        muted: bool,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-5: Query account info with a typed response channel.
    GetAccountInfo {
        native_acc_id: u32,
        reply: Reply<Result<crate::state::m20_registr_cmd_pat::AccountInfoSnapshot, ReactorError>>,
    },
    /// [::TICKET::] P7-2: O-004 — add an account and update the reactor's ClientState.
    ///
    /// Dedicated variant so the reactor loop can insert the returned `AccountEntry`
    /// into its authoritative `client_state.accounts` (backing the query API).
    /// The reply carries the assigned logical account id (P10-3) so `add_account`
    /// can build a real `SipAccountHandle`.
    AddAccount {
        config: crate::config::account_config_spec::AccountConfig,
        reply: Reply<Result<u64, ReactorError>>,
    },
    /// [::TICKET::] P12-1: place an outgoing call and reply with the assigned CallId.
    ///
    /// Dedicated variant (not an `Execute` closure) so the reactor loop can insert
    /// the returned `CallEntry` into its authoritative `client_state.calls` (C046)
    /// — an `Execute` closure only receives `&mut dyn SipBackend`. The reply
    /// carries the backend-assigned logical CallId so `make_call` returns the real
    /// id instead of a fabricated value. The reply must be sent exactly once.
    MakeCall {
        account_id: u64,
        request: Box<crate::api::call_types::OutgoingCallRequest>,
        reply: Reply<Result<u64, ReactorError>>,
    },
    /// [::TICKET::] P15-6: answer an incoming call and reflect the result in state.
    ///
    /// Dedicated variant (not an `Execute` closure) so the reactor loop can update
    /// `client_state.calls[].state` and publish `CallConnected` / decline events on
    /// the single client-owned EventBus via `handle_answer` — an `Execute` closure
    /// only receives `&mut dyn SipBackend` and cannot reach the EventBus.
    Answer {
        call_id: u64,
        code: u16,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P15-6: hang up a call, recording the reason and publishing
    /// `CallDisconnected`.
    ///
    /// Dedicated variant so the reactor loop can mark the call disconnected in
    /// `client_state.calls` and publish the disconnect event via `handle_hangup`.
    Hangup {
        call_id: u64,
        reason: crate::call::HangupReason,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P15-6: blind-transfer a call to a target URI.
    ///
    /// Dedicated variant so the reactor loop can mark the call `Transferring` in
    /// `client_state.calls` via `handle_transfer`.
    Transfer {
        call_id: u64,
        target: String,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Update the stored config of an existing account in the reactor's ClientState.
    ///
    /// Dedicated variant (not an `Execute` closure) so the reactor loop can also
    /// mutate `client_state.accounts` — an `Execute` closure only sees `&mut dyn SipBackend`.
    /// `register_on_start` is the patch delta (§62.4) consumed after the config update.
    UpdateAccount {
        account_id: u64,
        config: crate::config::account_config_spec::AccountConfig,
        register_on_start: Option<bool>,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Enable or disable registration, updating the reactor's ClientState to
    /// `Registering`/`Unregistering` alongside the backend (§17.1 command edge).
    ///
    /// Dedicated variant (not an `Execute` closure) so the reactor loop can mutate
    /// `client_state.accounts` — an `Execute` closure only sees `&mut dyn SipBackend`.
    SetRegistration {
        account_id: u64,
        enabled: bool,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Remove an account from the backend AND the reactor's ClientState.
    ///
    /// Dedicated variant so the reactor keeps `client_state.accounts` authoritative (C021).
    RemoveAccount {
        account_id: u64,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// Create a transport and record its `TransportRuntimeState`.
    ///
    /// Dedicated variant so the reactor can append to `client_state.transports`.
    CreateTransport {
        config: crate::config::transport_ice_spec::TransportConfig,
        reply: Reply<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P7-2: O-004 — clone the reactor's authoritative ClientState.
    QueryState {
        reply: Reply<Result<crate::runtime::state::ClientState, ReactorError>>,
    },
    /// [::TICKET::] P12-7: a NativeEvent enqueued by the FFI callback bridge
    /// (P8-21) or injected via `RuntimeHandle::enqueue_native_event`.
    ///
    /// Dedicated variant (not an `Execute` closure) so the reactor loop can reach
    /// the reactor-owned EventBus instances through `process_native_event` — an
    /// `Execute` closure only receives `&mut dyn SipBackend` and cannot publish.
    NativeEvent {
        event: crate::state::m20_native_event_conv::NativeEvent,
    },
    Shutdown {
        reply: Reply<Result<(), ReactorError>>,
    },
}

// [::TICKET::] P0-2, P0-5, P0-6, P3-1, P3-2, P7-2, P8-1, P10-3, P11-3, P11-6, P11-10, P11-11, P12-1, P15-5, P15-6, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P3-1|P3-2|P7-2|P8-1|P10-3|P11-3|P11-6|P11-10|P11-11|P12-1|P15-5|P15-6|P15-7) --for-spec --no-implementation-order`.
impl DispatchCommand {
    /// Convert a `RuntimeCommand` into a `DispatchCommand` by boxing the execution.
    pub fn from_runtime_command(cmd: RuntimeCommand) -> Self {
        match cmd {
            RuntimeCommand::Initialize { config, reply } => Self::Execute {
                f: Box::new(move |backend| {
                    backend.initialize(&config)?;
                    Ok(())
                }),
                reply,
            },
            RuntimeCommand::AddAccount { config, reply } => Self::AddAccount { config, reply },
            RuntimeCommand::UpdateAccount {
                account_id,
                config,
                register_on_start,
                reply,
            } => Self::UpdateAccount {
                account_id,
                config,
                register_on_start,
                reply,
            },
            RuntimeCommand::RemoveAccount { account_id, reply } => {
                Self::RemoveAccount { account_id, reply }
            }
            RuntimeCommand::CreateTransport { config, reply } => {
                Self::CreateTransport { config, reply }
            }
            RuntimeCommand::SetRegistration {
                account_id,
                enabled,
                reply,
            } => Self::SetRegistration {
                account_id,
                enabled,
                reply,
            },
            RuntimeCommand::MakeCall {
                account_id,
                request,
                reply,
            } => Self::MakeCall {
                account_id,
                request,
                reply,
            },
            RuntimeCommand::Answer { call_id, code, reply } => Self::Answer {
                call_id,
                code,
                reply,
            },
            RuntimeCommand::Hangup {
                call_id,
                reason,
                reply,
            } => Self::Hangup {
                call_id,
                reason,
                reply,
            },
            RuntimeCommand::Hold { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.hold(call_id as i32)),
                reply,
            },
            RuntimeCommand::Unhold { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.unhold(call_id as i32)),
                reply,
            },
            RuntimeCommand::Transfer { call_id, target, reply } => Self::Transfer {
                call_id,
                target,
                reply,
            },
            RuntimeCommand::SendDtmf {
                call_id,
                method,
                digits,
                reply,
            } => Self::SendDtmf {
                call_id,
                method,
                digits,
                reply,
            },
            RuntimeCommand::GetAccountInfo {
                native_acc_id,
                reply,
            } => Self::GetAccountInfo {
                native_acc_id,
                reply,
            },
            RuntimeCommand::QueryState { reply } => Self::QueryState { reply },
            RuntimeCommand::ConfConnect { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.conf_connect(call_id as i32, call_id as i32)),
                reply,
            },
            RuntimeCommand::ConfDisconnect { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.conf_disconnect(call_id as i32, call_id as i32)),
                reply,
            },
            // [::TICKET::] P0-6, P8-1: Audio source lifecycle commands map to dedicated
            // DispatchCommand variants (O-003). They cannot be Execute closures: the
            // closure only receives `&mut dyn SipBackend`, while these commands mutate
            // the reactor-owned AudioMixer, so the reactor loop must dispatch them.
            RuntimeCommand::AddAudioSource {
                call_id,
                source,
                channels,
                reply,
            } => {
                Self::AddAudioSource {
                    call_id,
                    source,
                    channels,
                    reply,
                }
            }
            RuntimeCommand::RemoveAudioSource { source_id, reply } => {
                Self::RemoveAudioSource { source_id, reply }
            }
            RuntimeCommand::SetAudioSourceGain {
                source_id,
                gain,
                reply,
            } => Self::SetAudioSourceGain {
                source_id,
                gain,
                reply,
            },
            RuntimeCommand::MuteAudioSource {
                source_id,
                muted,
                reply,
            } => Self::MuteAudioSource {
                source_id,
                muted,
                reply,
            },
            RuntimeCommand::Shutdown { reply } => Self::Shutdown { reply },
        }
    }
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl std::fmt::Debug for DispatchCommand {
// [::TICKET::] P0-2, P0-5, P0-6, P7-2, P8-1, P10-3, P11-6, P11-11, P12-1, P12-7, P15-5, P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6|P7-2|P8-1|P10-3|P11-6|P11-11|P12-1|P12-7|P15-5|P15-6) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Execute { .. } => f
                .debug_struct("DispatchCommand::Execute")
                .finish_non_exhaustive(),
            Self::SendDtmf { .. } => f
                .debug_struct("DispatchCommand::SendDtmf")
                .finish_non_exhaustive(),
            Self::AddAudioSource { .. } => f
                .debug_struct("DispatchCommand::AddAudioSource")
                .finish_non_exhaustive(),
            Self::RemoveAudioSource { .. } => f
                .debug_struct("DispatchCommand::RemoveAudioSource")
                .finish_non_exhaustive(),
            Self::SetAudioSourceGain { .. } => f
                .debug_struct("DispatchCommand::SetAudioSourceGain")
                .finish_non_exhaustive(),
            Self::MuteAudioSource { .. } => f
                .debug_struct("DispatchCommand::MuteAudioSource")
                .finish_non_exhaustive(),
            Self::GetAccountInfo { .. } => f
                .debug_struct("DispatchCommand::GetAccountInfo")
                .finish_non_exhaustive(),
            Self::AddAccount { .. } => f
                .debug_struct("DispatchCommand::AddAccount")
                .finish_non_exhaustive(),
            Self::MakeCall { .. } => f
                .debug_struct("DispatchCommand::MakeCall")
                .finish_non_exhaustive(),
            Self::Answer { .. } => f
                .debug_struct("DispatchCommand::Answer")
                .finish_non_exhaustive(),
            Self::Hangup { .. } => f
                .debug_struct("DispatchCommand::Hangup")
                .finish_non_exhaustive(),
            Self::Transfer { .. } => f
                .debug_struct("DispatchCommand::Transfer")
                .finish_non_exhaustive(),
            Self::UpdateAccount { .. } => f
                .debug_struct("DispatchCommand::UpdateAccount")
                .finish_non_exhaustive(),
            Self::RemoveAccount { .. } => f
                .debug_struct("DispatchCommand::RemoveAccount")
                .finish_non_exhaustive(),
            Self::CreateTransport { .. } => f
                .debug_struct("DispatchCommand::CreateTransport")
                .finish_non_exhaustive(),
            Self::SetRegistration { .. } => f
                .debug_struct("DispatchCommand::SetRegistration")
                .finish_non_exhaustive(),
            Self::QueryState { .. } => f
                .debug_struct("DispatchCommand::QueryState")
                .finish_non_exhaustive(),
            Self::NativeEvent { .. } => f
                .debug_struct("DispatchCommand::NativeEvent")
                .finish_non_exhaustive(),
            Self::Shutdown { .. } => write!(f, "DispatchCommand::Shutdown"),
        }
    }
}

/// Helper: send a result on a oneshot channel, logging if the receiver dropped.
///
/// Generic over `T` so both `Result<(), _>` replies (Execute/Shutdown) and typed
/// replies (`Result<u64, _>` for AddAudioSource) share the same receiver-drop
/// observability.
pub(crate) fn send_reply<T>(
    sender: Reply<Result<T, ReactorError>>,
    result: Result<T, ReactorError>,
) {
    if sender.send(result).is_err() {
        // Receiver dropped — this is expected if the caller cancelled their task.
        tracing::warn!("oneshot receiver dropped; reply not delivered");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::backend::TestBackend;

    #[test]
    // @verifies C011
    // [::TICKET::] P0-2, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P10-4) --for-spec --no-implementation-order`.
    fn runtime_command_display_shows_variant_name() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Shutdown {
            reply: Reply::new(tx),
        };
        let display = format!("{cmd}");
        assert_eq!(display, "RuntimeCommand::Shutdown");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-2, P0-3, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-3|P10-4) --for-spec --no-implementation-order`.
    fn runtime_command_variant_discriminants_are_distinct() {
        // Contract-C011: each RuntimeCommand discriminates correctly.
        let (tx1, _rx1) = tokio::sync::oneshot::channel();
        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let cmd_a = RuntimeCommand::Initialize {
            config: crate::config::ClientConfig::default(),
            reply: Reply::new(tx1),
        };
        let cmd_b = RuntimeCommand::Shutdown {
            reply: Reply::new(tx2),
        };

        // Verify by Display — each variant has a unique name.
        assert_ne!(format!("{cmd_a}"), format!("{cmd_b}"));
    }

    #[test]
    // @verifies C069
    // [::TICKET::] P11-6: RuntimeCommand::SendDtmf carries the method into DispatchCommand::SendDtmf
    // [::TICKET::] P11-6, P11-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-6|P11-11) --for-spec --no-implementation-order`.
    fn runtime_command_send_dtmf_carries_method() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::SendDtmf {
            call_id: 1,
            method: crate::config::account_config_spec::DtmfMethod::Rfc2833,
            digits: "5".into(),
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::SendDtmf {
                call_id,
                method,
                digits,
                reply: _,
            } => {
                assert_eq!(call_id, 1);
                assert_eq!(
                    method,
                    crate::config::account_config_spec::DtmfMethod::Rfc2833
                );
                assert_eq!(digits, "5");
            }
            other => panic!("expected DispatchCommand::SendDtmf, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn send_reply_logs_on_dropped_receiver() {
        // If the receiver is dropped, send_reply must not panic.
        let (tx, rx) = tokio::sync::oneshot::channel();
        drop(rx); // Drop the receiver before sending
        send_reply(Reply::new(tx), Ok(())); // Should log a warning, not panic
    }

    #[tokio::test]
    async fn send_reply_delivers_value_when_receiver_alive() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        send_reply(Reply::new(tx), Ok(()));

        let result = rx.await;
        assert!(result.is_ok(), "reply must be delivered");
        assert!(result.unwrap().is_ok());
    }

    #[test]
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn reactor_error_display_formats_correctly() {
        assert_eq!(
            format!("{}", ReactorError::ReactorDown),
            "reactor thread is down"
        );
        assert_eq!(
            format!("{}", ReactorError::NotInitialized("no boot".into())),
            "not initialized: no boot"
        );
        assert_eq!(
            format!("{}", ReactorError::BackendError("pjsua failed".into())),
            "backend error: pjsua failed"
        );
    }

    // ── P0-6 new RuntimeCommand variant tests ───────────────────────

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
    // [::TICKET::] P0-6, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4) --for-spec --no-implementation-order`.
    fn conf_connect_variant_constructs_and_displays() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfConnect {
            call_id: 42,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::ConfConnect");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
    // [::TICKET::] P0-6, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4) --for-spec --no-implementation-order`.
    fn conf_disconnect_variant_constructs_and_displays() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfDisconnect {
            call_id: 7,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::ConfDisconnect");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6, P10-4, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4|P15-7) --for-spec --no-implementation-order`.
    fn add_audio_source_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let source = Box::new(crate::runtime::audio_worker::MockAsyncAudioSource::new(
            vec![0i16; 160],
        ));
        let cmd = RuntimeCommand::AddAudioSource {
            call_id: 42,
            source: DebugBox::new(source),
            channels: crate::audio::media_path_arch::ChannelSelector::Out,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::AddAudioSource");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
    // [::TICKET::] P0-6, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4) --for-spec --no-implementation-order`.
    fn remove_audio_source_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::RemoveAudioSource {
            source_id: 5,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::RemoveAudioSource");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
    // [::TICKET::] P0-6, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4) --for-spec --no-implementation-order`.
    fn set_audio_source_gain_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::SetAudioSourceGain {
            source_id: 3,
            gain: 0.75,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::SetAudioSourceGain");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
    // [::TICKET::] P0-6, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4) --for-spec --no-implementation-order`.
    fn mute_audio_source_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::MuteAudioSource {
            source_id: 1,
            muted: true,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::MuteAudioSource");
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
    // [::TICKET::] P0-6, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P10-4) --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_conf_connect() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfConnect {
            call_id: 42,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { .. } => {} // expected
            _ => panic!("ConfConnect must map to DispatchCommand::Execute"),
        }
        drop(rx);
    }

    #[test]
    // @verifies C012, C070
    // [::TICKET::] P12-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-1 --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_make_call_to_dedicated_variant() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let request = crate::api::call_types::OutgoingCallRequest {
            target_uri: "sip:bob@example.com".into(),
            headers: vec![],
            auth_override: None,
            preferred_transport: None,
            media: crate::api::call_types::CallMediaPreferences::default(),
            auto_answer_refer: false,
        };
        let cmd = RuntimeCommand::MakeCall {
            account_id: 7,
            request: Box::new(request.clone()),
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::MakeCall {
                account_id,
                request,
                reply,
            } => {
                assert_eq!(account_id, 7, "account_id must be preserved");
                assert_eq!(
                    request.target_uri, "sip:bob@example.com",
                    "request payload must be preserved"
                );
                let _ = reply;
            }
            other => panic!("expected DispatchCommand::MakeCall, got {other:?}"),
        }
    }

    // ── P15-6: Answer / Hangup{reason} / Transfer dedicated dispatch ──

    #[test]
    // @verifies C086
    // [::TICKET::] P15-6: Answer maps to the dedicated DispatchCommand::Answer
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_answer_to_dedicated_variant() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Answer {
            call_id: 7,
            code: 200,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Answer {
                call_id,
                code,
                reply,
            } => {
                assert_eq!(call_id, 7, "call_id must be preserved");
                assert_eq!(code, 200, "answer code must be preserved");
                let _ = reply;
            }
            other => panic!("expected DispatchCommand::Answer, got {other:?}"),
        }
    }

    #[test]
    // @verifies C074
    // [::TICKET::] P15-6: Hangup maps to the dedicated DispatchCommand::Hangup and
    // carries the caller-supplied reason.
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_hangup_to_dedicated_variant_with_reason() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Hangup {
            call_id: 9,
            reason: crate::call::HangupReason::LocalUser,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Hangup {
                call_id,
                reason,
                reply,
            } => {
                assert_eq!(call_id, 9, "call_id must be preserved");
                assert_eq!(
                    reason,
                    crate::call::HangupReason::LocalUser,
                    "hangup reason must be preserved"
                );
                let _ = reply;
            }
            other => panic!("expected DispatchCommand::Hangup, got {other:?}"),
        }
    }

    #[test]
    // @verifies C074
    // [::TICKET::] P15-6: Transfer maps to the dedicated DispatchCommand::Transfer
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_transfer_to_dedicated_variant() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Transfer {
            call_id: 3,
            target: "sip:bob@example.com".into(),
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Transfer {
                call_id,
                target,
                reply,
            } => {
                assert_eq!(call_id, 3, "call_id must be preserved");
                assert_eq!(target, "sip:bob@example.com", "target must be preserved");
                let _ = reply;
            }
            other => panic!("expected DispatchCommand::Transfer, got {other:?}"),
        }
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P15-6: new RuntimeCommand variants display their variant name
// [::TICKET::] P15-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P15-6 --for-spec --no-implementation-order`.
    fn runtime_command_display_shows_new_call_api_variants() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let answer = RuntimeCommand::Answer {
            call_id: 1,
            code: 200,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{answer}"), "RuntimeCommand::Answer");
        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let hangup = RuntimeCommand::Hangup {
            call_id: 1,
            reason: crate::call::HangupReason::Busy,
            reply: Reply::new(tx2),
        };
        assert_eq!(format!("{hangup}"), "RuntimeCommand::Hangup");
        let (tx3, _rx3) = tokio::sync::oneshot::channel();
        let transfer = RuntimeCommand::Transfer {
            call_id: 1,
            target: "sip:bob@example.com".into(),
            reply: Reply::new(tx3),
        };
        assert_eq!(format!("{transfer}"), "RuntimeCommand::Transfer");
    }

    #[test]
    // @verifies C035
    // [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C035
// [::TICKET::] P0-6, P8-1, P10-4, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-6|P8-1|P10-4|P15-7) --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_audio_source_variants() {
        let (tx1, _rx1) = tokio::sync::oneshot::channel();
        let cmd1 = RuntimeCommand::AddAudioSource {
            call_id: 42,
            source: DebugBox::new(Box::new(
                crate::runtime::audio_worker::MockAsyncAudioSource::new(vec![0i16; 160]),
            )),
            channels: crate::audio::media_path_arch::ChannelSelector::Both,
            reply: Reply::new(tx1),
        };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd1),
            DispatchCommand::AddAudioSource { .. }
        ));

        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let cmd2 = RuntimeCommand::RemoveAudioSource {
            source_id: 1,
            reply: Reply::new(tx2),
        };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd2),
            DispatchCommand::RemoveAudioSource { .. }
        ));

        let (tx3, _rx3) = tokio::sync::oneshot::channel();
        let cmd3 = RuntimeCommand::SetAudioSourceGain {
            source_id: 1,
            gain: 0.5,
            reply: Reply::new(tx3),
        };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd3),
            DispatchCommand::SetAudioSourceGain { .. }
        ));

        let (tx4, _rx4) = tokio::sync::oneshot::channel();
        let cmd4 = RuntimeCommand::MuteAudioSource {
            source_id: 1,
            muted: true,
            reply: Reply::new(tx4),
        };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd4),
            DispatchCommand::MuteAudioSource { .. }
        ));
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P8-1: O-004 — ConfDisconnect conversion test (mirrors ConfConnect test).
    // [::TICKET::] P8-1, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-4) --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_conf_disconnect() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfDisconnect {
            call_id: 7,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { .. } => {}
            _ => panic!("ConfDisconnect must map to DispatchCommand::Execute"),
        }
        drop(rx);
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P8-1: O-001 — executing the ConfConnect closure must invoke backend.conf_connect.
// [::TICKET::] P8-1, P10-4, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-4|P15-3) --for-spec --no-implementation-order`.
    fn conf_connect_closure_invokes_backend_conf_connect() {
        let mut backend = TestBackend::new();
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfConnect {
            call_id: 9,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { f, .. } => {
                let result = f(&mut backend);
                assert!(result.is_ok(), "conf_connect closure must succeed");
            }
            _ => panic!("ConfConnect must map to DispatchCommand::Execute"),
        }
        assert_eq!(
            backend.conf_connect_calls,
            vec![(9i32, 9i32)],
            "backend.conf_connect must be invoked with (call_id, call_id)"
        );
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P8-1: O-001 — executing the ConfDisconnect closure must invoke backend.conf_disconnect.
// [::TICKET::] P8-1, P10-4, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P8-1|P10-4|P15-3) --for-spec --no-implementation-order`.
    fn conf_disconnect_closure_invokes_backend_conf_disconnect() {
        let mut backend = TestBackend::new();
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfDisconnect {
            call_id: 5,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { f, .. } => {
                let result = f(&mut backend);
                assert!(result.is_ok(), "conf_disconnect closure must succeed");
            }
            _ => panic!("ConfDisconnect must map to DispatchCommand::Execute"),
        }
        assert_eq!(
            backend.conf_disconnect_calls,
            vec![(5i32, 5i32)],
            "backend.conf_disconnect must be invoked with (call_id, call_id)"
        );
    }

    // ── P11-11: Hold/Unhold dispatch (resolves command.rs:402 stub) ─────

    #[test]
    // @verifies C054
// [::TICKET::] P11-11, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-11|P15-3) --for-spec --no-implementation-order`.
    fn hold_closure_invokes_backend_hold() {
        let mut backend = TestBackend::new();
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Hold {
            call_id: 9,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { f, .. } => {
                let result = f(&mut backend);
                assert!(result.is_ok(), "hold closure must succeed");
            }
            _ => panic!("Hold must map to DispatchCommand::Execute"),
        }
        assert_eq!(
            backend.hold_calls,
            vec![9],
            "backend.hold must be invoked with call_id"
        );
    }

    #[test]
    // @verifies C054
// [::TICKET::] P11-11, P15-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-11|P15-3) --for-spec --no-implementation-order`.
    fn unhold_closure_invokes_backend_unhold() {
        let mut backend = TestBackend::new();
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Unhold {
            call_id: 12,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { f, .. } => {
                let result = f(&mut backend);
                assert!(result.is_ok(), "unhold closure must succeed");
            }
            _ => panic!("Unhold must map to DispatchCommand::Execute"),
        }
        assert_eq!(
            backend.unhold_calls,
            vec![12],
            "backend.unhold must be invoked with call_id"
        );
    }

    // ── P10-3: UpdateAccount / CreateTransport / dedicated RemoveAccount ─

    #[test]
    // @verifies C012
// [::TICKET::] P10-3, P10-4, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P10-4|P15-5) --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_update_account() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::UpdateAccount {
            account_id: 3,
            config: crate::config::account_config_spec::AccountConfig::default(),
            register_on_start: None,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        assert!(
            matches!(
                dispatch,
                DispatchCommand::UpdateAccount { account_id: 3, .. }
            ),
            "UpdateAccount must map to the dedicated UpdateAccount variant"
        );
        drop(rx);
    }

    #[test]
    // @verifies C016
    // [::TICKET::] P10-3, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P10-4) --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_create_transport() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::CreateTransport {
            config: crate::config::transport_ice_spec::TransportConfig::udp(5060),
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        assert!(
            matches!(dispatch, DispatchCommand::CreateTransport { .. }),
            "CreateTransport must map to the dedicated CreateTransport variant"
        );
        drop(rx);
    }

    #[test]
    // @verifies C012
    // [::TICKET::] P10-3, P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P10-4) --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_remove_account_to_dedicated_variant() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::RemoveAccount {
            account_id: 7,
            reply: Reply::new(tx),
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        assert!(
            matches!(
                dispatch,
                DispatchCommand::RemoveAccount { account_id: 7, .. }
            ),
            "RemoveAccount must map to a dedicated variant so the reactor can update ClientState"
        );
        drop(rx);
    }

    #[test]
    // @verifies C011
// [::TICKET::] P10-3, P10-4, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-3|P10-4|P15-5) --for-spec --no-implementation-order`.
    fn runtime_command_display_shows_new_lifecycle_variants() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let update = RuntimeCommand::UpdateAccount {
            account_id: 1,
            config: crate::config::account_config_spec::AccountConfig::default(),
            register_on_start: None,
            reply: Reply::new(tx),
        };
        assert_eq!(format!("{update}"), "RuntimeCommand::UpdateAccount");
        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let transport = RuntimeCommand::CreateTransport {
            config: crate::config::transport_ice_spec::TransportConfig::udp(5060),
            reply: Reply::new(tx2),
        };
        assert_eq!(format!("{transport}"), "RuntimeCommand::CreateTransport");
    }

    // ── P10-4: Debug-friendly sender wrapper (Reply) + DebugBox + derive Debug ──

    #[test]
    // @verifies C011
// [::TICKET::] P10-4, P15-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-4|P15-5) --for-spec --no-implementation-order`.
    fn runtime_command_debug_exposes_payload_field_names() {
        // RED on the manual impl (prints only "RuntimeCommand::UpdateAccount");
        // GREEN once #[derive(Debug)] replaces it.
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::UpdateAccount {
            account_id: 1,
            config: crate::config::account_config_spec::AccountConfig::default(),
            register_on_start: None,
            reply: Reply::new(tx),
        };
        assert!(
            format!("{cmd:?}").contains("config"),
            "derived Debug must expose payload field names"
        );
    }

    #[test]
    // @verifies C053
    // [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
    fn reply_debug_output_is_payload_independent() {
        let (tx, _rx) = tokio::sync::oneshot::channel::<Result<(), ReactorError>>();
        let unit_output = format!("{:?}", Reply::new(tx));
        let (tx2, _rx2) = tokio::sync::oneshot::channel::<Result<u64, ReactorError>>();
        let u64_output = format!("{:?}", Reply::new(tx2));
        assert_eq!(
            unit_output, u64_output,
            "Reply Debug must be payload-independent"
        );
    }

    #[tokio::test]
    // @verifies C053
    async fn reply_send_delivers_and_into_inner_recovers() {
        let (tx, rx) = tokio::sync::oneshot::channel::<u64>();
        Reply::new(tx).send(42).ok();
        assert_eq!(rx.await, Ok(42));
        let (tx2, _rx2) = tokio::sync::oneshot::channel::<u64>();
        let inner: tokio::sync::oneshot::Sender<u64> = Reply::new(tx2).into_inner();
        assert!(inner.send(7).is_ok());
    }

    #[test]
    // @verifies C053
    // [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
    fn reply_send_returns_err_on_dropped_receiver() {
        let (tx, rx) = tokio::sync::oneshot::channel::<u64>();
        drop(rx);
        assert!(Reply::new(tx).send(1).is_err());
    }

    #[tokio::test]
    // @verifies C054
    async fn debugbox_into_inner_preserves_audio_source() {
        let source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send> = Box::new(
            crate::runtime::audio_worker::MockAsyncAudioSource::new(vec![7i16; 160]),
        );
        let boxed = DebugBox::new(source);
        assert!(
            !format!("{boxed:?}").is_empty(),
            "DebugBox Debug must be opaque and stable"
        );
        let mut recovered = boxed.into_inner();
        let mut buf = vec![0i16; 160];
        assert_eq!(
            recovered.next_chunk(&mut buf).await,
            160,
            "source survives the round-trip"
        );
    }

    #[test]
    // @verifies C011
    // [::TICKET::] P10-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P10-4 --for-spec --no-implementation-order`.
    fn runtime_command_derives_debug() {
        // [::TICKET::] P10-4, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-4|P12-7) --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<RuntimeCommand>();
        assert_debug::<Reply<Result<(), ReactorError>>>();
        assert_debug::<DebugBox<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>>();
    }

    #[test]
    // @verifies C054
// [::TICKET::] P10-4, P15-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P10-4|P15-7) --for-spec --no-implementation-order`.
    fn from_runtime_command_preserves_reply_and_debugbox() {
        let (tx, _rx) = tokio::sync::oneshot::channel::<Result<u64, ReactorError>>();
        let source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send> = Box::new(
            crate::runtime::audio_worker::MockAsyncAudioSource::new(vec![0i16; 160]),
        );
        let cmd = RuntimeCommand::AddAudioSource {
            call_id: 42,
            source: DebugBox::new(source),
            channels: crate::audio::media_path_arch::ChannelSelector::Out,
            reply: Reply::new(tx),
        };
        match DispatchCommand::from_runtime_command(cmd) {
            DispatchCommand::AddAudioSource {
                call_id,
                source,
                channels,
                reply,
            } => {
                assert_eq!(call_id, 42);
                assert_eq!(channels, crate::audio::media_path_arch::ChannelSelector::Out);
                let _b: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send> =
                    source.into_inner();
                let _s: tokio::sync::oneshot::Sender<Result<u64, ReactorError>> =
                    reply.into_inner();
            }
            _ => panic!("AddAudioSource must map to the dedicated variant"),
        }
    }

    // ── P12-7: DispatchCommand::NativeEvent variant ───────────────────

    #[test]
    // @verifies C011
    // [::TICKET::] P12-7: the NativeEvent variant is Debug-formattable and names
    // the variant (payload is opaque via finish_non_exhaustive, mirroring Reply).
    // [::TICKET::] P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P12-7 --for-spec --no-implementation-order`.
    fn dispatch_command_native_event_debug_is_opaque() {
        let cmd = DispatchCommand::NativeEvent {
            event: crate::state::m20_native_event_conv::NativeEvent::NatDetected,
        };
        let debug_output = format!("{cmd:?}");
        assert!(
            debug_output.contains("NativeEvent"),
            "Debug must name the variant, got {debug_output}"
        );
    }
}
