// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0029:  §20 M20 DtmfSentInfo & Two-Phase Design
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0029 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// ============================================================================
//
// [::TICKET::] P0-5: DtmfSentInfo two-phase design — command acceptance + async completion

// [::TICKET::] P7-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P7-2 --for-spec --no-implementation-order`.
use crate::api::event_model_payload_bus::{
    AccountId, CallId, EventMeta, SipEvent, SipEventPayload,
};
use crate::api::eventbus_receiver::EventBus;

/// Result of a DTMF send attempt.
///
/// Separates synchronous command acceptance (`send_dtmf()` returning `Ok(())`)
/// from asynchronous completion (DtmfSent event). This two-phase design allows
/// callers to confirm the command was queued immediately while receiving the
/// actual send result asynchronously via the EventBus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DtmfSentInfo {
    /// The DTMF method used for sending.
    pub method: DtmfMethod,
    /// The digit that was sent.
    pub digit: char,
    /// Whether the send succeeded or failed.
    pub status: Result<(), SentDtmfError>,
    /// Raw PJSIP error code, if applicable.
    pub pjsip_status: Option<u32>,
}

/// Errors that can occur during DTMF sending.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SentDtmfError {
    /// PJSIP returned an error code.
    PjsipError(u32),
    /// The PJSIP callback did not fire within the timeout window.
    Timeout,
}

/// DTMF transmission method.
///
/// Single definition from `crate::model::dtmf_spec` (§62.15 Q5) — this
/// re-export keeps `crate::api::m20_dtmfsent_twophase::DtmfMethod` working while
/// eliminating the former send-side duplicate enum.
// [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
pub use crate::model::dtmf_spec::DtmfMethod;

/// Default timeout (ms) for DtmfSent fallback when PJSIP callback is unavailable.
pub const DEFAULT_DTMF_SENT_TIMEOUT_MS: u64 = 500;

/// The full description of a DtmfSent fallback timer.
///
/// Bundling the six fields keeps `spawn_dtmf_sent_timeout` under the
/// quality-checker argument-count limit and reads as "spawn this timeout".
pub(crate) struct DtmfSentTimeoutRequest {
    /// The logical call the DtmfSent event refers to.
    pub call_id: CallId,
    /// The owning account (None when the call is not registered yet).
    pub account_id: Option<AccountId>,
    /// The DTMF method used for the send attempt.
    pub method: DtmfMethod,
    /// The digit whose completion is being awaited.
    pub digit: char,
    /// Fallback delay in milliseconds.
    pub timeout_ms: u64,
    /// The EventBus the DtmfSent event is published to.
    pub event_bus: EventBus,
}

