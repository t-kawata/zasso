// [::TICKET::] P0-3: SipCall type placeholder.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-3 --for-spec --no-implementation-order`.

// [::TICKET::] P9-3: SipCall lifecycle and fields — private typed fields,
// accessors, and the RFC §19 lifecycle methods (answer, hangup, hold, unhold,
// transfer, send_dtmf, call_state). Details:
// `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.

use crate::api::call_api_semantics::{
    validate_dtmf_digits, validate_dtmf_send_method, CallApiSemantics,
};
use crate::config::account_config_spec::{DtmfMethod, DtmfPolicy};
use crate::error::SipError;
use crate::model::{AccountId, CallId};
use crate::state::call_state_model::CallState;
use crate::state::m20_callstate_mapping::CallMediaState;

/// Reason a call session ended.
///
/// Passed to `SipCall::hangup` as metadata; the value does not change the
/// state-machine outcome (any non-terminal state may be hung up per RFC §18).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HangupReason {
    /// The local user ended the call.
    LocalUser,
    /// The remote party ended the call.
    RemoteHangup,
    /// The call failed due to a network error.
    NetworkFailure,
    /// The remote party is busy (486 Busy Here).
    Busy,
    /// The remote party declined (603 Decline).
    Declined,
    /// The call ended as part of a transfer.
    Transfer,
}

/// A single SIP call session.
///
/// Each `SipCall` tracks the call signalling state, media state, and owning
/// account. It is created by `SipClient::make_call()`; incoming calls are
/// delivered as `SipEventPayload::IncomingCall` and answered via
/// `SipClient::answer()`. Exposes the RFC §19 lifecycle operations.
///
/// The fields are private and only mutated through the lifecycle methods, so
/// illegal call states cannot be represented externally (C028 invariant).
#[derive(Debug, Clone)]
pub struct SipCall {
    /// The runtime call identifier.
    call_id: CallId,
    /// The account this call belongs to.
    account_id: AccountId,
    /// The current signalling state (RFC §18).
    state: CallState,
    /// The current media state.
    media_state: CallMediaState,
    /// The blind-transfer target recorded by `transfer()` (C049).
    transfer_target: Option<String>,
    /// The account DTMF policy, applied by `send_dtmf` when present.
    dtmf_policy: Option<DtmfPolicy>,
}

// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
// [::TICKET::] P16-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-5 --for-spec --no-implementation-order`.
impl SipCall {
    /// Create a new call session.
    ///
    /// The DTMF policy is absent by default (no policy restriction); attach it
    /// with `with_dtmf_policy` when the account configuration is available.
    pub fn new(
        account_id: AccountId,
        call_id: CallId,
        state: CallState,
        media_state: CallMediaState,
    ) -> Self {
        Self {
            call_id,
            account_id,
            state,
            media_state,
            transfer_target: None,
            dtmf_policy: None,
        }
    }

    /// Return the runtime call identifier.
    pub fn id(&self) -> CallId {
        self.call_id
    }

    /// Return the account this call belongs to.
    pub fn account_id(&self) -> AccountId {
        self.account_id
    }

    /// Return the current signalling state.
    pub fn state(&self) -> CallState {
        self.state
    }

    /// Return the current media state.
    pub fn media_state(&self) -> CallMediaState {
        self.media_state
    }

    /// Return the blind-transfer target recorded by `transfer()`, if any.
    pub fn transfer_target(&self) -> Option<&str> {
        self.transfer_target.as_deref()
    }

    /// Attach the account DTMF policy used by `send_dtmf`.
    pub fn with_dtmf_policy(mut self, policy: DtmfPolicy) -> Self {
        self.dtmf_policy = Some(policy);
        self
    }

    /// Validate a state transition against the RFC §18 transition table and
    /// apply it, or yield `SipErrorKind::InvalidState` without any side effect.
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn apply_transition(&mut self, target: CallState) -> Result<(), SipError> {
        self.state = self
            .state
            .transition(target)
            .map_err(|err| SipError::invalid_state(format!("illegal call transition: {err}")))?;
        Ok(())
    }
}

/// Lowest provisional answer code (RFC §19.1).
const ANSWER_PROVISIONAL_MIN: u16 = 100;
/// Highest provisional answer code (RFC §19.1).
const ANSWER_PROVISIONAL_MAX: u16 = 199;
/// Final accept code (RFC §19.1).
const ANSWER_OK: u16 = 200;

/// Acceptable answer codes per RFC §19.1: provisional 100-199 and the final
/// accept 200. Rejection codes (486/603) are not answers.
// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
fn is_valid_answer_code(code: u16) -> bool {
    matches!(
        code,
        ANSWER_PROVISIONAL_MIN..=ANSWER_PROVISIONAL_MAX | ANSWER_OK
    )
}

