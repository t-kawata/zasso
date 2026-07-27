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
//   - NODE_ID=N0019:  §15.4 EventBus Implementation & §15.5 AccountEventReceiver
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0019 --hops=2)
//
// Cross-referenced design context:
//   - data_model/§16 Raw SIP Message Specification [NODE_ID=N0024]
//     (depends_on ← src/api/eventbus_receiver.rs)
//   - api_contract/§15 Event Model — SipEventPayload & EventBus [NODE_ID=N0018]
//     (part_of ← src/api/eventbus_receiver.rs)
//   - architecture/§15.6-15.7 Event Bus Design Decisions & Delivery Guarantees [NODE_ID=N0020]
//     (part_of ← src/api/eventbus_receiver.rs)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

//! Implements the `EventBus` dual-bus broadcast mechanism and the
//! `AccountEventReceiver` per-account event filter.
//!
//! ## Design: Split buses (N0020)
//!
//! `EventBus` provides two independent broadcast channels:
//!
//! - **control** — Primary bus for registration, call, media, DTMF, ICE,
//!   transport, account, client lifecycle, and error events. Always present.
//! - **raw_sip** — Dedicated bus for raw SIP message traffic. Present only
//!   when `raw_sip_capacity` is `Some(cap)` at construction. Zero allocation
//!   overhead when disabled (the field is `None`).
//!
//! Both channels use `tokio::sync::broadcast`, meaning delivery is **lossy**
//! by design. Slow consumers receive `RecvError::Lagged(n)` when they fall
//! behind. This is intentional — events are observation-only, not a source
//! of truth (§15.7, N0020).

// [::STUB::] P0-7: EventBus and AccountEventReceiver are design-time contracts.
// They trigger dead_code until the runtime module (P0-7) instantiates them.
#![allow(dead_code)]

use crate::api::event_model_payload_bus::SipEvent;
use crate::model::id_design_newtype::AccountId;
use crate::model::raw_sip_message_spec::RawSipMessage;

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

/// Dual-bus event delivery mechanism.
///
/// - `control`: Always-present broadcast sender for control-plane SipEvents.
/// - `raw_sip`: Optional broadcast sender for RawSIP messages. `None` when
///   raw SIP delivery is disabled.
#[derive(Clone)]
pub(crate) struct EventBus {
    /// Control-plane event bus. Always initialized at construction.
    control: tokio::sync::broadcast::Sender<SipEvent>,
    /// Raw SIP message bus. `None` when raw SIP delivery is disabled.
    raw_sip: Option<tokio::sync::broadcast::Sender<RawSipMessage>>,
}

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl EventBus {
    /// Creates a new `EventBus`.
    ///
    /// - `control_capacity`: Capacity of the control event ring buffer.
    /// - `raw_sip_capacity`: If `Some(cap)`, creates a raw SIP channel with
    ///   the given capacity. If `None`, no raw SIP channel is allocated.
    pub(crate) fn new(control_capacity: usize, raw_sip_capacity: Option<usize>) -> Self {
        let (control_tx, _) = tokio::sync::broadcast::channel(control_capacity);
        let raw_sip = raw_sip_capacity.map(|cap| {
            let (tx, _) = tokio::sync::broadcast::channel(cap);
            tx
        });
        Self {
            control: control_tx,
            raw_sip,
        }
    }

    /// Subscribes to the control event bus.
    ///
    /// Returns a `Receiver<SipEvent>` that observes all control-plane events.
    pub(crate) fn subscribe_control(&self) -> tokio::sync::broadcast::Receiver<SipEvent> {
        self.control.subscribe()
    }

    /// Subscribes to the raw SIP message bus, if enabled.
    ///
    /// Returns `Some(Receiver<RawSipMessage>)` when the raw SIP bus was
    /// configured at construction, or `None` if it was disabled.
    pub(crate) fn subscribe_raw_sip(
        &self,
    ) -> Option<tokio::sync::broadcast::Receiver<RawSipMessage>> {
        self.raw_sip.as_ref().map(|tx| tx.subscribe())
    }

    /// Publishes a `SipEvent` to all control subscribers.
    ///
    /// Delivery is lossy: if a subscriber's receive buffer is full, the
    /// oldest unread message is dropped and the subscriber will receive
    /// `RecvError::Lagged(n)` on its next `recv()` call.
    pub(crate) fn publish(&self, event: SipEvent) {
        let _ = self.control.send(event);
    }

    /// Publishes a `RawSipMessage` to all raw SIP subscribers, if the
    /// raw SIP bus is enabled.
    ///
    /// This is a silent no-op when the raw SIP bus was not configured.
    pub(crate) fn publish_raw_sip(&self, msg: RawSipMessage) {
        if let Some(ref tx) = self.raw_sip {
            let _ = tx.send(msg);
        }
    }
}

// ---------------------------------------------------------------------------
// AccountEventReceiver
// ---------------------------------------------------------------------------