/// Spawn a fallback timer that publishes a `DtmfSent { Ok(()) }` event after
/// `timeout_ms` when no PJSIP send-complete callback is available.
///
/// This realises the two-phase design's fallback (§20, §62.15 Q5):
/// `send_dtmf()` returning `Ok(())` confirms the command was accepted, and this
/// timer publishes the async `DtmfSent` event treating the send as complete.
/// The former `Err(Timeout)`-only publication is replaced by completion-as-Ok;
/// `Err(Timeout)` remains a type-level state for the future callback path.
///
/// The returned `JoinHandle` lets the caller cancel the timer if a real
/// callback fires first.
// [::TICKET::] P7-2: O-002 — 500ms timeout fallback for the DtmfSent two-phase design
// [::TICKET::] P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P16-6 --for-spec --no-implementation-order`.
pub(crate) fn spawn_dtmf_sent_timeout(
    request: DtmfSentTimeoutRequest,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(request.timeout_ms)).await;
        request.event_bus.publish(SipEvent {
            meta: EventMeta::new(0, request.account_id, Some(request.call_id)),
            payload: SipEventPayload::DtmfSent(DtmfSentInfo {
                method: request.method,
                digit: request.digit,
                status: Ok(()),
                pjsip_status: None,
            }),
        });
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{AccountId, CallId, SipEventPayload};
    use crate::api::eventbus_receiver::EventBus;

    // ── O-002: DtmfSent 500ms timeout fallback ─────────────────────────

    /// @verifies C030
    /// @verifies C107
    #[tokio::test]
    // [::TICKET::] P7-2: O-002 — deterministic timeout publishes DtmfSent{Ok} after 500ms
    // [::TICKET::] P16-6: §62.15 — the timeout fallback publishes Ok (send treated as complete)
    async fn dtmf_sent_timeout_fallback_publishes_ok() -> Result<(), Box<dyn std::error::Error>> {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let call_id = CallId::from_u64(1)?;
        let account_id = AccountId::from_u64(1)?;

        spawn_dtmf_sent_timeout(DtmfSentTimeoutRequest {
            call_id,
            account_id: Some(account_id),
            method: DtmfMethod::Rfc4733,
            digit: '5',
            timeout_ms: DEFAULT_DTMF_SENT_TIMEOUT_MS,
            event_bus: bus,
        });

        tokio::time::advance(std::time::Duration::from_millis(500)).await;
        let ev = rx.recv().await?;
        assert_eq!(
            ev.meta.call_id,
            Some(call_id),
            "EventMeta must carry the call_id"
        );
        assert_eq!(
            ev.meta.account_id,
            Some(account_id),
            "EventMeta must carry the owning account_id"
        );
        match ev.payload {
            SipEventPayload::DtmfSent(info) => {
                assert_eq!(info.digit, '5');
                assert_eq!(info.method, DtmfMethod::Rfc4733);
                assert!(
                    info.status.is_ok(),
                    "timeout fallback treats the send as complete (§62.15 Q5)"
                );
                assert!(info.pjsip_status.is_none());
            }
            _ => panic!("expected DtmfSent, got {:?}", ev.payload),
        }
        Ok(())
    }

    /// @verifies C030
    #[tokio::test]
    // [::TICKET::] P7-2: O-002 — timeout does not fire before the deadline elapses
    async fn dtmf_sent_timeout_not_before_deadline() -> Result<(), Box<dyn std::error::Error>> {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        spawn_dtmf_sent_timeout(DtmfSentTimeoutRequest {
            call_id: CallId::from_u64(1)?,
            account_id: None,
            method: DtmfMethod::Info,
            digit: '#',
            timeout_ms: DEFAULT_DTMF_SENT_TIMEOUT_MS,
            event_bus: bus,
        });

        // Advance only 100ms — the timeout must not have fired yet.
        tokio::time::advance(std::time::Duration::from_millis(100)).await;
        let result = rx.try_recv();
        assert!(
            matches!(
                result,
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
            ),
            "DtmfSent must not fire before the deadline, got {:?}",
            result
        );
        Ok(())
    }

    // ── DtmfSentInfo Normal ────────────────────────────────────────────

    /// @verifies C030
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_ok_status() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc4733,
            digit: '1',
            status: Ok(()),
            pjsip_status: None,
        };
        assert!(info.status.is_ok());
        assert_eq!(info.digit, '1');
        assert_eq!(info.method, DtmfMethod::Rfc4733);
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_pjsip_error() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Info,
            digit: '5',
            status: Err(SentDtmfError::PjsipError(12345)),
            pjsip_status: Some(12345),
        };
        assert!(info.status.is_err());
        match info.status.unwrap_err() {
            SentDtmfError::PjsipError(code) => assert_eq!(code, 12345),
            _ => panic!("expected PjsipError"),
        }
    }

    /// @verifies C030
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_timeout() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Rfc4733,
            digit: '9',
            status: Err(SentDtmfError::Timeout),
            pjsip_status: None,
        };
        assert!(info.status.is_err());
        match info.status.unwrap_err() {
            SentDtmfError::Timeout => {} // expected
            _ => panic!("expected Timeout"),
        }
    }

    // ── DtmfMethod ─────────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_method_variants() {
        assert_ne!(DtmfMethod::Rfc4733, DtmfMethod::Info);
    }

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_method_debug() {
        let method = DtmfMethod::Rfc4733;
        assert!(!format!("{method:?}").is_empty());
    }

    // ── Default timeout constant ───────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn default_dtmf_timeout_is_500ms() {
        assert_eq!(DEFAULT_DTMF_SENT_TIMEOUT_MS, 500);
    }

    // ── Clone + Debug invariants ───────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5, P11-6, P11-13, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P11-6|P11-13|P12-7) --for-spec --no-implementation-order`.
    fn dtmf_sent_info_is_clone_and_debug() {
        // [::TICKET::] P0-5, P11-6, P11-13, P12-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P11-6|P11-13|P12-7) --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<DtmfSentInfo>();
        assert_clone_debug::<SentDtmfError>();
        assert_clone_debug::<DtmfMethod>();
    }

    // ── Edge: DtmfSentInfo with empty digit ───────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_empty_digit() {
        let info = DtmfSentInfo {
            method: DtmfMethod::Info,
            digit: '\0',
            status: Ok(()),
            pjsip_status: None,
        };
        assert_eq!(info.digit, '\0');
    }

    // ── P11-6: Inband variant, total conversion, abort suppression, identifiers ──

    /// @verifies C029
    #[test]
    // [::TICKET::] P11-6: m20 DtmfMethod gains the Inband variant (C029 3-category set)
    // [::TICKET::] P11-6, P11-13, P12-7, P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-6|P11-13|P12-7|P16-6) --for-spec --no-implementation-order`.
    fn dtmf_method_inband_variant() {
        let inband = DtmfMethod::Inband;
        let info = DtmfMethod::Info;
        let rfc4733 = DtmfMethod::Rfc4733;
        // [::TICKET::] P11-6, P11-13, P12-7, P16-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P11-6|P11-13|P12-7|P16-6) --for-spec --no-implementation-order`.
        fn assert_clone_debug<T: Clone + std::fmt::Debug>() {}
        assert_clone_debug::<DtmfMethod>();
        assert_ne!(inband, rfc4733);
        assert_ne!(inband, info);
    }

    /// @verifies C030
    #[tokio::test]
    // [::TICKET::] P11-6: at-most-once invariant — aborting the returned JoinHandle suppresses publication
    async fn aborting_timeout_handle_suppresses_publication(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        // Keep a sender alive so `try_recv` reports `Empty` rather than `Closed`
        // after the aborted task drops its own bus clone.
        let _keep_alive = bus.clone();

        let timer = spawn_dtmf_sent_timeout(DtmfSentTimeoutRequest {
            call_id: CallId::from_u64(1)?,
            account_id: Some(AccountId::from_u64(1)?),
            method: DtmfMethod::Rfc4733,
            digit: '5',
            timeout_ms: DEFAULT_DTMF_SENT_TIMEOUT_MS,
            event_bus: bus,
        });
        timer.abort();

        // Wait well past the 500ms deadline in real time. An aborted task must be
        // dropped at its next poll and must never publish a DtmfSent event.
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        assert!(
            matches!(
                rx.try_recv(),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
            ),
            "aborted timer must not publish a DtmfSent event"
        );
        Ok(())
    }

    /// @verifies C069
    #[tokio::test]
    // [::TICKET::] P11-6: the published DtmfSent event carries call_id/account_id and the exact method/digit
    async fn dtmf_sent_timeout_event_carries_identifiers() -> Result<(), Box<dyn std::error::Error>>
    {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let call_id = CallId::from_u64(7)?;
        let account_id = AccountId::from_u64(3)?;

        let _timer = spawn_dtmf_sent_timeout(DtmfSentTimeoutRequest {
            call_id,
            account_id: Some(account_id),
            method: DtmfMethod::Rfc4733,
            digit: '#',
            timeout_ms: DEFAULT_DTMF_SENT_TIMEOUT_MS,
            event_bus: bus,
        });

        tokio::time::advance(std::time::Duration::from_millis(500)).await;
        let ev = rx.recv().await?;
        assert_eq!(ev.meta.call_id, Some(call_id));
        assert_eq!(ev.meta.account_id, Some(account_id));
        if let SipEventPayload::DtmfSent(info) = ev.payload {
            assert_eq!(info.method, DtmfMethod::Rfc4733);
            assert_eq!(info.digit, '#');
        } else {
            panic!("expected DtmfSent");
        }
        Ok(())
    }
}
