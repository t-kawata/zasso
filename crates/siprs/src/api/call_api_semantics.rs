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
//   - NODE_ID=N0027:  §19 Call API & Answer Semantics
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0027 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Call control API implementation on `SipClient`.
//!
//! Provides `answer()`, `hangup()`, `hold()`, `unhold()`, `transfer()`,
//! `send_dtmf()`, `call_state()`, and `subscribe_audio()` methods.
//!
//! Each method builds a `RuntimeCommand` variant and dispatches it through
//! the MPSC command channel to the reactor. Until the runtime module (P3-2)
//! is implemented, command dispatch is a no-op placeholder — tests validate
//! command construction only.
//!
//! ## Answer semantics (§19.1)
//!
//! `answer(code)` accepts only {180, 183, 200, 486, 603}. Answering with
//! 180 keeps the call in Ringing state (provisional). 183 allows early media.
//! 200 fully accepts the call. 486/603 decline the call.
//!
//! ## DTMF (§20 / C029)
//!
//! `send_dtmf()` supports three methods per RFC 4733: Inband (audio stream),
//! Info (SIP INFO messages), and Rfc2833 (explicit RFC 4733 events).
//! Digits are validated: non-empty and ≤ 32 characters.

use crate::api::audio_subscribe_bp::{AudioTapHandle, AudioTapMode, HangupReason};
use crate::api::public_api_design::SipClient;
use crate::concurrency_contexts::command_serialization::{ReplySender, RuntimeCommand};
use crate::error::SipError;
use crate::model::audio_format_chunkpair::AudioFormat;
use crate::model::id_design_newtype::CallId;
use crate::state::call_state_model::CallState;

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/// Valid SIP response codes for `answer()`. Per §19.1:
/// 180=Ringing, 183=EarlyMedia, 200=OK, 486=Busy, 603=Decline.
const ANSWER_CODES: &[u16] = &[180, 183, 200, 486, 603];

/// Maximum allowed length of DTMF digit string (RFC 4733).
const DTMF_MAX_LENGTH: usize = 32;

// ---------------------------------------------------------------------------
// SipClient — call control methods
// ---------------------------------------------------------------------------

// [::STUB::] P3-2: All methods in this impl block are dead_code until the runtime
// module (P3-2) provides the CommandSender dispatch. Tests verify construction.
#[allow(dead_code)]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
impl SipClient {
    /// Answers an incoming call with the given SIP response code.
    ///
    /// Acceptable codes: 180 (Ringing keepalive), 183 (Early media),
    /// 200 (Accept), 486 (Busy Here), 603 (Decline).
    ///
    /// Returns `InvalidState` if the call is not in the `Incoming` state.
    /// Returns `InvalidConfig` if the response code is not in `ANSWER_CODES`.
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::InvalidConfig` — response code not in [180, 183, 200, 486, 603]
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    /// - `SipErrorKind::InvalidState` — call is not in `Incoming` state
    // [::STUB::] P3-2: Replace with real RuntimeCommand dispatch to reactor.
    pub(crate) async fn answer(&self, call_id: CallId, code: u16) -> Result<(), SipError> {
        if !ANSWER_CODES.contains(&code) {
            return Err(SipError::invalid_config(format!(
                "invalid answer code {code}, must be one of {ANSWER_CODES:?}"
            )));
        }
        let _cmd = RuntimeCommand::AnswerCall {
            call_id,
            code,
            reply: ReplySender::new(),
        };
        // [::STUB::] P3-2: Send _cmd via CommandSender, await _rx for result.
        Ok(())
    }

    /// Hangs up an active call with the given reason.
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    // [::STUB::] P3-2: Replace with real RuntimeCommand dispatch.
    pub(crate) async fn hangup(&self, call_id: CallId, _reason: HangupReason) -> Result<(), SipError> {

        let _cmd = RuntimeCommand::HangupCall {
            call_id,
            reason: _reason,
            reply: ReplySender::new(),
        };
        Ok(())
    }

    /// Places an active call on hold (media suspended locally).
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    /// - `SipErrorKind::InvalidState` — call is not in `Active` state
    // [::STUB::] P3-2: Replace with real RuntimeCommand dispatch.
    pub(crate) async fn hold(&self, call_id: CallId) -> Result<(), SipError> {

        let _cmd = RuntimeCommand::Hold {
            call_id,
            reply: ReplySender::new(),
        };
        Ok(())
    }

    /// Takes a held call off hold (media resumed).
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    /// - `SipErrorKind::InvalidState` — call is not in `Held` state
    // [::STUB::] P3-2: Replace with real RuntimeCommand dispatch.
    pub(crate) async fn unhold(&self, call_id: CallId) -> Result<(), SipError> {

        let _cmd = RuntimeCommand::Unhold {
            call_id,
            reply: ReplySender::new(),
        };
        Ok(())
    }

    /// Transfers a call to the given target URI (blind transfer via REFER).
    ///
    /// The target must be a valid SIP URI string (e.g., "sip:user@domain").
    /// An empty target returns `InvalidConfig`.
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::InvalidConfig` — target URI is empty
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    // [::STUB::] P3-2: Replace with real RuntimeCommand dispatch.
    pub(crate) async fn transfer(&self, call_id: CallId, target: String) -> Result<(), SipError> {
        if target.is_empty() {
            return Err(SipError::invalid_config("transfer target must not be empty"));
        }

        let _cmd = RuntimeCommand::TransferCall {
            call_id,
            target,
            reply: ReplySender::new(),
        };
        Ok(())
    }

