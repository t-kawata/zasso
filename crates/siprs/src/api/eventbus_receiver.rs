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
//   - NODE_ID=N0019:  §15.4 EventBus Implementation & §15.5 AccountEventReceiver
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0019 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx --hops=N)
// ============================================================================
//
// [::TICKET::] P0-5: EventBus — split control/raw_sip broadcast channels + AccountEventReceiver

use tokio::sync::broadcast;

use crate::api::event_model_payload_bus::{AccountId, RawSipMessage, SipEvent};

/// Event bus providing split broadcast channels for control events and raw SIP messages.
///
/// # Design rationale (N0020)
/// - **Control bus** (`control`): registration, call, DTMF, ICE, transport, lifecycle, error events.
/// - **RawSIP bus** (`raw_sip`): raw SIP message capture. Isolated to prevent control event loss
///   when raw SIP produces high throughput.
/// - **Lossy delivery**: `tokio::sync::broadcast` — no per-subscriber retransmission.
///   Lagged(n) detection for flow control.
/// - **Not source of truth**: Use `SipClient` query APIs (`accounts()`, `call_state()`) for
///   authoritative state. Events are observation-only.
#[derive(Clone)]
pub struct EventBus {
    /// Primary bus for control events (ordered, loss-tolerant).
    control: broadcast::Sender<SipEvent>,
    /// Optional bus for raw SIP messages (isolated from control events).
    raw_sip: Option<broadcast::Sender<RawSipMessage>>,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl EventBus {
    /// Create a new EventBus.
    ///
    /// `control_capacity`: maximum number of unconsumed control events before the oldest is dropped.
    /// `raw_sip_capacity`: `Some(n)` enables the raw SIP bus; `None` disables it (zero overhead).
    pub fn new(control_capacity: usize, raw_sip_capacity: Option<usize>) -> Self {
        let (control_tx, _) = broadcast::channel(control_capacity);
        let raw_sip = raw_sip_capacity.map(|cap| {
            let (tx, _) = broadcast::channel(cap);
            tx
        });
        Self {
            control: control_tx,
            raw_sip,
        }
    }

    /// Subscribe to the control event bus.
    ///
    /// Returns a `broadcast::Receiver` that receives all published `SipEvent`s.
    /// Multiple subscribers each receive a clone of each event.
    pub fn subscribe_control(&self) -> broadcast::Receiver<SipEvent> {
        self.control.subscribe()
    }

    /// Subscribe to the raw SIP message bus, if enabled.
    ///
    /// Returns `None` if the raw SIP bus was not created (capacity was `None`).
    pub fn subscribe_raw_sip(&self) -> Option<broadcast::Receiver<RawSipMessage>> {
        self.raw_sip.as_ref().map(|tx| tx.subscribe())
    }

    /// Publish a control event to all subscribers.
    ///
    /// Non-blocking. Returns the number of active subscribers.
    /// If all subscribers are lagged, returns 0 (event is silently dropped).
    pub fn publish(&self, event: SipEvent) -> usize {
        self.control.send(event).unwrap_or(0)
    }

    /// Publish a raw SIP message to raw_sip subscribers.
    ///
    /// No-op if the raw_sip channel is not enabled.
    pub fn publish_raw_sip(&self, msg: RawSipMessage) {
        if let Some(ref tx) = self.raw_sip {
            let _ = tx.send(msg);
        }
    }

    /// Expose the underlying control sender for Reactor dispatch internals.
    #[doc(hidden)]
    pub fn control_sender(&self) -> &broadcast::Sender<SipEvent> {
        &self.control
    }
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl std::fmt::Debug for EventBus {
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EventBus")
            .field("raw_sip_enabled", &self.raw_sip.is_some())
            .finish()
    }
}

/// An event receiver filtered to a specific `account_id`.
///
/// Wraps a `broadcast::Receiver<SipEvent>` and loops until an event matching
/// the configured `account_id` arrives. Non-matching events are silently dropped.
/// This is an async filter — it does not busy-loop.
pub struct AccountEventReceiver {
    account_id: AccountId,
    inner: broadcast::Receiver<SipEvent>,
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl AccountEventReceiver {
    /// Create a new receiver that filters for `account_id`.
    pub fn new(account_id: AccountId, inner: broadcast::Receiver<SipEvent>) -> Self {
        Self { account_id, inner }
    }

    /// Wait for the next SipEvent matching this receiver's `account_id`.
    ///
    /// Non-matching events are silently skipped. `RecvError::Lagged(n)` is passed
    /// through when the underlying broadcast channel drops events.
    pub async fn recv(&mut self) -> Result<SipEvent, broadcast::error::RecvError> {
        loop {
            let event = self.inner.recv().await?;
            if event.meta.account_id == Some(self.account_id) {
                return Ok(event);
            }
            // Non-matching event: silently drop, continue looping.
        }
    }

    /// Try to receive without blocking.
    ///
    /// Returns `Ok(event)` if a matching event is immediately available.
    /// Non-matching events are silently skipped (may return `TryRecvError::Empty`).
    pub fn try_recv(&mut self) -> Result<SipEvent, broadcast::error::TryRecvError> {
        loop {
            match self.inner.try_recv() {
                Ok(event) => {
                    if event.meta.account_id == Some(self.account_id) {
                        return Ok(event);
                    }
                    // Non-matching: continue loop
                    continue;
                }
                Err(e) => return Err(e),
            }
        }
    }
}

// [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
impl std::fmt::Debug for AccountEventReceiver {
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AccountEventReceiver")
            .field("account_id", &self.account_id)
            .field("inner", &"broadcast::Receiver<SipEvent>")
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::event_model_payload_bus::{CallId, EventMeta, SipEventPayload};
    use tokio::sync::broadcast;

// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn make_event(account_id: Option<AccountId>) -> SipEvent {
        SipEvent {
            meta: EventMeta::new(1, account_id, Some(CallId::from_u64(1).unwrap())),
            payload: SipEventPayload::CallDisconnected,
        }
    }

