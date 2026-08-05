
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
use crate::api::event_model_payload_bus::{CallId, EventMeta, SipEvent, SipEventPayload};
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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfMethod {
    /// RFC 2833 / RFC 4733 out-of-band DTMF (RTP event).
    Rfc4733,
    /// SIP INFO in-band DTMF.
    Info,
}

/// Default timeout (ms) for DtmfSent fallback when PJSIP callback is unavailable.
pub const DEFAULT_DTMF_SENT_TIMEOUT_MS: u64 = 500;

/// Spawn a fallback timer that publishes a `DtmfSent { Err(Timeout) }` event
/// after `timeout_ms` when the PJSIP send-complete callback does not arrive.
///
/// This realises the two-phase design's fallback: `send_dtmf()` returning
/// `Ok(())` confirms the command was accepted, and this timer guarantees the
/// async `DtmfSent` event is eventually published even when PJSIP never fires
/// the completion callback.
///
/// The returned `JoinHandle` lets the caller cancel the timer if the real
/// callback fires first.
// [::TICKET::] P7-2: O-002 — 500ms timeout fallback for the DtmfSent two-phase design
// [::STUB::] P5-2: spawn_dtmf_sent_timeout is not yet invoked; the reactor does not yet own an EventBus -- Wire spawn_dtmf_sent_timeout into the reactor SendDtmf handler and implement the two-phase DTMF-sent timeout once the reactor owns an EventBus
#[allow(dead_code)]
pub(crate) fn spawn_dtmf_sent_timeout(
    call_id: CallId,
    method: DtmfMethod,
    digit: char,
    timeout_ms: u64,
    event_bus: EventBus,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(timeout_ms)).await;
        event_bus.publish(SipEvent {
            meta: EventMeta::new(0, None, Some(call_id)),
            payload: SipEventPayload::DtmfSent(DtmfSentInfo {
                method,
                digit,
                status: Err(SentDtmfError::Timeout),
                pjsip_status: None,
            }),
        });
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{CallId, SipEventPayload};
    use crate::api::eventbus_receiver::EventBus;

    // ── O-002: DtmfSent 500ms timeout fallback ─────────────────────────

    /// @verifies C030
    #[tokio::test]
    // [::TICKET::] P7-2: O-002 — deterministic timeout publishes DtmfSent{Err(Timeout)} after 500ms
    async fn dtmf_sent_timeout_fallback_publishes_timeout() {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        spawn_dtmf_sent_timeout(
            CallId::from_u64(1).unwrap(),
            DtmfMethod::Rfc4733,
            '5',
            DEFAULT_DTMF_SENT_TIMEOUT_MS,
            bus,
        );

        tokio::time::advance(std::time::Duration::from_millis(500)).await;
        let ev = rx.recv().await.unwrap();
        match ev.payload {
            SipEventPayload::DtmfSent(info) => {
                assert_eq!(info.digit, '5');
                assert!(matches!(info.status, Err(SentDtmfError::Timeout)));
                assert!(info.pjsip_status.is_none());
            }
            _ => panic!("expected DtmfSent, got {:?}", ev.payload),
        }
    }

    /// @verifies C030
    #[tokio::test]
    // [::TICKET::] P7-2: O-002 — timeout does not fire before the deadline elapses
    async fn dtmf_sent_timeout_not_before_deadline() {
        tokio::time::pause();
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();

        spawn_dtmf_sent_timeout(
            CallId::from_u64(1).unwrap(),
            DtmfMethod::Info,
            '#',
            DEFAULT_DTMF_SENT_TIMEOUT_MS,
            bus,
        );

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
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn dtmf_sent_info_is_clone_and_debug() {
        // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
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
}