// [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
impl CallApiSemantics for SipCall {
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn answer(&mut self, code: u16) -> Result<(), SipError> {
        if !is_valid_answer_code(code) {
            return Err(SipError::invalid_state(format!(
                "invalid answer code: {code}"
            )));
        }
        // RFC §18: Incoming → Connecting is the only legal edge from Incoming,
        // so the transition-table guard enforces the "answer only for incoming
        // calls" invariant (C028).
        self.apply_transition(CallState::Connecting)
    }

    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hangup(&mut self, _reason: HangupReason) -> Result<(), SipError> {
        if self.state.is_terminal() {
            return Err(SipError::invalid_state("cannot hang up a terminal call"));
        }
        self.apply_transition(CallState::Disconnecting)
    }

    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hold(&mut self) -> Result<(), SipError> {
        self.apply_transition(CallState::Held)
    }

    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn unhold(&mut self) -> Result<(), SipError> {
        self.apply_transition(CallState::Active)
    }

    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn transfer(&mut self, target: String) -> Result<(), SipError> {
        self.apply_transition(CallState::Transferring)?;
        self.transfer_target = Some(target);
        Ok(())
    }

    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn send_dtmf(&mut self, digits: &str, method: DtmfMethod) -> Result<(), SipError> {
        if self.state != CallState::Active {
            return Err(SipError::invalid_state(
                "send_dtmf is only valid for active calls",
            ));
        }
        validate_dtmf_digits(digits)?;
        if let Some(ref policy) = self.dtmf_policy {
            validate_dtmf_send_method(method, policy)?;
        }
        Ok(())
    }

    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn call_state(&self) -> CallState {
        self.state
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::SipErrorKind;

    /// Build a call fixture in the given signalling state.
    ///
    /// `media_state` is fixed to `Active` so that lifecycle tests focus on the
    /// signalling-state machine (RFC §18) rather than the media state.
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn sip_call(state: CallState) -> Result<SipCall, Box<dyn std::error::Error>> {
        Ok(SipCall::new(
            AccountId::from_u64(1)?,
            CallId::from_u64(1)?,
            state,
            CallMediaState::Active,
        ))
    }

    // ── C028 Precondition — call states defined, constructor + accessors ──

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn constructs_with_defined_call_state() -> Result<(), Box<dyn std::error::Error>> {
        let account_id = AccountId::from_u64(1)?;
        let call_id = CallId::from_u64(1)?;
        let call = SipCall::new(
            account_id,
            call_id,
            CallState::Incoming,
            CallMediaState::Active,
        );
        assert_eq!(call.id(), call_id);
        assert_eq!(call.account_id(), account_id);
        assert_eq!(call.state(), CallState::Incoming);
        assert_eq!(call.media_state(), CallMediaState::Active);
        Ok(())
    }

    // ── C028 Postcondition — answer semantics ──────────────────────────

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn answer_transitions_incoming_to_connecting() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Incoming)?;
        assert!(call.answer(200).is_ok());
        assert_eq!(call.state(), CallState::Connecting);