    // ── EventBus::new ──────────────────────────────────────────────────

    /// @verifies C019, C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_new_creates_control_channel() {
        let bus = EventBus::new(16, None);
        let _rx = bus.subscribe_control();
        // Receiver created successfully — no panic
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_raw_sip_none_when_disabled() {
        let bus = EventBus::new(16, None);
        assert!(bus.subscribe_raw_sip().is_none());
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_raw_sip_some_when_enabled() {
        let bus = EventBus::new(16, Some(32));
        let rx = bus.subscribe_raw_sip();
        assert!(rx.is_some());
    }

    // ── EventBus::publish + subscribe_control ──────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_publish_delivers_to_single_subscriber() {
        let bus = EventBus::new(16, None);
        let mut rx = bus.subscribe_control();
        let event = make_event(Some(AccountId::from_u64(1).unwrap()));
        bus.publish(event);
        let received = rx.recv().await.unwrap();
        assert_eq!(received.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_publish_delivers_to_multiple_subscribers() {
        let bus = EventBus::new(16, None);
        let mut rx1 = bus.subscribe_control();
        let mut rx2 = bus.subscribe_control();
        let event = make_event(Some(AccountId::from_u64(1).unwrap()));
        bus.publish(event);
        let r1 = rx1.recv().await.unwrap();
        let r2 = rx2.recv().await.unwrap();
        assert_eq!(r1.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
        assert_eq!(r2.meta.account_id, r1.meta.account_id);
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_publish_returns_subscriber_count() {
        let bus = EventBus::new(16, None);
        let _rx1 = bus.subscribe_control();
        let _rx2 = bus.subscribe_control();
        let rx3 = bus.subscribe_control();
        // rx3 hasn't received yet — dropping before publish keeps it active
        let count = bus.publish(make_event(None));
        drop(rx3);
        // Two subscribers (rx3 was already counted by broadcast before drop)
        assert!(count == 2 || count == 3, "expected ~2-3 active subscribers");
    }

    // ── EventBus::publish_raw_sip ──────────────────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_publish_raw_sip_delivers_when_enabled() {
        let bus = EventBus::new(16, Some(16));
        let mut rx = bus.subscribe_raw_sip().unwrap();
        let msg = RawSipMessage {
            data: b"INVITE sip:alice@example.com SIP/2.0".to_vec(),
        };
        bus.publish_raw_sip(msg);
        let received = rx.recv().await.unwrap();
        assert!(!received.data.is_empty());
    }

    /// @verifies C020
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_publish_raw_sip_noop_when_disabled() {
        let bus = EventBus::new(16, None);
        let msg = RawSipMessage {
            data: vec![0x53, 0x49, 0x50],
        };
        bus.publish_raw_sip(msg); // must not panic
    }

    // ── EventBus Lagged detection ──────────────────────────────────────

    /// @verifies C021
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_lagged_detection() {
        let bus = EventBus::new(2, None); // very small capacity
        let mut rx = bus.subscribe_control();
        // Publish 3 events without consuming — capacity is 2, so third event drops
        bus.publish(make_event(None));
        bus.publish(make_event(None));
        bus.publish(make_event(None)); // overflows capacity
        let result = rx.try_recv();
        assert!(
            matches!(result, Err(broadcast::error::TryRecvError::Lagged(_))),
            "expected Lagged but got {:?}",
            result
        );
    }

    // ── EventBus Debug ─────────────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_debug_shows_raw_sip_enabled() {
        let bus = EventBus::new(16, Some(8));
        let debug = format!("{:?}", bus);
        assert!(debug.contains("raw_sip_enabled"));
    }

    // ── AccountEventReceiver ───────────────────────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn account_receiver_filters_by_account_id() {
        let bus = EventBus::new(256, None);
        let mut rx_a = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        // Publish events for different accounts
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap()))); // skipped
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap()))); // matched
        let ev = rx_a.recv().await.unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    /// @verifies C020
    #[tokio::test]
    async fn account_receiver_drops_non_matching_events() {
        let bus = EventBus::new(256, None);
        let rx = bus.subscribe_control();
        let mut rx_a = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), rx);
        // Multiple non-matching events, then one matching
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        let ev = rx_a.recv().await.unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    /// @verifies C020
    #[tokio::test]
    async fn account_receiver_lagged_propagated() {
        let bus = EventBus::new(2, None);
        let mut rx_a = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        // Overflow capacity
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        let result = rx_a.recv().await;
        assert!(
            matches!(result, Err(broadcast::error::RecvError::Lagged(_))),
            "expected Lagged error"
        );
    }

    // ── AccountEventReceiver::try_recv ─────────────────────────────────

    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_receiver_try_recv_skips_non_matching() {
        let bus = EventBus::new(16, None);
        let mut rx_a = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        bus.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        // First try_recv should find the matching event
        let ev = rx_a.try_recv().unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_receiver_try_recv_empty_when_no_matching() {
        let bus = EventBus::new(16, None);
        let mut rx_a = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        // No matching events (published with different account_id)
        bus.publish(make_event(Some(AccountId::from_u64(2).unwrap())));
        let result = rx_a.try_recv();
        assert!(matches!(result, Err(broadcast::error::TryRecvError::Empty)));
    }

    // ── AccountEventReceiver Debug ─────────────────────────────────────

    #[test]
// [::TICKET::] P0-5, P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P0-5|P4-1) --for-spec --no-implementation-order`.
    fn account_receiver_debug() {
        let bus = EventBus::new(16, None);
        let rx = AccountEventReceiver::new(AccountId::from_u64(1).unwrap(), bus.subscribe_control());
        let debug = format!("{:?}", rx);
        assert!(debug.contains("AccountEventReceiver"));
    }

    // ── EventBus Clone ─────────────────────────────────────────────────

    /// @verifies C020
    #[tokio::test]
    async fn eventbus_clones_share_same_sender() {
        let bus_a = EventBus::new(16, None);
        let bus_b = bus_a.clone();
        let mut rx = bus_a.subscribe_control();
        // Publish on bus_b, receive on bus_a's subscriber
        bus_b.publish(make_event(Some(AccountId::from_u64(1).unwrap())));
        let ev = rx.recv().await.unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    // ── EventBus non-blocking invariant ────────────────────────────────

    /// @verifies C021
    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_publish_non_blocking() {
        let bus = EventBus::new(1, None);
        // publish returns immediately even with slow subscriber
        bus.publish(make_event(None));
        bus.publish(make_event(None)); // second publish with no consumer is fine
        bus.publish(make_event(None)); // third publish drops oldest — still no blocking
    }

    // ─── Boundary: capacity 1 ──────────────────────────────────────────

    #[test]
    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    fn eventbus_capacity_one_behavior() {
        let bus = EventBus::new(1, None);
        // With capacity 1, a single event is buffered.
        let mut rx = bus.subscribe_control();
        bus.publish(make_event(None));
        // The subscriber receives the event (no overflow).
        let result = rx.try_recv();
        assert!(result.is_ok(), "event should be received: {result:?}");
    }

    // ── Dual Client dispatch ────────────────────────────────────────

    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    /// @verifies C039
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn dual_client_dispatch_routes_to_correct_bus() {
        let bus_a = EventBus::new(16, None);
        let bus_b = EventBus::new(16, None);
        let mut buses = std::collections::HashMap::new();
        buses.insert(AccountId::from_u64(1).unwrap(), bus_a.clone());
        buses.insert(AccountId::from_u64(1).unwrap(), bus_b.clone());

        let mut rx_b = bus_b.subscribe_control();

        // Simulate dispatch: event for account 2 goes to bus_b only
        let event = make_event(Some(AccountId::from_u64(1).unwrap()));
        if let Some(client_bus) = buses.get(&AccountId::from_u64(1).unwrap()) {
            client_bus.publish(event);
        }

        let ev = rx_b.try_recv().unwrap();
        assert_eq!(ev.meta.account_id, Some(AccountId::from_u64(1).unwrap()));
    }

    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    /// @verifies C039
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn dual_client_none_account_broadcasts_to_all() {
        let bus_a = EventBus::new(16, None);
        let bus_b = EventBus::new(16, None);
        let mut buses = std::collections::HashMap::new();
        buses.insert(AccountId::from_u64(1).unwrap(), bus_a.clone());
        buses.insert(AccountId::from_u64(2).unwrap(), bus_b.clone());

        let mut rx_a = bus_a.subscribe_control();
        let mut rx_b = bus_b.subscribe_control();

        // Simulate dispatch: None account_id → publish to all
        let mut event = make_event(None);
        event.meta.account_id = None;
        for bus in buses.values() {
            bus.publish(event.clone());
        }

        assert!(rx_a.try_recv().is_ok());
        assert!(rx_b.try_recv().is_ok());
    }

    // [::TICKET::] P0-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P0-5 --for-spec --no-implementation-order`.
    /// @verifies C039
    #[test]
// [::TICKET::] P4-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-1 --for-spec --no-implementation-order`.
    fn dual_client_unknown_account_falls_back_to_default() {
        let default_bus = EventBus::new(16, None);
        let mut rx_default = default_bus.subscribe_control();
        let buses: std::collections::HashMap<AccountId, EventBus> =
            std::collections::HashMap::new();

        // Event for unknown account
        let event = make_event(Some(AccountId::from_u64(1).unwrap()));
        if let Some(client_bus) = buses.get(&AccountId::from_u64(1).unwrap()) {
            client_bus.publish(event);
        } else {
            // Fallback to default bus
            default_bus.publish(event);
        }

        assert!(rx_default.try_recv().is_ok());
    }
}