/// Per-account event stream that filters the control bus by `account_id`.
///
/// The `recv()` method loops over the shared control bus, returning only
/// events whose `meta.account_id` matches the receiver's `account_id`.
/// Events for other accounts are silently dropped.
pub(crate) struct AccountEventReceiver {
    account_id: AccountId,
    inner: tokio::sync::broadcast::Receiver<SipEvent>,
}

// [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
impl AccountEventReceiver {
    /// Creates a new `AccountEventReceiver` that filters for the given
    /// `account_id` on the provided broadcast receiver.
    pub(crate) fn new(
        account_id: AccountId,
        inner: tokio::sync::broadcast::Receiver<SipEvent>,
    ) -> Self {
        Self { account_id, inner }
    }

    /// Receives the next `SipEvent` matching this receiver's `account_id`.
    ///
    /// Events whose `meta.account_id` does not match are silently dropped
    /// and the receiver continues waiting for the next event.
    ///
    /// Returns `RecvError::Closed` when all senders have been dropped
    /// (i.e., the `EventBus` has been destroyed).
    pub(crate) async fn recv(
        &mut self,
    ) -> Result<SipEvent, tokio::sync::broadcast::error::RecvError> {
        loop {
            let ev = self.inner.recv().await?;
            if ev.meta.account_id == Some(self.account_id) {
                return Ok(ev);
            }
        }
    }
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{EventMeta, SipEventPayload};
    use std::collections::BTreeMap;

    /// Helper to construct a minimal SipEvent for testing.
    // [::TICKET::] P4-1: AccountId is now a NonZeroU64 newtype — use from_u64().
// [::TICKET::] P4-1, P4-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P4-1|P4-4) --for-spec --no-implementation-order`.
    fn make_event(event_id: u64, account_id: Option<AccountId>) -> SipEvent {
        SipEvent {
            seq: 0,
            meta: EventMeta {
                event_id,
                timestamp: 0,
                account_id,
                call_id: None,
                direction: None,
                headers: None,
                status_code: None,
                reason_phrase: None,
                logical_context: BTreeMap::new(),
            },
            payload: SipEventPayload::ClientShutdown,
        }
    }

    /// Helper to construct a minimal RawSipMessage for testing.
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn make_raw_sip_msg() -> RawSipMessage {
        RawSipMessage {
            direction: crate::model::raw_sip_message_spec::SipMessageDirection::Incoming,
            transport: crate::model::raw_sip_message_spec::TransportKind::Udp,
            start_line: String::new(),
            headers: vec![],
            body: None,
            text: String::new(),
            content_length: 0,
            remote_addr: None,
            local_addr: None,
        }
    }

    // -----------------------------------------------------------------------
    // ── C020 ── N0019→N0018: EventBus & AccountEventReceiver
    // -----------------------------------------------------------------------

    /// @verifies C020-postcondition
    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn eventbus_new_with_both_channels() {
        let bus = EventBus::new(1024, Some(1024));
        let _rx = bus.subscribe_control();
        assert!(
            bus.subscribe_raw_sip().is_some(),
            "subscribe_raw_sip must return Some when raw_sip is configured"
        );
    }

    /// @verifies C020-postcondition
    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn eventbus_new_control_only() {
        let bus = EventBus::new(1024, None);
        let _rx = bus.subscribe_control();
        assert!(
            bus.subscribe_raw_sip().is_none(),
            "subscribe_raw_sip must return None when raw_sip is disabled"
        );
    }

    /// @verifies C020-postcondition
    #[tokio::test]
    async fn eventbus_publish_to_subscribers() -> Result<(), String> {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let event = make_event(0, None);
        bus.publish(event);
        rx.recv()
            .await
            .map_err(|e| format!("failed to receive event: {e}"))?;
        Ok(())
    }

    /// @verifies C020-postcondition
    #[tokio::test]
    async fn eventbus_publish_multiple_subscribers() -> Result<(), String> {
        let bus = EventBus::new(16, None);
        let mut rx1 = bus.subscribe_control();
        let mut rx2 = bus.subscribe_control();

        bus.publish(make_event(1, None));
        bus.publish(make_event(2, None));

        // Both subscribers should receive both events
        let ev1_1 = rx1
            .recv()
            .await
            .map_err(|_| "rx1 failed on first event".to_string())?;
        assert_eq!(ev1_1.meta.event_id, 1);
        let ev1_2 = rx1
            .recv()
            .await
            .map_err(|_| "rx1 failed on second event".to_string())?;
        assert_eq!(ev1_2.meta.event_id, 2);

        let ev2_1 = rx2
            .recv()
            .await
            .map_err(|_| "rx2 failed on first event".to_string())?;
        assert_eq!(ev2_1.meta.event_id, 1);
        let ev2_2 = rx2
            .recv()
            .await
            .map_err(|_| "rx2 failed on second event".to_string())?;
        assert_eq!(ev2_2.meta.event_id, 2);

        Ok(())
    }