        let mut call183 = sip_call(CallState::Incoming)?;
        assert!(call183.answer(183).is_ok());
        assert_eq!(call183.state(), CallState::Connecting);
        Ok(())
    }

    // ── C028 Postcondition — hangup / hold / unhold / transfer / call_state ──

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn lifecycle_operations_transition_state() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;

        assert!(call.hold().is_ok());
        assert_eq!(call.state(), CallState::Held);

        assert!(call.unhold().is_ok());
        assert_eq!(call.state(), CallState::Active);

        assert!(call.transfer("sip:bob@example.com".to_string()).is_ok());
        assert_eq!(call.state(), CallState::Transferring);

        assert!(call.hangup(HangupReason::LocalUser).is_ok());
        assert_eq!(call.state(), CallState::Disconnecting);
        assert_eq!(call.call_state(), CallState::Disconnecting);
        Ok(())
    }

    // ── C028 Invariant — answer only valid for incoming ────────────────

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn answer_rejects_non_incoming_state() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;
        let err = call.answer(200).expect_err("answer on Active must fail");
        assert_eq!(err.kind, SipErrorKind::InvalidState);
        // No side effect on error — state is unchanged.
        assert_eq!(call.state(), CallState::Active);
        Ok(())
    }

    // ── C028 — no panic on illegal state; terminal states are absorbing ──

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn terminal_state_rejects_all_operations() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Disconnected)?;
        assert_eq!(
            call.hangup(HangupReason::LocalUser)
                .expect_err("hangup on terminal must fail")
                .kind,
            SipErrorKind::InvalidState
        );
        assert_eq!(
            call.hold().expect_err("hold on terminal must fail").kind,
            SipErrorKind::InvalidState
        );
        assert_eq!(
            call.transfer("sip:x@example.com".to_string())
                .expect_err("transfer on terminal must fail")
                .kind,
            SipErrorKind::InvalidState
        );
        assert_eq!(call.state(), CallState::Disconnected);
        Ok(())
    }

    // ── C028 — hold/unhold only valid in the correct state ────────────

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hold_on_non_active_returns_invalid_state() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::New)?;
        assert_eq!(
            call.hold().expect_err("hold on New must fail").kind,
            SipErrorKind::InvalidState
        );

        let mut active = sip_call(CallState::Active)?;
        assert_eq!(
            active
                .unhold()
                .expect_err("unhold on a non-Held call is an error")
                .kind,
            SipErrorKind::InvalidState
        );
        Ok(())
    }

    // ── C028 Boundary — answer code range ──────────────────────────────

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn answer_code_boundary() -> Result<(), Box<dyn std::error::Error>> {
        // Provisional 100..=199 and final 200 are accepted.
        for code in [100u16, 183, 199, 200] {
            let mut call = sip_call(CallState::Incoming)?;
            assert!(call.answer(code).is_ok(), "code {code} must be accepted");
            assert_eq!(call.state(), CallState::Connecting);
        }
        // Non-answer codes (rejections and invalid ranges) are rejected.
        for code in [99u16, 300, 486, 603, 700] {
            let mut call = sip_call(CallState::Incoming)?;
            assert!(call.answer(code).is_err(), "code {code} must be rejected");
            assert_eq!(call.state(), CallState::Incoming);
        }
        Ok(())
    }

    // ── C028 Boundary — DTMF digits: single and long, valid alphabet only ──

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn send_dtmf_single_and_long_digits() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;
        assert!(call.send_dtmf("1", DtmfMethod::Rfc4733).is_ok());
        assert!(call
            .send_dtmf("1234567890*#ABCD", DtmfMethod::Rfc4733)
            .is_ok());
        // Lowercase letters are normalised/accepted.
        assert!(call.send_dtmf("abcd", DtmfMethod::Info).is_ok());
        // Characters outside the DTMF alphabet are rejected.
        assert_eq!(
            call.send_dtmf("1x", DtmfMethod::Rfc4733)
                .expect_err("non-DTMF char must fail")
                .kind,
            SipErrorKind::InvalidArgument
        );
        Ok(())
    }

    // ── C028 — send_dtmf validates digits and DtmfPolicy ───────────────

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn send_dtmf_validates_digits_and_policy() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;
        assert!(call.send_dtmf("123#", DtmfMethod::Rfc4733).is_ok());

        assert_eq!(
            call.send_dtmf("", DtmfMethod::Rfc4733)
                .expect_err("empty digits must fail")
                .kind,
            SipErrorKind::InvalidArgument
        );

        // A restrictive account policy rejects a method outside send_methods.
        let mut restricted = call.clone().with_dtmf_policy(DtmfPolicy {
            send_methods: vec![DtmfMethod::Info],
            receive_methods: vec![DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Info,
        });
        assert_eq!(
            restricted
                .send_dtmf("1", DtmfMethod::Rfc4733)
                .expect_err("method outside policy must fail")
                .kind,
            SipErrorKind::InvalidArgument
        );
        Ok(())
    }

    // ── C049 Postcondition — blind transfer ─────────────────────────────

    /// @verifies C049
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn blind_transfer_records_target() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;
        assert!(call.transfer("sip:carol@example.com".to_string()).is_ok());
        assert_eq!(call.state(), CallState::Transferring);
        assert_eq!(call.transfer_target(), Some("sip:carol@example.com"));
        Ok(())
    }

    // ── C049 Invariant — transfer target is read-only externally ───────

    /// @verifies C049
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn transfer_target_is_immutable_externally() -> Result<(), Box<dyn std::error::Error>> {
        let mut call = sip_call(CallState::Active)?;
        call.transfer("sip:carol@example.com".to_string())?;
        // No setter exists — the target is only readable via transfer_target().
        assert_eq!(call.transfer_target(), Some("sip:carol@example.com"));
        let _ = call.clone();
        Ok(())
    }

    // ── C028 Invariant — compile-time trait bounds ──────────────────────

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn sip_call_is_clone_debug_send_sync() -> Result<(), Box<dyn std::error::Error>> {
        // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
        fn assert_traits<T: Clone + std::fmt::Debug + Send + Sync>() {}
        assert_traits::<SipCall>();
        assert_traits::<HangupReason>();
        Ok(())
    }

    /// @verifies C028
    #[test]
    // [::TICKET::] P9-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-3 --for-spec --no-implementation-order`.
    fn hangup_reason_variants_are_distinct() -> Result<(), Box<dyn std::error::Error>> {
        assert_ne!(HangupReason::LocalUser, HangupReason::RemoteHangup);
        assert_ne!(HangupReason::NetworkFailure, HangupReason::Transfer);
        assert_ne!(HangupReason::Busy, HangupReason::Declined);
        let _ = format!("{:?}", HangupReason::LocalUser);
        Ok(())
    }
}
