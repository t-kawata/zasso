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

// [::TICKET::] P0-2, P0-3, P0-5, P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-3|P0-5|P0-6) --for-spec --no-implementation-order`.
impl std::error::Error for ReactorError {}

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
/// - Debug is manual (not derived) because `Box<dyn AsyncAudioSource>` is not Debug.
pub enum RuntimeCommand {
    Initialize {
        config: crate::config::ClientConfig,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    AddAccount {
        // [::STUB::] P0-3: config: AccountConfig (currently String until P0-7)
        config: String,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    RemoveAccount {
        account_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    SetRegistration {
        account_id: u64,
        enabled: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    MakeCall {
        account_id: u64,
        // [::STUB::] P0-3: request: OutgoingCallRequest
        request: String,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    Hangup {
        call_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    Hold {
        call_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    Unhold {
        call_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    SendDtmf {
        call_id: u64,
        digits: String,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-5: Query the backend for registration account info.
    ///
    /// Used by the RegistrationStateChanged event flow to retrieve
    /// registration status and produce RegistrationSucceeded/Failed.
    GetAccountInfo {
        native_acc_id: u32,
        reply: tokio::sync::oneshot::Sender<Result<crate::state::m20_registr_cmd_pat::AccountInfoSnapshot, ReactorError>>,
    },
    /// [::TICKET::] P0-6: Connect a call to the conference bridge.
    ///
    /// Delegates to `Backend::conf_connect()`. Used for M20 conference
    /// call management.
    ConfConnect {
        call_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Disconnect a call from the conference bridge.
    ///
    /// Delegates to `Backend::conf_disconnect()`. The inverse of ConfConnect.
    ConfDisconnect {
        call_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Add an audio source to the call's AudioMixer.
    ///
    /// The source is boxed and stored in the mixer. Returns the assigned
    /// source_id via the oneshot channel.
    AddAudioSource {
        source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>,
        reply: tokio::sync::oneshot::Sender<Result<u64, ReactorError>>,
    },
    /// [::TICKET::] P0-6: Remove an audio source from the call's AudioMixer.
    RemoveAudioSource {
        source_id: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Set the gain of an audio source.
    SetAudioSourceGain {
        source_id: u64,
        gain: f32,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Mute or unmute an audio source.
    MuteAudioSource {
        source_id: u64,
        muted: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    Shutdown {
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
}

// [::STUB::] P0-2: Debug is not derived for oneshot::Sender since it doesn't implement Debug.
// We manually implement Display for testing purposes.
// [::TICKET::] P0-2, P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-6) --for-spec --no-implementation-order`.
impl std::fmt::Debug for RuntimeCommand {
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Manual Debug — skips non-Debug fields like Box<dyn AsyncAudioSource>
        let variant = match self {
            Self::Initialize { .. } => "Initialize",
            Self::AddAccount { .. } => "AddAccount",
            Self::RemoveAccount { .. } => "RemoveAccount",
            Self::SetRegistration { .. } => "SetRegistration",
            Self::MakeCall { .. } => "MakeCall",
            Self::Hangup { .. } => "Hangup",
            Self::Hold { .. } => "Hold",
            Self::Unhold { .. } => "Unhold",
            Self::SendDtmf { .. } => "SendDtmf",
            Self::GetAccountInfo { .. } => "GetAccountInfo",
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

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl std::fmt::Display for RuntimeCommand {
// [::TICKET::] P0-2, P0-5, P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let variant = match self {
            Self::Initialize { .. } => "Initialize",
            Self::AddAccount { .. } => "AddAccount",
            Self::RemoveAccount { .. } => "RemoveAccount",
            Self::SetRegistration { .. } => "SetRegistration",
            Self::MakeCall { .. } => "MakeCall",
            Self::Hangup { .. } => "Hangup",
            Self::Hold { .. } => "Hold",
            Self::Unhold { .. } => "Unhold",
            Self::SendDtmf { .. } => "SendDtmf",
            Self::GetAccountInfo { .. } => "GetAccountInfo",
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
// [::TICKET::] P0-2, P0-5, P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6) --for-spec --no-implementation-order`.
type BackendFn =
    Box<dyn FnOnce(&mut dyn super::backend::Backend) -> Result<(), ReactorError> + Send>;

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
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
    /// [::TICKET::] P0-6: Add an audio source with a typed source_id response.
    ///
    /// Separate from Execute because AddAudioSource returns Result<u64, ...>
    /// (the assigned source_id), which does not fit the Execute reply type.
    AddAudioSource {
        source: Box<dyn crate::runtime::audio_worker::AsyncAudioSource + Send>,
        reply: tokio::sync::oneshot::Sender<Result<u64, ReactorError>>,
    },
    /// [::TICKET::] P0-5: Query account info with a typed response channel.
    GetAccountInfo {
        native_acc_id: u32,
        reply: tokio::sync::oneshot::Sender<Result<crate::state::m20_registr_cmd_pat::AccountInfoSnapshot, ReactorError>>,
    },
    Shutdown {
        reply: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    },
}

// [::TICKET::] P0-2, P0-5, P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6) --for-spec --no-implementation-order`.
impl DispatchCommand {
    /// Convert a `RuntimeCommand` into a `DispatchCommand` by boxing the execution.
    pub fn from_runtime_command(cmd: RuntimeCommand) -> Self {
        match cmd {
            RuntimeCommand::Initialize { config, reply } => Self::Execute {
                f: Box::new(move |backend| {
                    backend.initialize()?;
                    // [::STUB::] P0-3: store ClientConfig in ClientState
                    let _ = config;
                    Ok(())
                }),
                reply,
            },
            RuntimeCommand::AddAccount { config, reply } => Self::Execute {
                f: Box::new(move |backend| {
                    backend.add_account(&config)?;
                    // [::STUB::] P0-3: store AccountEntry in ClientState, return AccountId
                    Ok(())
                }),
                reply,
            },
            RuntimeCommand::RemoveAccount { account_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.remove_account(account_id)),
                reply,
            },
            RuntimeCommand::SetRegistration {
                account_id,
                enabled,
                reply,
            } => Self::Execute {
                f: Box::new(move |backend| backend.set_registration(account_id, enabled)),
                reply,
            },
            RuntimeCommand::MakeCall {
                account_id,
                request,
                reply,
            } => Self::Execute {
                f: Box::new(move |backend| {
                    backend.make_call(account_id, &request)?;
                    // [::STUB::] P0-3: store CallEntry in ClientState, return CallId
                    Ok(())
                }),
                reply,
            },
            RuntimeCommand::Hangup { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.hangup(call_id)),
                reply,
            },
            RuntimeCommand::Hold { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.hold(call_id)),
                reply,
            },
            RuntimeCommand::Unhold { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.unhold(call_id)),
                reply,
            },
            RuntimeCommand::SendDtmf {
                call_id,
                digits,
                reply,
            } => Self::Execute {
                f: Box::new(move |backend| backend.send_dtmf(call_id, &digits)),
                reply,
            },
            RuntimeCommand::GetAccountInfo {
                native_acc_id,
                reply,
            } => Self::GetAccountInfo {
                native_acc_id,
                reply,
            },
            RuntimeCommand::ConfConnect { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.conf_connect(call_id)),
                reply,
            },
            RuntimeCommand::ConfDisconnect { call_id, reply } => Self::Execute {
                f: Box::new(move |backend| backend.conf_disconnect(call_id)),
                reply,
            },
            // [::TICKET::] P0-6: Audio source lifecycle commands are processed
            // through Execute with closures that operate on the reactor's state.
            // Dedicated DispatchCommand variants are not needed because these
            // commands do not require special reactor loop handling beyond
            // backend dispatch.
            RuntimeCommand::AddAudioSource {
                source,
                reply,
            } => Self::AddAudioSource {
                source,
                reply,
            },
            RuntimeCommand::RemoveAudioSource {
                source_id: _source_id,
                reply,
            } => Self::Execute {
                f: Box::new(move |_backend| {
                    Err(ReactorError::BackendError(
                        "audio source lifecycle not yet connected (P0-7)".into(),
                    ))
                }),
                reply,
            },
            RuntimeCommand::SetAudioSourceGain {
                source_id: _source_id,
                gain: _gain,
                reply,
            } => Self::Execute {
                f: Box::new(move |_backend| {
                    Err(ReactorError::BackendError(
                        "audio source lifecycle not yet connected (P0-7)".into(),
                    ))
                }),
                reply,
            },
            RuntimeCommand::MuteAudioSource {
                source_id: _source_id,
                muted: _muted,
                reply,
            } => Self::Execute {
                f: Box::new(move |_backend| {
                    Err(ReactorError::BackendError(
                        "audio source lifecycle not yet connected (P0-7)".into(),
                    ))
                }),
                reply,
            },
            RuntimeCommand::Shutdown { reply } => Self::Shutdown { reply },
        }
    }
}

// [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
impl std::fmt::Debug for DispatchCommand {
// [::TICKET::] P0-2, P0-5, P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-5|P0-6) --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Execute { .. } => f
                .debug_struct("DispatchCommand::Execute")
                .finish_non_exhaustive(),
            Self::AddAudioSource { .. } => f
                .debug_struct("DispatchCommand::AddAudioSource")
                .finish_non_exhaustive(),
            Self::GetAccountInfo { .. } => f
                .debug_struct("DispatchCommand::GetAccountInfo")
                .finish_non_exhaustive(),
            Self::Shutdown { .. } => write!(f, "DispatchCommand::Shutdown"),
        }
    }
}

/// Helper: send a result on a oneshot channel, logging if the receiver dropped.
pub(crate) fn send_reply(
    sender: tokio::sync::oneshot::Sender<Result<(), ReactorError>>,
    result: Result<(), ReactorError>,
) {
    if sender.send(result).is_err() {
        // Receiver dropped — this is expected if the caller cancelled their task.
        tracing::warn!("oneshot receiver dropped; reply not delivered");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    // @verifies C011
    // [::TICKET::] P0-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-2 --for-spec --no-implementation-order`.
    fn runtime_command_display_shows_variant_name() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::Shutdown { reply: tx };
        let display = format!("{cmd}");
        assert_eq!(display, "RuntimeCommand::Shutdown");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-2, P0-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-2|P0-3) --for-spec --no-implementation-order`.
    fn runtime_command_variant_discriminants_are_distinct() {
        // Contract-C011: each RuntimeCommand discriminates correctly.
        let (tx1, _rx1) = tokio::sync::oneshot::channel();
        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let cmd_a = RuntimeCommand::Initialize {
            config: crate::config::ClientConfig::default(),
            reply: tx1,
        };
        let cmd_b = RuntimeCommand::Shutdown { reply: tx2 };

        // Verify by Display — each variant has a unique name.
        assert_ne!(format!("{cmd_a}"), format!("{cmd_b}"));
    }

    #[tokio::test]
    async fn send_reply_logs_on_dropped_receiver() {
        // If the receiver is dropped, send_reply must not panic.
        let (tx, rx) = tokio::sync::oneshot::channel();
        drop(rx); // Drop the receiver before sending
        send_reply(tx, Ok(())); // Should log a warning, not panic
    }

    #[tokio::test]
    async fn send_reply_delivers_value_when_receiver_alive() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        send_reply(tx, Ok(()));

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
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn conf_connect_variant_constructs_and_displays() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfConnect {
            call_id: 42,
            reply: tx,
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::ConfConnect");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn conf_disconnect_variant_constructs_and_displays() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfDisconnect {
            call_id: 7,
            reply: tx,
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::ConfDisconnect");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn add_audio_source_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let source = Box::new(crate::runtime::audio_worker::MockAsyncAudioSource::new(
            vec![0i16; 160],
        ));
        let cmd = RuntimeCommand::AddAudioSource {
            source,
            reply: tx,
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::AddAudioSource");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn remove_audio_source_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::RemoveAudioSource {
            source_id: 5,
            reply: tx,
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::RemoveAudioSource");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn set_audio_source_gain_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::SetAudioSourceGain {
            source_id: 3,
            gain: 0.75,
            reply: tx,
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::SetAudioSourceGain");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn mute_audio_source_variant_constructs() {
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::MuteAudioSource {
            source_id: 1,
            muted: true,
            reply: tx,
        };
        assert_eq!(format!("{cmd}"), "RuntimeCommand::MuteAudioSource");
    }

    #[test]
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C011
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_conf_connect() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let cmd = RuntimeCommand::ConfConnect {
            call_id: 42,
            reply: tx,
        };
        let dispatch = DispatchCommand::from_runtime_command(cmd);
        match dispatch {
            DispatchCommand::Execute { .. } => {} // expected
            _ => panic!("ConfConnect must map to DispatchCommand::Execute"),
        }
        drop(rx);
    }

    #[test]
    // @verifies C035
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    // @verifies C035
// [::TICKET::] P0-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-6 --for-spec --no-implementation-order`.
    fn from_runtime_command_converts_audio_source_variants() {
        let (tx1, _rx1) = tokio::sync::oneshot::channel();
        let cmd1 = RuntimeCommand::AddAudioSource {
            source: Box::new(crate::runtime::audio_worker::MockAsyncAudioSource::new(vec![0i16; 160])),
            reply: tx1,
        };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd1),
            DispatchCommand::AddAudioSource { .. }
        ));

        let (tx2, _rx2) = tokio::sync::oneshot::channel();
        let cmd2 = RuntimeCommand::RemoveAudioSource { source_id: 1, reply: tx2 };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd2),
            DispatchCommand::Execute { .. }
        ));

        let (tx3, _rx3) = tokio::sync::oneshot::channel();
        let cmd3 = RuntimeCommand::SetAudioSourceGain { source_id: 1, gain: 0.5, reply: tx3 };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd3),
            DispatchCommand::Execute { .. }
        ));

        let (tx4, _rx4) = tokio::sync::oneshot::channel();
        let cmd4 = RuntimeCommand::MuteAudioSource { source_id: 1, muted: true, reply: tx4 };
        assert!(matches!(
            DispatchCommand::from_runtime_command(cmd4),
            DispatchCommand::Execute { .. }
        ));
    }
}