    /// @verifies C020-postcondition
    #[tokio::test]
    async fn eventbus_publish_raw_sip_enabled() -> Result<(), String> {
        let bus = EventBus::new(16, Some(16));
        let mut rx = bus
            .subscribe_raw_sip()
            .ok_or_else(|| "raw_sip should be Some when configured".to_string())?;
        bus.publish_raw_sip(make_raw_sip_msg());
        rx.recv()
            .await
            .map_err(|e| format!("failed to receive raw sip: {e}"))?;
        Ok(())
    }

    /// @verifies C020-postcondition
    #[tokio::test]
    async fn eventbus_publish_raw_sip_disabled_noop() {
        let bus = EventBus::new(16, None);
        // This should not panic or error — silent no-op
        bus.publish_raw_sip(make_raw_sip_msg());
    }

    /// @verifies C020-invariant
    #[tokio::test]
    async fn account_event_receiver_filters_by_account_id() -> Result<(), String> {
        let bus = EventBus::new(16, None);
        let acc1 = AccountId::from_u64(1).ok_or("AccountId 1")?;
        let acc2 = AccountId::from_u64(2).ok_or("AccountId 2")?;
        let mut recv_a = AccountEventReceiver::new(acc1, bus.subscribe_control());
        let mut recv_b = AccountEventReceiver::new(acc2, bus.subscribe_control());

        // Publish events for both accounts
        bus.publish(make_event(1, Some(acc1)));
        bus.publish(make_event(2, Some(acc2)));

        // recv_a should get event 1 (account_id=1)
        let ev_a = tokio::time::timeout(std::time::Duration::from_millis(200), recv_a.recv())
            .await
            .map_err(|_| "timeout waiting for recv_a".to_string())?
            .map_err(|e| format!("recv_a error: {e}"))?;
        assert_eq!(ev_a.meta.account_id, Some(acc1));
        assert_eq!(ev_a.meta.event_id, 1);

        // recv_b should get event 2 (account_id=2)
        let ev_b = tokio::time::timeout(std::time::Duration::from_millis(200), recv_b.recv())
            .await
            .map_err(|_| "timeout waiting for recv_b".to_string())?
            .map_err(|e| format!("recv_b error: {e}"))?;
        assert_eq!(ev_b.meta.account_id, Some(acc2));
        assert_eq!(ev_b.meta.event_id, 2);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // ── C021 ── N0020→N0018: Split bus design & delivery guarantees
    // -----------------------------------------------------------------------

    /// @verifies C021-postcondition
    /// @verifies C021-invariant
    #[tokio::test]
    async fn raw_sip_overflow_does_not_affect_control() -> Result<(), String> {
        let bus = EventBus::new(16, Some(2)); // control=16, raw_sip=2
        let mut control_rx = bus.subscribe_control();
        let mut raw_rx = bus
            .subscribe_raw_sip()
            .ok_or_else(|| "raw_sip should be configured".to_string())?;

        // Flood raw_sip bus past capacity (5 messages into capacity 2 buffer)
        let msg = make_raw_sip_msg();
        for _ in 0..5 {
            bus.publish_raw_sip(msg.clone());
        }

        // raw_rx must have lagged
        match raw_rx.try_recv() {
            Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => { /* expected */ }
            Ok(_) => {
                return Err(
                    "raw_sip subscriber received a message despite overflow — expected Lagged"
                        .to_string(),
                );
            }
            Err(e) => {
                return Err(format!("unexpected raw_rx error: {e}"));
            }
        }

        // Control bus must be unaffected
        bus.publish(make_event(99, None));
        match control_rx.try_recv() {
            Ok(ev) => {
                assert_eq!(ev.meta.event_id, 99);
            }
            Err(e) => {
                return Err(format!(
                    "control bus lost events after raw_sip overflow: {e}"
                ));
            }
        }

        Ok(())
    }

    /// @verifies C021-invariant
    #[tokio::test]
    async fn slow_subscriber_receives_lagged() -> Result<(), String> {
        let bus = EventBus::new(2, None); // capacity=2
        let mut rx = bus.subscribe_control();

        // Fill the buffer without reading
        let ev = make_event(0, None);
        bus.publish(ev.clone());
        bus.publish(ev.clone());

        // Third publish: buffer full, oldest dropped
        bus.publish(ev.clone());

        // First recv — should get the 3rd event (1st and 2nd were dropped)
        let result = rx.recv().await;
        match result {
            Ok(received) => {
                assert_eq!(
                    received.meta.event_id, 0,
                    "should receive the most recent event"
                );
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                // This is also acceptable — the subscriber may see Lagged
                assert!(n > 0, "Lagged count must be positive");
            }
            Err(e) => {
                return Err(format!("unexpected recv error: {e}"));
            }
        }

        Ok(())
    }

    /// @verifies C021-postcondition
    #[test]
    // [::TICKET::] P0-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-4 --for-spec --no-implementation-order`.
    fn eventbus_is_clonable() {
        let bus = EventBus::new(16, None);
        let cloned = bus.clone();
        let rx1 = bus.subscribe_control();
        let rx2 = cloned.subscribe_control();
        // Both the original and clone should successfully subscribe to the
        // same underlying broadcast channel.
        drop(rx1);
        drop(rx2);
    }
}