    /// Sends DTMF digits on an active call using the specified method.
    ///
    /// Digits must be non-empty and ≤ 32 characters (RFC 4733).
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::InvalidConfig` — digits empty or exceeds max length
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    // [::STUB::] P3-2: Replace with real RuntimeCommand dispatch.
    pub(crate) async fn send_dtmf(
        &self,
        call_id: CallId,
        digits: String,
        _method: crate::api::m20_dtmfsent_twophase::DtmfMethod,
    ) -> Result<(), SipError> {
        if digits.is_empty() {
            return Err(SipError::invalid_config("DTMF digits must not be empty"));
        }
        if digits.len() > DTMF_MAX_LENGTH {
            return Err(SipError::invalid_config(format!(
                "DTMF digits exceed max length of {DTMF_MAX_LENGTH}"
            )));
        }

        let _cmd = RuntimeCommand::SendDtmf {
            call_id,
            digits,
            method: _method,
            reply: ReplySender::new(),
        };
        Ok(())
    }

    /// Returns the current state of a call.
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    // [::STUB::] P3-2: Replace with real state query from runtime.
    pub(crate) async fn call_state(&self, call_id: CallId) -> Result<CallState, SipError> {

        let _cmd = RuntimeCommand::GetCallState {
            call_id,
            reply: ReplySender::new(),
        };
        // [::STUB::] P3-2: Await _rx for the real CallState.
        Ok(CallState::Disconnected)
    }

    /// Subscribes to audio frames from a call's conference ports.
    ///
    /// Returns an `AudioTapHandle` that receives `AudioChunkPair` frames.
    /// The `mode` parameter controls backpressure policy.
    ///
    /// # Errors
    ///
    /// - `SipErrorKind::CallNotFound` — call_id does not exist
    // [::STUB::] P3-2: Replace with real subscribe dispatch.
    pub(crate) async fn subscribe_audio(
        &self,
        call_id: CallId,
        _format: AudioFormat,
        _capacity: usize,
        _mode: AudioTapMode,
    ) -> Result<AudioTapHandle, SipError> {
        let (_tx, rx) = tokio::sync::mpsc::channel::<crate::model::audio_format_chunkpair::AudioChunkPair>(1);
        let _cmd = RuntimeCommand::SubscribeAudio {
            call_id,
            format: _format,
            capacity: _capacity,
            mode: _mode,
            reply: ReplySender::new(),
        };
        Ok(AudioTapHandle::new(rx))
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::audio_subscribe_bp::AudioTapMode;
    use crate::api::m20_dtmfsent_twophase::DtmfMethod;
    use crate::config::client_config_spec::ClientConfig;
    use crate::error::SipErrorKind;

    /// Helper to create a SipClient for testing.
    async fn test_client() -> SipClient {
        SipClient::new(ClientConfig::default()).await.unwrap()
    }

    /// Helper to create a valid CallId for testing.
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn test_call_id() -> CallId {
        CallId::from_u64(1).unwrap()
    }

    // -----------------------------------------------------------------------
    // ── C028: answer() semantics ───────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C028-postcondition
    #[tokio::test]
    async fn answer_valid_codes_succeed() {
        let client = test_client().await;
        let call_id = test_call_id();
        for code in [180, 183, 200, 486, 603] {
            let result = client.answer(call_id, code).await;
            assert!(result.is_ok(), "answer({code}) should succeed");
        }
    }

    /// @verifies C028-boundary
    #[tokio::test]
    async fn answer_invalid_code_rejected() {
        let client = test_client().await;
        let call_id = test_call_id();
        for code in [0, 100, 404, 700] {
            let err = client.answer(call_id, code).await.unwrap_err();
            assert_eq!(err.kind, SipErrorKind::InvalidConfig,
                "code {code} should produce InvalidConfig");
        }
    }

    /// @verifies C028-invariant
    #[tokio::test]
    async fn answer_rejects_code_zero() {
        let client = test_client().await;
        let call_id = test_call_id();
        let err = client.answer(call_id, 0).await.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
    }

    // -----------------------------------------------------------------------
    // ── C028: hangup() ─────────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C028-postcondition
    #[tokio::test]
    async fn hangup_succeeds() {
        let client = test_client().await;
        let call_id = test_call_id();
        let result = client.hangup(call_id, HangupReason::Normal).await;
        assert!(result.is_ok(), "hangup should succeed");
    }

    /// @verifies C028-postcondition
    #[tokio::test]
    async fn hangup_all_reasons_acceptable() {
        let client = test_client().await;
        let call_id = test_call_id();
        for reason in &[HangupReason::Normal, HangupReason::Busy, HangupReason::Decline,
                        HangupReason::Timeout, HangupReason::InternalError, HangupReason::Rejected] {
            let result = client.hangup(call_id, *reason).await;
            assert!(result.is_ok(), "hangup with {reason:?} should succeed");
        }
    }

    // -----------------------------------------------------------------------
    // ── C028: hold() / unhold() ────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C028-postcondition
    #[tokio::test]
    async fn hold_succeeds() {
        let client = test_client().await;
        let call_id = test_call_id();
        let result = client.hold(call_id).await;
        assert!(result.is_ok(), "hold should succeed");
    }

    /// @verifies C028-postcondition
    #[tokio::test]
    async fn unhold_succeeds() {
        let client = test_client().await;
        let call_id = test_call_id();
        let result = client.unhold(call_id).await;
        assert!(result.is_ok(), "unhold should succeed");
    }

    // -----------------------------------------------------------------------
    // ── C049: transfer() ───────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C049-postcondition
    #[tokio::test]
    async fn transfer_with_valid_target_succeeds() {
        let client = test_client().await;
        let call_id = test_call_id();
        let result = client.transfer(call_id, "sip:alice@example.com".to_string()).await;
        assert!(result.is_ok(), "transfer with valid target should succeed");
    }

    /// @verifies C049-invariant
    #[tokio::test]
    async fn transfer_empty_target_rejected() {
        let client = test_client().await;
        let call_id = test_call_id();
        let err = client.transfer(call_id, String::new()).await.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig,
            "empty target should produce InvalidConfig");
    }

    // -----------------------------------------------------------------------
    // ── C029: send_dtmf() ──────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C029-postcondition
    #[tokio::test]
    async fn send_dtmf_valid_params_succeeds() {
        let client = test_client().await;
        let call_id = test_call_id();
        let result = client.send_dtmf(call_id, "123".to_string(), DtmfMethod::Rfc4733).await;
        assert!(result.is_ok(), "send_dtmf with valid params should succeed");
    }

    /// @verifies C029-postcondition
    #[tokio::test]
    async fn send_dtmf_all_methods_acceptable() {
        let client = test_client().await;
        let call_id = test_call_id();
        for method in &[DtmfMethod::Inband, DtmfMethod::SipInfo, DtmfMethod::Rfc4733] {
            let result = client.send_dtmf(call_id, "1".to_string(), *method).await;
            assert!(result.is_ok(), "send_dtmf with {method:?} should succeed");
        }
    }

    /// @verifies C029-postcondition
    #[tokio::test]
    async fn send_dtmf_empty_digits_rejected() {
        let client = test_client().await;
        let call_id = test_call_id();
        let err = client.send_dtmf(call_id, String::new(), DtmfMethod::Rfc4733).await.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig,
            "empty digits should produce InvalidConfig");
    }

    /// @verifies C029-invariant
    #[tokio::test]
    async fn send_dtmf_exceeds_max_length_rejected() {
        let client = test_client().await;
        let call_id = test_call_id();
        let long_digits = "1".repeat(DTMF_MAX_LENGTH + 1);
        let err = client.send_dtmf(call_id, long_digits, DtmfMethod::Rfc4733).await.unwrap_err();
        assert_eq!(err.kind, SipErrorKind::InvalidConfig,
            "excessive digits should produce InvalidConfig");
    }

    // -----------------------------------------------------------------------
    // ── C028: call_state() ─────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C028-postcondition
    #[tokio::test]
    async fn call_state_returns_state() {
        let client = test_client().await;
        let call_id = test_call_id();
        let state = client.call_state(call_id).await.unwrap();
        // Currently returns Disconnected as placeholder (P3-2)
        assert_eq!(state, CallState::Disconnected);
    }

    // -----------------------------------------------------------------------
    // ── C032: subscribe_audio() ────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C032-postcondition
    #[tokio::test]
    async fn subscribe_audio_returns_handle() {
        let client = test_client().await;
        let call_id = test_call_id();
        let format = AudioFormat::new(
            crate::model::audio_format_chunkpair::SampleRate::Hz48000,
            crate::model::audio_format_chunkpair::BitDepth::I16,
            crate::model::audio_format_chunkpair::ChannelLayout::Mono,
            20,
        ).unwrap();
        let handle = client.subscribe_audio(call_id, format, 64, AudioTapMode::Realtime).await;
        assert!(handle.is_ok(), "subscribe_audio should return Ok");
    }

    /// @verifies C032-postcondition
    #[tokio::test]
    async fn subscribe_audio_lossless_mode_returns_handle() {
        let client = test_client().await;
        let call_id = test_call_id();
        let format = AudioFormat::new(
            crate::model::audio_format_chunkpair::SampleRate::Hz48000,
            crate::model::audio_format_chunkpair::BitDepth::I16,
            crate::model::audio_format_chunkpair::ChannelLayout::Mono,
            20,
        ).unwrap();
        let handle = client.subscribe_audio(call_id, format, 256, AudioTapMode::Lossless).await;
        assert!(handle.is_ok(), "subscribe_audio with Lossless mode should succeed");
    }
}
